# 📈 Benchmarking the Query Router

This directory ships a small, dependency-free benchmark harness so the project's
performance and failover behaviour can be **measured** rather than asserted. The
scripts drive real traffic through the running router and report throughput,
latency percentiles, error rates, and observed failover windows.

> Requirements: the full Docker stack must be running (`docker compose up -d --build`),
> and Node.js 18+ on the host. The scripts use the global `fetch` (Node 18+) and
> the already-installed `pg` driver. No extra packages are needed.

All commands run from the `query-router/` directory.

---

## 1. Seed the benchmark table (one time)

```bash
npm run bench:seed
```

This connects directly to the primary (`127.0.0.1:15432` by default) and creates
a `bench_items` table with `BENCH_SEED_ROWS` rows (default `1000`). Table creation
is DDL, which the router intentionally does not route, so seeding bypasses it. The
actual workload below still goes through the router.

---

## 2. Run the mixed read/write load test

```bash
npm run bench
```

Example output:

```
--- Replic8 Query Router load test ---
Target:       http://localhost:3002
Duration:     15s
Concurrency:  20
Read ratio:   90% reads / 10% writes

Seeded id range: 1..1000
Running...

--- Results ---
Elapsed:           15.02s
Total requests:    48213
Successful:        48213
Errors:            0 (0%)
Throughput:        3209.92 req/s

Latency:
  READ    count=  43401  avg=5.8ms  p50=4.9ms  p95=12.1ms  p99=21.4ms  max=88.3ms
  WRITE   count=   4812  avg=7.2ms  p50=6.1ms  p95=15.0ms  p99=27.7ms  max=95.1ms

Read distribution across pools:
  postgres-replica-1       21987  (45.6%)
  postgres-replica-2       21414  (44.4%)
```

> The numbers above are an illustrative sample, not a guarantee. Run it on your
> own machine and record the real output (see the results table below).

### Tunables

| Env var | Default | Meaning |
| --- | --- | --- |
| `BENCH_DURATION` | `15` | Test duration in seconds. |
| `BENCH_CONCURRENCY` | `20` | Number of concurrent workers. |
| `BENCH_READ_RATIO` | `0.9` | Fraction of requests that are reads (0–1). |
| `BENCH_ROUTER_URL` | `http://localhost:3002` | Router base URL. |
| `BENCH_SEED_ROWS` | `1000` | Rows created by the seed script. |
| `BENCH_API_KEY` | _(unset)_ | API key sent to the router (`X-API-Key`) when `API_KEY` auth is enabled. Falls back to `API_KEY`. |

PowerShell example:

```powershell
$env:BENCH_DURATION=30; $env:BENCH_CONCURRENCY=50; npm run bench
```

---

## 3. Demonstrate horizontal read scaling (1 vs 2 replicas)

The clearest way to show that reads scale horizontally is to measure read
throughput with one replica, then with two.

```powershell
# Baseline: one replica only
docker compose stop postgres-replica-2
npm run bench          # note the read throughput

# Scale out: both replicas
docker compose start postgres-replica-2
# wait until it reports Healthy on the dashboard, then:
npm run bench          # compare read throughput and the pool distribution
```

The "Read distribution across pools" section confirms traffic actually spreads
across both replicas, and the throughput delta quantifies the read-scaling gain.

---

## 4. Measure failover time

```bash
npm run bench:failover
```

This fires a read every 100ms for 60s and prints when reads start failing and
when they recover. While it runs, take a node down in another terminal:

```powershell
# Replica failover (reads should keep flowing via the other replica)
docker compose stop postgres-replica-2

# Primary failover (router promotes a replica; writes resume afterwards)
docker compose stop postgres-primary
```

Example output:

```
[2025-01-01T00:00:03.512Z] ⚠️  requests started failing (fetch failed)
[2025-01-01T00:00:04.733Z] ✅ recovered after ~1221ms (served by postgres-replica-1)

--- Summary ---
Total probes:   600
Failed probes:  12 (2%)
Outages observed: 1
  #1: ~1221ms of failing reads
```

Tunables: `BENCH_DURATION` (default `60`), `BENCH_PROBE_INTERVAL_MS` (default `100`).

---

## 5. Record your results

Fill this in with numbers from your own machine so the README can reference real
measurements instead of estimates.

| Scenario | Concurrency | Read ratio | Throughput (req/s) | Read p95 (ms) | Write p95 (ms) | Error rate |
| --- | --- | --- | --- | --- | --- | --- |
| 1 replica |  |  |  |  |  |  |
| 2 replicas |  |  |  |  |  |  |

| Failover scenario | Observed read-error window |
| --- | --- |
| Replica stopped |  |
| Primary stopped (promotion) |  |

**Test environment:** _CPU / RAM / OS / Docker version here._

---

## Notes & honest caveats

- These run against a **local, single-host Docker stack**, so all nodes share the
  same CPU, disk, and memory. Results show relative behaviour and routing
  correctness, not the absolute numbers you would get on isolated cloud instances.
- The failover window measured here is the time clients see failing reads from the
  probe's point of view. It depends on the monitor interval (`MONITOR_INTERVAL_MS`,
  default 5s), pool query timeout (2s), and the startup grace period.
- Throughput is bounded by your machine; the goal is to compare configurations
  (1 vs 2 replicas, different read ratios), not to publish a headline number.
