#!/bin/sh
set -eu

: "${POSTGRES_USER:=postgres}"
: "${POSTGRES_DB:=appdb}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${REPLICATION_USER:=replicator}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD is required}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA"
  chmod 700 "$PGDATA"

  initdb -D "$PGDATA" --username="$POSTGRES_USER" --auth-local=trust --auth-host=scram-sha-256

  {
    echo "host replication $REPLICATION_USER 0.0.0.0/0 scram-sha-256"
    echo "host all all 0.0.0.0/0 scram-sha-256"
  } >> "$PGDATA/pg_hba.conf"

  pg_ctl -D "$PGDATA" -o "-c listen_addresses='localhost'" -w start

  psql --username="$POSTGRES_USER" --dbname=postgres --command="ALTER USER \"$POSTGRES_USER\" WITH PASSWORD '$POSTGRES_PASSWORD';"

  if psql --username="$POSTGRES_USER" --dbname=postgres --tuples-only --no-align --command="SELECT 1 FROM pg_roles WHERE rolname = '$REPLICATION_USER';" | grep -q 1; then
    psql --username="$POSTGRES_USER" --dbname=postgres --command="ALTER ROLE \"$REPLICATION_USER\" WITH REPLICATION LOGIN PASSWORD '$REPLICATION_PASSWORD';"
  else
    psql --username="$POSTGRES_USER" --dbname=postgres --command="CREATE ROLE \"$REPLICATION_USER\" WITH REPLICATION LOGIN PASSWORD '$REPLICATION_PASSWORD';"
  fi

  if ! psql --username="$POSTGRES_USER" --dbname=postgres --tuples-only --no-align --command="SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB';" | grep -q 1; then
    createdb --username="$POSTGRES_USER" --owner="$POSTGRES_USER" "$POSTGRES_DB"
  fi

  pg_ctl -D "$PGDATA" -m fast -w stop
fi

exec postgres -D "$PGDATA" \
  -c listen_addresses='*' \
  -c wal_level=replica \
  -c max_wal_senders=10 \
  -c max_replication_slots=10 \
  -c wal_keep_size=256MB \
  -c hot_standby=on