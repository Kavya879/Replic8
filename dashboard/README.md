# Next.js 15 Dashboard Scaffold

This folder defines the folder structure and UI architecture for a Next.js 15 dashboard built with App Router, JavaScript/JSX, Tailwind CSS, ShadCN UI, Recharts, and a WebSocket-driven realtime layer.

## Design Direction

The interface is intended to feel like an enterprise observability console similar to Datadog and Grafana:

- dense but readable information hierarchy
- dark-first operational surfaces with strong contrast
- card-based metric summaries with clear status states
- chart-heavy layouts for time-series and trend analysis
- responsive navigation with a persistent shell
- filters and time-range controls available at the page header level
- charts update live without refresh through pushed metric snapshots

## Route Structure

- `app/(dashboard)/overview`: executive summary, current status, and high-level KPIs.
- `app/(dashboard)/cluster-health`: primary, replica, and service health overview.
- `app/(dashboard)/replication-status`: lag, replay state, and replica consistency views.
- `app/(dashboard)/query-analytics`: query volume, latency, slow-query trends, and routing breakdowns.
- `app/(dashboard)/system-metrics`: host-level CPU, RAM, process, and resource panels.

## UI Architecture

The dashboard is organized as a shell plus page-level analytics surfaces.

### Shell Layer

- `components/layout`: application shell, top bar, side navigation, and responsive container logic.
- `components/navigation`: section nav, breadcrumbs, time-range selector, and global actions.

### Visualization Layer

- `components/metrics`: KPI cards, status badges, health indicators, and summary tiles.
- `components/charts`: time-series charts, latency graphs, replication lag charts, and heatmaps.
- `components/tables`: query tables, replica inventories, event lists, and drill-down grids.

### Realtime Layer

- `lib/websocket`: live cluster snapshot connection helpers used by the dashboard client.
- `lib/hooks`: client hook that opens the WebSocket connection and updates React state as messages arrive.
- `components/charts`: Recharts surfaces that rerender automatically when snapshot history changes.

### Shared UI Layer

- `components/ui`: ShadCN UI primitives used across the dashboard.
- `lib/utils`: shared formatting, thresholds, and helper functions.
- `lib/hooks`: reusable data-fetching and polling hooks.
- `lib/api`: data access adapters for cluster, metrics, and analytics endpoints.
- `types`: domain model notes for cluster nodes, replicas, query records, and metric payloads.

### Styling Layer

- `styles`: Tailwind entry points, theme tokens, and any dashboard-specific global style layers.

## Page Responsibilities

### Overview

A summary landing page that surfaces the current state of the cluster, top alerts, routing health, and short KPI cards.

### Cluster Health

A topology-focused page that shows primary/replica status, service availability, and operational alerts.

### Replication Status

A replication observability page that emphasizes lag, replay health, and synchronization behavior across replicas.

### Query Analytics

A performance page for SQL traffic, routing decisions, latency distributions, and slow-query patterns.

### System Metrics

A system-level page for CPU, memory, process pressure, and resource saturation.

## Realtime Architecture

1. Query Router monitors replica health every 5 seconds.
2. When a node changes state, the router broadcasts the new cluster snapshot over WebSocket immediately.
3. The client hook subscribes to the socket and stores the live snapshot plus a local time series history.
4. Recharts components consume the hook state and redraw immediately when new data arrives.
5. ShadCN Cards provide the metric surfaces that frame the charts and KPI summaries.

## Node Status

- `Healthy`: replica is available and within normal operating thresholds.
- `Warning`: replica is reachable but under pressure or degraded.
- `Down`: replica is unavailable and removed from the routing pool.

## Folder Tree

- `dashboard/app/(dashboard)/overview`
- `dashboard/app/(dashboard)/cluster-health`
- `dashboard/app/(dashboard)/replication-status`
- `dashboard/app/(dashboard)/query-analytics`
- `dashboard/app/(dashboard)/system-metrics`
- `dashboard/components/layout`
- `dashboard/components/navigation`
- `dashboard/components/metrics`
- `dashboard/components/charts`
- `dashboard/components/tables`
- `dashboard/components/ui`
- `dashboard/lib/api`
- `dashboard/lib/hooks`
- `dashboard/lib/utils`
- `dashboard/styles`
- `dashboard/types`
- `dashboard/docs`

## Notes

The dashboard is intentionally structured so the realtime transport, metric data model, and visual components remain separate.