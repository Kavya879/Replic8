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

: "${HOME:=/var/lib/postgresql}"

# Check if another replica has been promoted to Primary (with retries for DNS/network readiness)
PROMOTE_HOST=""
for host in postgres-replica-1 postgres-replica-2; do
  echo "Checking if replica $host is currently the promoted Primary..."
  attempt=1
  while [ $attempt -le 5 ]; do
    # Capture both output and error safely under set -e
    if res=$(PGCONNECT_TIMEOUT=2 PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$host" -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "SELECT pg_is_in_recovery();" -v ON_ERROR_STOP=1 2>&1); then
      status=0
    else
      status=$?
    fi
    if [ $status -eq 0 ] && [ "$res" = "f" ]; then
      echo "Found promoted primary replica: $host"
      PROMOTE_HOST="$host"
      break 2
    fi
    echo "Attempt $attempt to contact $host failed. Status: $status. Output/Error: $res. Retrying in 1s..."
    sleep 1
    attempt=$((attempt + 1))
  done
done

if [ -n "$PROMOTE_HOST" ]; then
  echo "Rejoining cluster as a replica of $PROMOTE_HOST..."
  
  # Configure pgpass
  mkdir -p "$HOME"
  printf '%s:%s:*:%s:%s\n' "$PROMOTE_HOST" "5432" "$REPLICATION_USER" "$REPLICATION_PASSWORD" > "$HOME/.pgpass"
  chmod 600 "$HOME/.pgpass"
  export PGPASSFILE="$HOME/.pgpass"
  
  # Clear existing data directory
  rm -rf "$PGDATA"/*
  
  # Run pg_basebackup to sync data and write standby configuration (-R)
  PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup \
    -h "$PROMOTE_HOST" \
    -p 5432 \
    -U "$REPLICATION_USER" \
    -D "$PGDATA" \
    -Fp \
    -Xs \
    -R
    
  echo "Sync complete. Starting as replica."
fi

exec postgres -D "$PGDATA" \
  -c listen_addresses='*' \
  -c wal_level=replica \
  -c max_wal_senders=10 \
  -c max_replication_slots=10 \
  -c wal_keep_size=256MB \
  -c hot_standby=on