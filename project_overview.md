# 📖 Project Overview: Postgres Replication Cluster & Dynamic Query Router

## 🌟 What Is This Project?
This project is a fully functional demonstration of a **high-availability database cluster** with **read-write splitting** and **real-time health monitoring**. 
It sets up a primary database (which accepts writes) and two replicas (which duplicate the primary and handle reads). A custom **Query Router** dynamically sends your queries to the best-performing database node, while a **Next.js Dashboard** visualizes the status, metrics, and load balancing of the cluster in real-time.

---

## 🏢 Corporate Utility: Why Companies Need This Architecture

For engineering organizations, managing database performance, reliability, and hosting costs are constant challenges. This architecture directly addresses those concerns in the following ways:

### 1. Massive Hosting Cost Optimization (Cloud Billing Reduction)
In cloud environments like AWS (RDS), GCP (Cloud SQL), or Azure, running a database instance large enough to handle both heavy writes and peak read traffic is extremely expensive.
*   **The Problem**: If you scale up a single primary database to handle massive read spikes, you pay a premium for high-write-performance storage and memory that sit idle 90% of the time.
*   **This Solution**: Companies can run a moderately sized Primary database for writes, and pair it with several smaller, cheaper, **read-optimized replica instances**. Read replicas do not require high-performance write hardware, allowing companies to scale reads horizontally at a fraction of the cost of scaling vertically.

### 2. Guarding the User Experience (Zero-Latency Reads)
Slow page loads directly translate to lost revenue. If a marketing campaign brings a surge of users who are searching for products (heavy reads), this load can spike database CPU to 100%.
*   **The Problem**: A single database at 100% CPU will queue write transactions. This causes users trying to check out, pay, or save their profiles to experience loading spinners or transaction timeouts.
*   **This Solution**: By routing search and browse queries (reads) to the replica pool, the Primary database's CPU remains low and responsive. Write transactions are completed instantly, ensuring that critical business processes (e.g. checkouts, sign-ups) are never delayed by browsing traffic.

### 3. Business Continuity & High Availability (SLA Protection)
Downtime is highly costly for companies, damaging customer trust and violating Service Level Agreements (SLAs).
*   **The Problem**: If a database server experiences a hardware failure, memory leak, or disk corruption, your entire platform goes offline.
*   **This Solution**: The dynamic health monitor checks replica status in the background. If a replica crashes, the router seamlessly redirects read traffic to the remaining healthy nodes in under 2 seconds. The end user never notices a connection failure or error page.

### 4. Isolating Heavy Analytics & BI Tools
Data analysts, product managers, and automated BI tools (like Tableau or Looker) often run massive, unoptimized queries to generate reports.
*   **The Problem**: If these analytics queries are run on the live production database, they can lock tables and slow down the experience for real users.
*   **This Solution**: Companies configure BI tools to query the read replicas. Analysts can run heavy reports all day without impacting the database performance of active clients on the primary database.

### 5. Horizontal Scaling Pathway
Vertical scaling (buying a bigger server) has a hard physical ceiling. Horizontal scaling (adding more servers) does not.
*   **This Solution**: With this query router architecture, as your company grows from 10,000 to 10,000,000 users, scaling the database reads is as simple as launching more read replica containers and adding their hostnames to the router environment configuration. The router automatically begins routing traffic and balancing load to the new instances.

---

## 🛑 The Problems Solved

### 1. High Database Load
In most web applications, reading data happens far more often than writing it. If your database has to handle searching, loading profiles, displaying feeds, AND saving new records all on one machine, it will slow down. 
*   **The Solution**: We delegate the heavy read traffic to secondary machines (Replicas) and keep the primary machine free for writes.

### 2. High Availability (Single Point of Failure)
If your application connects to only one database, and that database server goes offline, your entire application goes down instantly.
*   **The Solution**: By having multiple read replicas, if one replica crashes, the Query Router automatically shifts all reads to the remaining replicas without interrupting your users.

### 3. Stale Data & Slow Databases
Simply sending queries to random replica databases can cause issues if one replica is overloaded (high CPU, memory pressure) or experiencing lag.
*   **The Solution**: The Query Router calculates a live **performance score** for each replica every 5 seconds. It measures latency, connections, and system usage, then routes queries to the fastest, most available replica.

---

## 🛠️ How It Solves the Problem (In Complete Detail)

### 1. Database Level (Streaming Replication)
*   The primary database is configured to write a **Write-Ahead Log (WAL)**. Every change made (inserted records, updated rows) is written here.
*   The replica containers run a standby server. On startup, they perform a `pg_basebackup` to get a snapshot of the primary.
*   Afterwards, they connect to the primary and stream the WAL changes continuously, ensuring they have an up-to-date copy of the data.

### 2. Router Level (Query Parsing & Routing)
*   When a query comes in (via POST to `http://localhost:3002/query`), the query router parses the SQL.
*   It checks the query type:
    *   If it starts with `SELECT` (a read query), it gets routed to a read-only replica.
    *   If it is anything else (like `INSERT`, `UPDATE`, `DELETE`, `CREATE`), it gets routed directly to the primary.
*   The router monitors the replicas in the background. It reads container stats (CPU, Memory) directly from the Docker daemon socket and measures latency with a fast `SELECT 1` ping.

### 3. UI Level (Real-time Feedback)
*   The dashboard opens a persistent **WebSocket** connection to the Query Router.
*   Whenever a replica goes down or comes back up, the router instantly broadcasts the new cluster state, updating the status cards and line graphs in the dashboard without a page refresh.

---

## 👣 Step-by-Step Approach

1.  **Container Initialization**: Docker boots the Primary database first.
2.  **Replica Cloning**: Replica databases start up, copy the database structure, and start streaming replication.
3.  **Metrics Gathering**: The query router starts a loop checking the CPU, Memory, active connections, and ping latency of all replicas every 5 seconds.
4.  **Parsing & Routing**: When clients make database calls to the router, it parses the query type and targets either the Primary or the best-scoring replica.
5.  **Failover Handling**: If a database replica fails a check or takes too long to query, the router marks it `Down`, sets its score to `Infinity`, and immediately redirects all query traffic to the other healthy replica.
6.  **Snappy Recovery**: Once the failed database recovers, the monitor automatically restores it to the pool on the next check.

---

## 💼 Use Cases

*   **E-Commerce Platforms**: Product searches and catalog browsing (heavy reads) are handled by replicas, while ordering and checkouts (writes) are sent to the primary.
*   **Social Networks**: Loading feeds and user profiles (heavy reads) run on replicas, while posting comments or messages (writes) go to the primary database.
*   **SaaS Analytics**: Loading graphs and reports (heavy reads) route to replicas, preventing analytic queries from slowing down live application database updates.
