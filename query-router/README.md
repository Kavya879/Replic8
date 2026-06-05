# Replic8 – Distributed PostgreSQL Cluster with Intelligent Query Routing (Query Router)

Query Router is a small Node.js Express service that accepts SQL over REST, classifies each statement, and sends it to the correct PostgreSQL pool.

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

## Deployment

The service is intended to run inside the same Docker Compose network as the PostgreSQL cluster so it can resolve `postgres-primary`, `postgres-replica-1`, and `postgres-replica-2` by name.

The Query Router also mounts the Docker socket so it can inspect container-level CPU and memory usage for each replica.