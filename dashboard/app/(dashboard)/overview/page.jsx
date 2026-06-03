"use client";

import { useRealtimeMetrics } from '../../../lib/hooks/use-realtime-metrics.js';
import { MetricCard } from '../../../components/metrics/metric-card.jsx';
import { RealtimeAreaChart } from '../../../components/charts/realtime-area-chart.jsx';

export default function OverviewPage() {
  const { snapshot, history } = useRealtimeMetrics();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Overview</h1>
        <p className="mt-2 text-sm text-white/55">Live cluster status streamed over WebSocket every 5 seconds.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="CPU" value={`${snapshot.system.cpuPercent.toFixed(1)}%`} description="System-wide utilization" />
        <MetricCard title="Memory" value={`${snapshot.system.memoryPercent.toFixed(1)}%`} description="System RAM pressure" />
        <MetricCard title="Connections" value={String(snapshot.system.connectionCount)} description="Active database sessions" />
        <MetricCard title="Replication Lag" value={`${snapshot.system.replicationLagMs.toFixed(0)} ms`} description="Current lag estimate" />
      </div>

      <RealtimeAreaChart title="Realtime CPU Trend" description="Updated from pushed Prometheus snapshots." data={history} />
    </section>
  );
}