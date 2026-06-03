# PostgreSQL 16 Streaming Replication Cluster

This workspace contains the Docker deployment for a PostgreSQL 16 cluster plus a Node.js Express query-routing service.

## Topology

The Compose stack starts three PostgreSQL 16 containers:

- `postgres-primary`: the writable primary node that accepts client writes and streams WAL changes.
- `postgres-replica-1`: a read-only standby that continuously replays WAL from the primary.
- `postgres-replica-2`: a second read-only standby with the same replication setup.

All three containers run on a private Docker network named `pg-cluster`. No ports are published to the host, so the cluster is reachable only from other containers on that network unless you add port mappings later.

The `query-router` service joins the same network and exposes a REST API on host port `3000` so clients can submit SQL without talking directly to the database nodes.

Prometheus, node exporter, and PostgreSQL exporters are added alongside the database and router services so the whole stack can be observed from one place.

## Folder Structure

- `docker-compose.yml`: defines the cluster services, private network, and persistent volumes.
- `.env.example`: placeholder values for the PostgreSQL and replication credentials.
- `query-router/`: Node.js Express service that classifies SQL and routes it to the correct PostgreSQL pool.
- `monitoring/prometheus.yml`: Prometheus scrape targets for the router and exporters.
- `docker/postgres/primary/`: build context and startup logic for the primary container.
- `docker/postgres/replica/`: build context and startup logic for the replica containers.

## Container Responsibilities

`postgres-primary`

- Initializes the database cluster on first start.
- Creates the replication user.
- Configures PostgreSQL for streaming replication with WAL sender support.
- Stores its data in the `pg-primary-data` Docker volume.

`postgres-replica-1` and `postgres-replica-2`

- Wait for the primary to become healthy.
- Take a base backup from the primary with `pg_basebackup`.
- Start as hot standbys and keep replaying WAL changes from the primary.
- Store their own copies of data in separate Docker volumes.

## How To Use

1. Copy `.env.example` to `.env` and update the passwords.
2. Start the stack with `docker compose up -d --build`.
3. Check health with `docker compose ps`.

## Replication Model

This setup uses physical streaming replication:

- the primary writes WAL records
- each replica keeps a base backup and continuously replays WAL
- replicas stay read-only unless you later promote one manually

## Monitoring Architecture

Prometheus scrapes four metric sources:

- `query-router:3000/metrics` for query latency, routing counts, and live replica scores.
- `node-exporter:9100` for CPU and RAM metrics from the Docker host.
- `postgres-exporter-primary:9187` for primary database metrics including connection activity.
- `postgres-exporter-replica-1:9187` and `postgres-exporter-replica-2:9187` for replica database metrics including replication lag.

The PostgreSQL exporters are sidecars that speak directly to their assigned database nodes. Query Router owns application-level observability, while node exporter reports machine-level resource utilization.

## Prometheus Flow

1. Prometheus scrapes the exporters on a fixed interval.
2. Node exporter reports CPU and RAM for the Docker host.
3. PostgreSQL exporters report connections and replication lag.
4. Query Router reports query latency and the weighted replica score used for routing.
5. Dashboards and alerts can be built from these metrics without changing the routing path.

## Notes

- The cluster is intentionally isolated on an internal Docker network.
- Persistent volumes keep data across container restarts.
- The query router is intentionally modular so the classifier, pool selection, and HTTP layers can evolve independently.