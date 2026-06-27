# 🧪 Testing the Query Router

This package ships with a unit test suite for the core routing, scoring, and
health-monitoring logic. The tests use Node's **built-in test runner**
(`node:test`) and **built-in assertions** (`node:assert`), so there are **no
extra dependencies to install** and nothing to configure.

> Requirements: **Node.js 18+** (the project is developed and verified on Node 22).
> Docker is **not** required to run the unit tests.

---

## 🚀 Running the tests

All commands are run from the `query-router/` directory.

```bash
cd query-router
```

### Run the full suite once

```bash
npm test
```

### Re-run automatically on file changes (watch mode)

```bash
npm run test:watch
```

### Run with a code-coverage summary

```bash
npm run test:coverage
```

### Run a single test file

```bash
node --test tests/queryClassifier.test.js
```

### Filter by test name

```bash
node --test --test-name-pattern="failover"
```

---

## 📁 What is covered

The suite lives in [`query-router/tests/`](./tests) and is split by module.

| Test file | Module under test | What it verifies |
| --- | --- | --- |
| `queryClassifier.test.js` | `src/routing/queryClassifier.js` | Read vs. write classification, case-insensitivity, leading comment stripping, and rejection of empty / unsupported statements. |
| `replicaScorer.test.js` | `src/routing/replicaScorer.js` | Load-score math: idle = 0, saturated = sum of weights, the stale-metrics penalty, pressure clamping, and divide-by-zero guards. |
| `poolRouter.test.js` | `src/routing/poolRouter.js` | Reads hit the best replica, failover to the next replica on retryable errors, no-retry on query errors, primary fallback when all replicas are down, and write routing to the primary. |
| `replicaMonitor.test.js` | `src/monitoring/replicaMonitor.js` | Initial "all Down" state, health derivation (Healthy / Warning / Down), routing-snapshot ordering by score, failure/recovery transitions, latency smoothing, and subscriber notifications. |

These are **pure unit tests**: every external dependency (PostgreSQL pools, the
Docker stats socket, the cluster monitor) is replaced with a lightweight in-memory
stub. That keeps the suite fast (runs in well under a second) and deterministic,
with no network, database, or container needed.

---

## 🧰 How the tests are built (no mocking framework)

There is intentionally no Jest / Mocha / Sinon dependency. Test doubles are plain
JavaScript objects and functions:

- **Fake pools** expose an `async query()` that returns canned rows or throws a
  tagged error (e.g. `{ code: 'ECONNREFUSED' }`) to simulate node failures.
- **A stub cluster monitor** records the calls the router makes
  (`updateQueryLatency`, `markReplicaFailed`, `markReplicaRecovered`) so behaviour
  can be asserted directly.
- The Docker stats call inside the monitor fails fast when no Docker socket is
  present and falls back to `0%` CPU/memory, so the monitor tests stay
  deterministic off-cluster.

---

## ➕ Adding a new test

1. Create a file named `*.test.js` inside `query-router/tests/`.
2. Import the runner and assertions:

   ```js
   const test = require('node:test');
   const assert = require('node:assert/strict');
   ```

3. Write a test:

   ```js
   test('describes the behaviour being verified', () => {
     assert.equal(2 + 2, 4);
   });
   ```

4. Run `npm test`. The runner auto-discovers any file matching `*.test.js`
   (excluding `node_modules`), so there is nothing else to wire up.

---

## ✅ Expected output

A passing run ends with a summary like:

```
ℹ tests 34
ℹ pass 34
ℹ fail 0
```

The process exits with code `0` on success and a non-zero code on any failure,
which makes `npm test` safe to drop straight into a CI pipeline.
