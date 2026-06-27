# 🐘 Replic8 – Distributed PostgreSQL Cluster with Intelligent Query Routing

A complete, local, production-style database architecture featuring **PostgreSQL 16 streaming replication**, a custom **Node.js dynamic query router**, and a real-time **Next.js monitoring dashboard**. 

This stack is pre-configured to work out of the box (including on Windows/macOS/Linux) to demonstrate automatic load-balancing, live metrics calculation, and automatic replica failover.

---

## ✨ Engineering Highlights

- **Safe read/write routing.** SQL is classified before routing: plain reads go to replicas; writes, locking reads (`SELECT ... FOR UPDATE`), and data-modifying CTEs go to the primary; transaction-control and unknown statements are rejected rather than mis-routed.
- **Weighted, health-aware load balancing.** Each replica gets a live score from CPU, memory, connections, and latency; reads go to the lowest-scoring healthy node.
- **Automatic failover & self-healing.** A crashed primary triggers `pg_promote` on the healthiest replica; a recovered node rejoins as a standby via `pg_basebackup`.
- **Real observability metrics.** True WAL replication lag (time **and** bytes), real query-latency percentiles (p50/p95/p99), and requests-per-second — not placeholders.
- **Optional API-key authentication** on the SQL endpoint and metrics WebSocket (constant-time comparison).
- **Automated quality gates.** 75 dependency-free unit tests, a load/failover benchmark harness, and a GitHub Actions CI pipeline.
- **Operational hygiene.** Graceful shutdown, bounded connection pools with fast-fail timeouts, and provisioned Grafana dashboards.

> 📋 A complete, copy-paste **PowerShell test playbook** for every scenario (failover, recovery, replica loss, auth, benchmarks, etc.) lives in [`TEST_COMMANDS.txt`](TEST_COMMANDS.txt).

---

## 🎯 The Problem It Solves (The "Why")

### 1. The Scaling Bottleneck
In typical web applications, **read queries** (e.g., fetching user profiles, loading dashboards, generating reports) usually outnumber **write queries** (e.g., creating accounts, updating orders) by a wide margin. When a single database server handles both reads and writes:
- Database CPU and memory spike under heavy read load.
- Critical write transactions get queued, slowing down or locking the entire app.

### 2. High Availability & Disaster Recovery
If your single database server crashes, your entire application goes down. 

### 3. How This Project Solves It
This project implements the industry-standard **Primary-Replica** architecture:
*   **The Primary (`postgres-primary`)**: The source of truth. It handles all database writes (`INSERT`, `UPDATE`, `DELETE`, etc.).
*   **The Replicas (`postgres-replica-1`, `postgres-replica-2`)**: Read-only copies that continuously clone the primary database in real-time.
*   **The Query Router (`query-router`)**: A smart proxy that intercepts SQL queries. It automatically parses the SQL:
    *   **Writes** are routed to the Primary.
    *   **Reads** are routed to the most optimal, healthy replica based on live performance metrics (CPU, Memory, Latency, Connections).
*   **Dynamic Failover**: If a replica container crashes, the query router detects it on the next health check and removes it from the read pool. Read queries continue to be served by the remaining healthy replica(s). See [query-router/BENCHMARKS.md](query-router/BENCHMARKS.md) to measure the failover window yourself.

---

## 🏗️ Architecture Overview

```mermaid
graph TD
    Client[Next.js App / Client] -->|Queries| Router[Query Router :3002]
    Router -->|Writes| Primary[(Postgres Primary :15432)]
    Router -->|Reads - Score Balanced| Replica1[(Postgres Replica 1 :15433)]
    Router -->|Reads - Score Balanced| Replica2[(Postgres Replica 2 :15434)]
    
    Primary -.->|Real-time WAL Replication| Replica1
    Primary -.->|Real-time WAL Replication| Replica2
    
    Monitor[Replica Monitor] -->|Health & Docker Stats| Router
    Router -->|Live Cluster Snapshot via WS| Dashboard[Next.js Dashboard :3001]
```

