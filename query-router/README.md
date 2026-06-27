# Replic8 – Distributed PostgreSQL Cluster with Intelligent Query Routing (Query Router)

Query Router is a small Node.js Express service that accepts SQL over REST, classifies each statement, and sends it to the correct PostgreSQL pool.

## Query Classification

Routing decisions are made by `src/routing/queryClassifier.js`. The guiding rule
is that a write must never reach a read-only replica, so ambiguous cases are
resolved conservatively toward the primary.

| Statement | Routed to | Notes |
| --- | --- | --- |
| `SELECT` / `TABLE` / `VALUES` | replica | Plain reads. |
| `SELECT ... FOR UPDATE/SHARE` | primary | Locking reads need a writable session (still classified as a READ). |
| `WITH ...` (read-only CTE) | replica | |
| `WITH ...` containing `INSERT/UPDATE/DELETE/MERGE` | primary | Data-modifying CTEs are writes. |
| `SHOW`, plain `EXPLAIN <read>` | replica | |
| `EXPLAIN ANALYZE ...` | primary | `ANALYZE` actually executes the statement. |
| `INSERT/UPDATE/DELETE/MERGE`, DDL, DCL, maintenance | primary | |
| `BEGIN/COMMIT/ROLLBACK/SAVEPOINT/...` | rejected | See limitation below. |
| Unknown statement verb | rejected | Fails loudly rather than guessing. |

**Limitation — multi-statement transactions:** the router executes each request
on a pooled connection and does not pin a client to a single backend session, so
it cannot guarantee `BEGIN; ...; COMMIT` runs on one connection. Transaction
control statements are therefore rejected with a clear error instead of being
silently split across connections.

## Routing Workflow & Failover

1. The monitor probes every cluster node every 5 seconds.
2. It captures CPU, memory, active connection, and query-latency data.
3. Node connection pool errors (`Unexpected error on idle client`) are caught and logged cleanly, preventing process crashes when database nodes go down.
4. Each replica is classified as `Healthy`, `Warning`, or `Down`.
5. `Down` replicas are removed from the read routing pool immediately.
6. SQL requests are classified as read or write.
7. Read queries go to the lowest-scoring active replica.
8. Write queries go to the active primary.
9. If the active primary goes down, the monitor evaluates the healthiest replica, runs `SELECT pg_promote(false)` to promote it to primary, and shifts all write traffic dynamically.
10. Every status change and failover event is broadcast over WebSocket so the dashboard updates immediately.


## Scoring Algorithm

Each replica starts with a score of `0`, and lower is better. The monitor normalizes the latest metrics to values between `0` and `1`, then combines them with weights:

`score = cpuWeight * cpuPressure + memoryWeight * memoryPressure + connectionWeight * connectionPressure + latencyWeight * latencyPressure`

Where:

- `cpuPressure = cpuPercent / 100`
- `memoryPressure = memoryPercent / 100`
- `connectionPressure = min(activeConnections / connectionCap, 1)`
- `latencyPressure = min(averageLatencyMs / latencyTargetMs, 1)`

Replicas are marked stale when no fresh metrics arrive within the configured threshold. Stale replicas are deprioritized behind healthy replicas. On each successful read query, the router updates that replica's latency average so the score reflects live traffic, not only background probes.

## Cluster Metrics

The cluster snapshot broadcast over WebSocket and used by the dashboard reports
measured values, not placeholders:

- **Replication lag** is collected per replica during each monitor sweep. The
  time lag comes from `now() - pg_last_xact_replay_timestamp()` on the standby,
  and the byte lag is `pg_current_wal_lsn()` (primary) minus
  `pg_last_wal_replay_lsn()` (replica), computed in `src/utils/lsn.js`. A
  fully caught-up replica reports `0`.
- **Query latency percentiles (p50/p95/p99)** and **requests-per-second** are
  derived from a sliding window of every routed query (`src/monitoring/queryStats.js`),
  recorded by the pool router on each successful execution.

## Folder Structure

- `src/app.js`: builds the Express application and registers middleware.
- `src/server.js`: starts the HTTP server.
- `src/config/`: environment loading and PostgreSQL pool creation.
- `src/routing/`: SQL classification and pool selection.
- `src/monitoring/`: replica polling, metric collection, and score computation.
- `src/controllers/`: request handling and query execution.
- `src/routes/`: REST endpoint definitions.
- `src/middleware/`: error handling.

## API

- `POST /query`: accepts `{ "sql": "SELECT ..." }` or plain text SQL.
- `GET /health`: returns service status.
- `GET /metrics`: exposes Prometheus metrics for query latency, routing counts, and replica scoring.

### Authentication

`POST /query` and the metrics WebSocket (`/ws/cluster`) are protected by an
optional API key. Set `API_KEY` to enable it:

- HTTP: send `Authorization: Bearer <key>` or `X-API-Key: <key>`. A missing or
  wrong key returns `401`.
- WebSocket: pass `?token=<key>` on the connection URL (browsers cannot set
  custom WebSocket headers).

When `API_KEY` is empty the service runs unauthenticated and logs a warning at
startup. `GET /health` and `GET /metrics` are intentionally left open so
Prometheus can scrape the router on the internal network. The key is compared in
constant time (`src/middleware/auth.js`).

## Deployment

The service is intended to run inside the same Docker Compose network as the PostgreSQL cluster so it can resolve `postgres-primary`, `postgres-replica-1`, and `postgres-replica-2` by name.

The Query Router also mounts the Docker socket so it can inspect container-level CPU and memory usage for each replica.

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the router. |
| `npm test` | Run the unit test suite (Node's built-in runner). See [TESTING.md](TESTING.md). |
| `npm run test:watch` | Re-run tests on change. |
| `npm run test:coverage` | Tests with a coverage summary. |
| `npm run seed:data` | Create and seed the demo `users` table on the primary. |
| `npm run bench:seed` | Seed the `bench_items` table for load testing. |
| `npm run bench` | Mixed read/write load test. See [BENCHMARKS.md](BENCHMARKS.md). |
| `npm run bench:failover` | Measure the failover window while a node is taken down. |

## Operational Behavior

- **Graceful shutdown.** On `SIGTERM`/`SIGINT` the service stops the monitor loop,
  closes WebSocket clients, stops accepting new HTTP connections, and drains the
  PostgreSQL pools before exiting (with a 10s forced-exit safety net).
- **Connection pooling.** Pools are bounded by `POOL_MAX` with a
  `POOL_CONNECTION_TIMEOUT_MS` acquire timeout and a 2s `query_timeout`, so a slow
  or unreachable node fails fast and is rerouted instead of blocking the service.

## Continuous Integration

The repository's GitHub Actions workflow (`.github/workflows/ci.yml`) runs these
unit tests, builds the dashboard, and builds the Docker images on every push and
pull request.