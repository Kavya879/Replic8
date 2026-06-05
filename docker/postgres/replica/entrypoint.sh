#!/bin/sh
set -eu

: "${PRIMARY_HOST:?PRIMARY_HOST is required}"
: "${PRIMARY_PORT:=5432}"
: "${REPLICATION_USER:=replicator}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD is required}"
: "${HOME:=/var/lib/postgresql}"
: "${POSTGRES_USER:=postgres}"
: "${POSTGRES_DB:=appdb}"
: "${POSTGRES_PASSWORD:=change-me-primary-password}"

# Determine active primary in the cluster dynamically
ACTIVE_PRIMARY=""
MY_HOST=$(hostname)
for host in postgres-primary postgres-replica-1 postgres-replica-2; do
  # Skip checking ourselves
  if [ "$host" = "$MY_HOST" ] || [ "$host" = "${MY_HOST}-1" ] || echo "$MY_HOST" | grep -q "$host"; then
    continue
  fi

  echo "Checking if $host is the active Primary..."
  attempt=1
  while [ $attempt -le 3 ]; do
    if res=$(PGCONNECT_TIMEOUT=2 PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$host" -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "SELECT pg_is_in_recovery();" -v ON_ERROR_STOP=1 2>&1); then
      status=0
    else
      status=$?
    fi
    if [ $status -eq 0 ] && [ "$res" = "f" ]; then
      echo "Found active primary: $host"
      ACTIVE_PRIMARY="$host"
      break 2
    fi
    if echo "$res" | grep -q -E "could not connect|Connection refused|timeout"; then
      break
    fi
    sleep 0.5
    attempt=$((attempt + 1))
  done
done

if [ -n "$ACTIVE_PRIMARY" ]; then
  echo "Using active primary: $ACTIVE_PRIMARY"
  PRIMARY_HOST="$ACTIVE_PRIMARY"
else
  echo "No active primary found in other nodes. Defaulting to $PRIMARY_HOST"
fi

if [ -s "$PGDATA/PG_VERSION" ] && [ ! -f "$PGDATA/standby.signal" ]; then
  echo "Standby signal missing (replica was likely promoted). Checking primary health at $PRIMARY_HOST..."
  if PGCONNECT_TIMEOUT=2 PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "SELECT pg_is_in_recovery();" -v ON_ERROR_STOP=1 2>/dev/null | grep -q "f"; then
    echo "Primary is active. Re-cloning data directory from primary..."
    rm -rf "$PGDATA"/*
  fi
fi

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA"
  chmod 700 "$PGDATA"

  printf '%s:%s:*:%s:%s\n' "$PRIMARY_HOST" "$PRIMARY_PORT" "$REPLICATION_USER" "$REPLICATION_PASSWORD" > "$HOME/.pgpass"
  chmod 600 "$HOME/.pgpass"
  export PGPASSFILE="$HOME/.pgpass"

  rm -rf "$PGDATA"/*

  PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup \
    -h "$PRIMARY_HOST" \
    -p "$PRIMARY_PORT" \
    -U "$REPLICATION_USER" \
    -D "$PGDATA" \
    -Fp \
    -Xs \
    -P \
    -R
fi

exec postgres -D "$PGDATA" \
  -c listen_addresses='*' \
  -c hot_standby=on