---

## 🛠️ Technology Stack

*   **Databases**: PostgreSQL 16 (configured for WAL replication).
*   **Query Router**: Node.js, Express, `pg` (node-postgres), `ws` (WebSockets), `prom-client` (Prometheus metrics).
*   **Monitoring**: Prometheus (scraping router metrics + `postgres-exporter` container instances), with Grafana dashboards provisioned on top.
*   **Dashboard**: Next.js 15, React 19, TailwindCSS, Recharts.
*   **Quality**: Node.js built-in test runner (unit tests), a custom benchmark harness, and GitHub Actions CI.

---

## ⚡ Quick Start (Replicate the Project)

### Prerequisites
Make sure you have installed:
*   [Docker Desktop](https://www.docker.com/products/docker-desktop/)
*   [Node.js (v18+)](https://nodejs.org/)

---

### Step 1: Clone and Set Up Environment Config
Copy the sample environment file in the root directory:
```powershell
copy .env.example .env
```
Edit `.env` if you want to customize your database names or passwords. By default, it contains pre-configured secure credentials.

---

### Step 2: Spin Up the Docker Stack
Running the following command will build and launch the entire stack:
```powershell
docker compose up -d --build
```
> [!NOTE]
> **Automated Setup**: You do **not** need to manually create the databases or configure replication. The primary database (`postgres-primary`) and both standby read replicas (`postgres-replica-1`, `postgres-replica-2`) are automatically created, configured, and synced with PostgreSQL streaming replication by the Docker Compose startup scripts out of the box.

Verify everything is running correctly:
```powershell
docker compose ps
```
*Expected output: All containers (`postgres-primary`, `postgres-replica-1`, `postgres-replica-2`, `query-router`, `prometheus`, `grafana`, and exporters) are status `running (healthy)`.*

---

### Step 2b: Seed Demo Data (optional but recommended)
Create and populate a sample `users` table on the primary so the example queries below work right away:
```powershell
cd query-router
npm install
npm run seed:data
cd ..
```

### Monitoring with Grafana
Prometheus scrapes the router and exporters, and Grafana is pre-provisioned with a "Replic8 – Query Router Overview" dashboard (throughput, latency percentiles, replica scores, CPU/memory/connections).
- Grafana: [http://localhost:3001](http://localhost:3001) (default login `admin` / `admin`, override with `GRAFANA_USER` / `GRAFANA_PASSWORD`)
- Prometheus: [http://localhost:9090](http://localhost:9090)

---

### Step 3: Run the Dashboard UI
1. Navigate into the dashboard directory:
   ```powershell
   cd dashboard
   ```
2. Install client dependencies:
   ```powershell
   npm install
   ```
3. Run the Next.js development server:
   ```powershell
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser. You will be greeted with the live system dashboard updating in real-time every 5 seconds.

---

## 🚀 How to Use & Test the Project

### 1. Connecting to the Database Cluster
If you use a GUI like **pgAdmin** or **DBeaver**, you can connect to the nodes individually from your host machine using:
*   **Primary Port**: `127.0.0.1:15432`
*   **Replica 1 Port**: `127.0.0.1:15433`
*   **Replica 2 Port**: `127.0.0.1:15434`
*   *Database Name:* `appdb` (or customized in `.env`)
*   *User:* `postgres`

---

### 2. Testing Case 1: Read/Write Routing Verification
The Query Router listens at `http://localhost:3002/query`. You can send SQL queries via POST requests.

#### A. Execute a Write (Routes to Primary)
```powershell
curl -X POST http://localhost:3002/query -H "Content-Type: application/json" -d "{\"sql\": \"INSERT INTO users (name, email) VALUES ('Alice','alice@example.com')\"}"
```
*Response will show `pool: postgres-primary` (or the currently promoted Primary node).*

#### B. Execute a Read (Routes to best Replica)
```powershell
curl -X POST http://localhost:3002/query -H "Content-Type: application/json" -d "{\"sql\": \"SELECT * FROM users\"}"
```
*Response will show `pool: postgres-replica-1` or `postgres-replica-2` depending on which one currently has the lower load score.*

---

### 3. Testing Case 2: Primary Node Failover (Automatic Promotion)
To test high-availability failover when the primary node crashes:
1. **Stop the primary container**:
   ```powershell
   docker compose stop postgres-primary
   ```
2. **Observe the Dashboard**:
   - The dashboard dynamically displays `Primary Down` in red.
   - Within seconds, the Query Router automatically identifies the healthiest standby and promotes it.
   - The Activity Log logs `Primary Down` (error) followed by `Replica 1 Promoted` (info) (or Replica 2).
   - The promoted replica's badge shifts to **Primary (Writes Active)**.
3. **Verify Write Routing**:
   - Send another write query:
     ```powershell
     curl -X POST http://localhost:3002/query -H "Content-Type: application/json" -d "{\"sql\": \"INSERT INTO users (name, email) VALUES ('Bob','bob@example.com')\"}"
     ```
   - Once promotion completes, the write query succeeds and returns `pool: postgres-replica-1` (or whichever replica was promoted). Requests issued during the brief promotion window may error and can be retried.

---

### 4. Testing Case 3: Old Primary Restoration (Rejoining)
When a crashed primary node comes back online, it should rejoin the cluster as a standby replica of the *new* promoted primary:
1. **Start the old primary container**:
   ```powershell
   docker compose start postgres-primary
   ```
2. **Observe Startup Logs**:
   - Run `docker compose logs -f postgres-primary`.
   - The container checks if another replica is currently the promoted Primary, wipes its local data, executes `pg_basebackup -R` from the new primary (`postgres-replica-1` or `postgres-replica-2`), and starts up as a standby replica streaming WAL logs.
3. **Observe the Dashboard**:
   - The Activity Log logs `Primary Restored` (success) followed by `Rejoining Cluster As Replica` (info).
   - `postgres-primary` status badge turns green with role **Replica**.

---

### 5. Testing Case 4: Standby Replica Failover
To test failover of a read-only replica node:
1. **Stop one replica container**:
   ```powershell
   docker compose stop postgres-replica-2
   ```
2. **Observe the Dashboard**:
   - The status badge for `postgres-replica-2` changes to **Down** (red).
   - Read queries route 100% to the remaining healthy nodes.
3. **Start the replica container**:
   ```powershell
   docker compose start postgres-replica-2
   ```
   - The replica automatically boots up, runs active primary discovery to find the current active primary node, connects to it, and is marked **Healthy** (green) on the dashboard again.

---

### 6. Testing Case 5: Client Reconnection
If you restart the query router (`docker compose restart query-router`), the dashboard UI connection will automatically close and attempt reconnection every 2 seconds. Once the query router is back online, the dashboard re-establishes the connection dynamically without requiring a page refresh.

## 🔄 High Availability & Auto-Failover Logic

Replic8 includes an automated high-availability (HA) database cluster failover and self-healing system:

1. **Failure Detection & Pool Stability**:
   - The Query Router polls node status and executes query latency probes every 5 seconds.
   - If a database container goes down, connection pool errors (`Unexpected error on idle client`) are caught and logged gracefully rather than crashing the Node.js process.
   - If the active primary database is unreachable, the router instantly removes it from the routing pool.

2. **Automated Promotion**:
   - When a primary failure is detected, the Query Router ranks the online replicas using their live scoring metrics.
   - It identifies the healthiest replica and promotes it immediately to the new Primary by running `SELECT pg_promote(false);`.
   - The router dynamically updates the write routing target, shifting database writes to the newly promoted Primary. In testing, writes resume once promotion completes; the [failover probe](query-router/BENCHMARKS.md) lets you measure the exact window of failing requests.

3. **Dynamic Rejoining & Streaming Sync**:
   - When a database container starts up, the entrypoint scripts scan the other nodes in the cluster to see if another node has been promoted to Primary (`pg_is_in_recovery() = false`).
   - If an active Primary is found, the rejoining node automatically configures its standby replication target (`PRIMARY_HOST`) to that active primary.
   - If the rejoining node is returning from a promotion (i.e. has no standby signal) but another node is active as Primary, it wipes its local data and triggers a clean `pg_basebackup -R` clone from the active primary, rejoining the cluster as a standby replica.

4. **Real-time Streaming Observability**:
   - All state transitions (e.g. `Primary Down`, `Replica X Promoted`, `Primary Restored`, `Rejoining Cluster As Replica`) are published instantly to the React frontend over a persistent WebSocket connection.
   - The dashboard dynamically visualizes the updated cluster topology map and logs events in the **Cluster Activity Log** with no manual page refresh.

---

## 📊 Live Scoring Formula
Replicas are ranked based on a composite score where **lower is better**.
The score is calculated using real-time system resources and database statistics:

$$\text{Score} = w_{\text{cpu}} \cdot \frac{\text{CPU}\%}{100} + w_{\text{mem}} \cdot \frac{\text{Mem}\%}{100} + w_{\text{conn}} \cdot \frac{\text{Connections}}{\text{PoolMax}} + w_{\text{lat}} \cdot \frac{\text{Latency}}{\text{TargetLatency}} + \text{StalePenalty}$$

*   **Weights** are fully configurable in `.env`.
*   **Stale Nodes** or **Down Nodes** receive an `Infinity` score and are immediately removed from read routing.

---

## ⚙️ Environment Variables & Configuration
You may notice multiple `.env.example` templates in the project:
1. **Root `.env.example`**: Used by Docker Compose to set global database passwords and configuration.
2. **Query Router `.env.example`**: This file is **only** needed if you are running the Node.js application standalone on your host machine (outside of Docker). When running inside Docker Compose, all configuration variables are automatically injected directly via the `environment` section of the `docker-compose.yml` file.

Key variables (set in the root `.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `postgres` / `change-me...` / `appdb` | Database credentials and name. |
| `REPLICATION_USER` / `REPLICATION_PASSWORD` | `replicator` / `change-me...` | Streaming-replication credentials. |
| `API_KEY` | _(empty)_ | When set, requires this key on `POST /query` and the metrics WebSocket. Empty = open mode + startup warning. |
| `GRAFANA_USER` / `GRAFANA_PASSWORD` | `admin` / `admin` | Grafana login. |
| `CPU_WEIGHT` / `MEMORY_WEIGHT` / `CONNECTION_WEIGHT` / `LATENCY_WEIGHT` | `0.30` / `0.25` / `0.20` / `0.25` | Load-score weights (set on the router service in `docker-compose.yml`). |

> The host-run helper scripts (`npm run seed:data`, `npm run bench:*`) automatically read the root `.env`, so they use the same database credentials as the cluster. Override individually with `BENCH_*` variables if needed (see [query-router/BENCHMARKS.md](query-router/BENCHMARKS.md)).

---

## 🧪 Testing & Benchmarks

The query router ships with an automated test suite and a benchmark harness, both
dependency-free (Node's built-in test runner + global `fetch`).

```powershell
cd query-router
npm install
npm test                # run the unit test suite (75 tests)
npm run seed:data       # create + seed the demo `users` table (stack must be running)
npm run bench:seed      # seed the benchmark table
npm run bench           # mixed read/write load test through the router
npm run bench:failover  # measure the failover window while you stop a node
```

- **Unit tests** cover query classification, replica scoring, pool routing/failover,
  the health monitor, query-latency stats, LSN math, and API-key auth. See [query-router/TESTING.md](query-router/TESTING.md).
- **Benchmarks** measure throughput, latency percentiles, read distribution across
  replicas, and observed failover time. See [query-router/BENCHMARKS.md](query-router/BENCHMARKS.md).
- **Full scenario playbook** (PowerShell, copy-paste): see [`TEST_COMMANDS.txt`](TEST_COMMANDS.txt).

---

## 🔐 Security

This is a local demonstration stack, and a few boundaries are deliberately left
open for ease of setup. They are called out here so the trade-offs are explicit.

- **Query API authentication (optional, off by default).** The Query Router's
  `POST /query` endpoint executes arbitrary SQL. Set an `API_KEY` in `.env` to
  require a key on every request; leave it empty to run open. When no key is set,
  the router logs a startup warning. Requests authenticate with either header:
  ```powershell
  curl -X POST http://localhost:3002/query -H "X-API-Key: $env:API_KEY" -H "Content-Type: application/json" -d "{\"sql\": \"SELECT 1\"}"
  # or:  -H "Authorization: Bearer $env:API_KEY"
  ```
- **Metrics WebSocket.** When `API_KEY` is set, the dashboard WebSocket
  (`/ws/cluster`) also requires the key as a query parameter (`?token=<key>`).
  Point the dashboard at it with `NEXT_PUBLIC_METRICS_TOKEN=<key>` (and optionally
  `NEXT_PUBLIC_METRICS_WS_URL`).
- **`/health` and `/metrics` stay open** so Prometheus can scrape the router on
  the internal Docker network. In a real deployment these would sit behind the
  network boundary or a scrape credential.
- **Database ports** (`15432`–`15434`) are published only on `127.0.0.1`, and the
  `pg-cluster` network is marked `internal`, so the databases are not reachable
  from outside the host.
- **Known gaps for a production deployment:** TLS termination in front of the
  router, per-client credentials/rate limiting instead of a single shared key, and
  authenticated `/metrics` scraping. These are intentionally out of scope for a
  local demo.

---

## ✅ Continuous Integration

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and pull
request with three jobs:

- **Query Router unit tests** — `npm ci` + `npm test` on Node 22.
- **Dashboard build** — `npm ci` + `next build` to catch UI build breakage.
- **Docker images** — `docker compose build` to validate every Dockerfile.

To show build status in this README, add the badge (replace `OWNER/REPO`):

```markdown
![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)
```

---

## 🛠️ Operational Notes

- **Graceful shutdown.** On `SIGTERM` (from `docker stop`) or `SIGINT` (Ctrl+C),
  the router stops the monitor loop, closes WebSocket clients, stops accepting new
  HTTP connections, and drains the PostgreSQL pools before exiting (with a 10s
  forced-exit safety net).
- **Connection pooling.** Each pool is bounded by `POOL_MAX` (default 10) with a
  `POOL_CONNECTION_TIMEOUT_MS` acquire timeout and a 2s `query_timeout`, so a slow
  or saturated node fails fast and is rerouted rather than hanging the service.
- **Demo data.** `npm run seed:data` (in `query-router/`) creates and seeds the
  `users` table used by the examples above.

---

## 🔍 Troubleshooting

*   **Dashboard is blank / WebSocket doesn't connect**: 
    Verify that the Query Router Docker stack is running (`docker compose ps`) and that the port mapping for the Query Router (`3002:3000`) is open.
*   **Replicas never become healthy**:
    Check replica logs with `docker compose logs -f postgres-replica-1` to verify replication credentials match the primary `.env`.
*   **Docker Socket Permissions**:
    The router queries `/var/run/docker.sock` to fetch CPU/Memory stats. Ensure your Docker Desktop has socket sharing enabled.
*   **Grafana dashboard is empty**:
    Open [http://localhost:9090/targets](http://localhost:9090/targets) and confirm the `query-router` target is `UP`. The dashboard only renders data once the router has served some queries (run `npm run bench` or send a few requests).