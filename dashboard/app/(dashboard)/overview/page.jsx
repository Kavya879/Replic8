"use client";

import { useRealtimeMetrics } from '../../../lib/hooks/use-realtime-metrics.js';
import { MetricCard } from '../../../components/metrics/metric-card.jsx';
import { RealtimeAreaChart } from '../../../components/charts/realtime-area-chart.jsx';
import { StatusPill } from '../../../components/metrics/status-pill.jsx';

export default function OverviewPage() {
  const { snapshot, history } = useRealtimeMetrics();
  const healthyCount = snapshot.replicas.filter((replica) => replica.status === 'Healthy').length;
  const warningCount = snapshot.replicas.filter((replica) => replica.status === 'Warning').length;
  const downCount = snapshot.replicas.filter((replica) => replica.status === 'Down').length;

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

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Healthy Nodes" value={String(healthyCount)} description="Available for routing" />
        <MetricCard title="Warning Nodes" value={String(warningCount)} description="Degraded but reachable" />
        <MetricCard title="Down Nodes" value={String(downCount)} description="Removed from routing pool" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {snapshot.replicas.map((replica) => (
          <div key={replica.name} className="rounded-2xl border border-white/10 bg-card/90 p-6 shadow-glow backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white/70">{replica.name}</div>
                <div className="text-xs text-white/45">Score {replica.score.toFixed(2)}</div>
              </div>
              <StatusPill status={replica.status} />
            </div>
            <div className="grid gap-2 text-sm text-white/70">
              <div>CPU: {replica.metrics.cpuPercent?.toFixed(1)}%</div>
              <div>Memory: {replica.metrics.memoryPercent?.toFixed(1)}%</div>
              <div>Connections: {replica.metrics.activeConnections}</div>
              <div>Latency: {replica.metrics.averageLatencyMs?.toFixed(0)} ms</div>
            </div>
          </div>
        ))}
      </div>

      <RealtimeAreaChart title="Realtime CPU Trend" description="Updated from pushed Prometheus snapshots." data={history} />
    </section>
  );
}