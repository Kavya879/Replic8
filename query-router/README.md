# Query Router

Query Router is a small Node.js Express service that accepts SQL over REST, classifies each statement, and sends it to the correct PostgreSQL pool.

## Routing Workflow

1. A client sends SQL to `POST /query`.
2. The service normalizes the statement by trimming whitespace and skipping leading comments.
3. The classifier inspects the first executable keyword.
4. `SELECT` queries are marked as read-only and routed to a replica pool.
5. The service continuously monitors each replica by collecting CPU, memory, active connection, and query-latency metrics.
6. A weighted score is calculated for every replica on each monitoring cycle.
7. The replica with the lowest score receives the next read query.
8. `INSERT`, `UPDATE`, and `DELETE` queries are marked as write operations and routed to the primary pool.
9. The controller runs the query through the selected `pg.Pool` and returns the database response as JSON.
10. If the selected replica fails, the router falls back to the next lowest-scoring replica before failing the request.

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

## Deployment

The service is intended to run inside the same Docker Compose network as the PostgreSQL cluster so it can resolve `postgres-primary`, `postgres-replica-1`, and `postgres-replica-2` by name.

The Query Router also mounts the Docker socket so it can inspect container-level CPU and memory usage for each replica.