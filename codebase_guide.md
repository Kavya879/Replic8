# 🗺️ Codebase Guide: Replic8 – Distributed PostgreSQL Cluster with Intelligent Query Routing

Here is a simple, easy-to-read guide explaining what each file in this project does.

---

## 🗄️ Database Configurations

### 1. [docker-compose.yml](file:///c:/Users/freeb/Desktop/NewProj/docker-compose.yml)
- **What it is**: The conductor of the project.
- **What it does**: Defines and configures all 7 docker containers: the primary database, two replicas, the query router, Prometheus, and the Postgres exporters. It mounts volumes and networks to keep data safe and private.

### 2. [entrypoint.sh (Primary)](file:///c:/Users/freeb/Desktop/NewProj/docker/postgres/primary/entrypoint.sh)
- **What it does**: Runs when the Primary database container starts. It initializes the database folder, configures replication permissions in `pg_hba.conf`, and starts the database.

### 3. [entrypoint.sh (Replica)](file:///c:/Users/freeb/Desktop/NewProj/docker/postgres/replica/entrypoint.sh)
- **What it does**: Runs when each Replica database starts. It deletes any old data, copies the primary database layout, sets up replication credentials, and starts Postgres in "hot standby" mode so it can stream updates in real-time.

---

## 🔀 Query Router (`query-router/`)

### 1. [server.js](file:///c:/Users/freeb/Desktop/NewProj/query-router/src/server.js)
- **What it does**: The entry point for the query router backend. It initializes the database pools, starts the monitoring loop, creates the query router proxy, and spins up the WebSocket server to stream metrics to the dashboard.

### 2. [app.js](file:///c:/Users/freeb/Desktop/NewProj/query-router/src/app.js)
- **What it does**: Sets up the Express server, defines the `/health` and `/metrics` (Prometheus) endpoints, and configures the Prometheus client to track statistics.

### 3. [pools.js](file:///c:/Users/freeb/Desktop/NewProj/query-router/src/config/pools.js)
- **What it does**: Configures the connection pools for node-postgres. It enforces a 2-second **query timeout** to ensure queries reject promptly if a node crashes.

### 4. [replicaMonitor.js](file:///c:/Users/freeb/Desktop/NewProj/query-router/src/monitoring/replicaMonitor.js)
- **What it does**: The brain of the health checks. It executes pings against database nodes, fetches Docker metrics, computes their performance scores, resets metrics to `0` when a node goes down, and sends WebSocket updates to the UI.

### 5. [dockerMetrics.js](file:///c:/Users/freeb/Desktop/NewProj/query-router/src/monitoring/dockerMetrics.js)
- **What it does**: Talks to the Docker engine via `/var/run/docker.sock` to extract real-time CPU and Memory stats for the database replica containers.

### 6. [replicaScorer.js](file:///c:/Users/freeb/Desktop/NewProj/query-router/src/routing/replicaScorer.js)
- **What it does**: Calculates the load-balancing score of replicas using configured weights (CPU, memory, connection counts, and ping latency).

### 7. [poolRouter.js](file:///c:/Users/freeb/Desktop/NewProj/query-router/src/routing/poolRouter.js)
- **What it does**: Inspects queries. If they are reads (`SELECT`), it queries the best-scoring replica. If they are writes, it targets the primary. It retries automatically on another node if a replica fails.

### 8. [queryController.js](file:///c:/Users/freeb/Desktop/NewProj/query-router/src/controllers/queryController.js)
- **What it does**: Receives HTTP API query requests, validates them, and hands them off to `poolRouter` for execution.

---

## 📊 Next.js Dashboard (`dashboard/`)

### 1. [use-realtime-metrics.js](file:///c:/Users/freeb/Desktop/NewProj/dashboard/lib/hooks/use-realtime-metrics.js)
- **What it does**: A React hook that maintains a WebSocket connection to the query router. If the query router goes down, it automatically attempts to reconnect every 2 seconds.

### 2. [status-pill.jsx](file:///c:/Users/freeb/Desktop/NewProj/dashboard/components/metrics/status-pill.jsx)
- **What it does**: A React component that displays node statuses (Healthy, Warning, Down) using color-coded cards and pills.

### 3. [page.jsx (Overview)](file:///c:/Users/freeb/Desktop/NewProj/dashboard/app/(dashboard)/overview/page.jsx)
- **What it does**: The main overview page showing cluster stats (CPU, Memory, Connections, Lag), status cards, and the real-time CPU trend graph.

### 4. [page.jsx (Cluster Health)](file:///c:/Users/freeb/Desktop/NewProj/dashboard/app/(dashboard)/cluster-health/page.jsx)
- **What it does**: Shows a grid layout of all replica nodes, their individual resource metrics, status, and computed load-balancing scores.

---

## 🧩 Additional Modules & Tooling

### Query Router internals
- **`src/routing/queryClassifier.js`**: Safe read/write classification. Sends locking reads (`FOR UPDATE/SHARE`) and data-modifying CTEs to the primary, classifies `EXPLAIN` by the statement it wraps, and rejects transaction-control and unknown statements rather than guessing.
- **`src/middleware/auth.js`**: Optional API-key authentication (constant-time comparison) for `POST /query` and the metrics WebSocket. Open mode with a startup warning when no key is set.
- **`src/monitoring/queryStats.js`**: Sliding-window tracker that produces real p50/p95/p99 query latency and requests-per-second.
- **`src/utils/lsn.js`**: PostgreSQL LSN parsing and byte-distance math used for real replication-lag-in-bytes.
- **`src/utils/percentile.js`**: Shared linear-interpolation percentile helper.

### Tests (`query-router/tests/`)
- Unit tests for the classifier, scorer, pool router, monitor, query stats, LSN math, and auth. Run with `npm test`. See `TESTING.md`.

### Benchmarks (`query-router/benchmarks/`)
- `seed.js`, `loadtest.js`, `failover.js` — throughput, latency percentiles, and failover-window measurement. See `BENCHMARKS.md`.

### Scripts (`query-router/scripts/`)
- `seed-data.js` — creates and seeds the demo `users` table on the primary (`npm run seed:data`).

### Monitoring & CI
- **`monitoring/grafana/`**: Provisioned Grafana datasource and the "Replic8 – Query Router Overview" dashboard.
- **`.github/workflows/ci.yml`**: Runs unit tests, the dashboard build, and Docker image builds on every push and pull request.
