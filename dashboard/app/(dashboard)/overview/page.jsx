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
                <div className="text-sm font-semibold text-white/85 flex items-center gap-2">
                  <span>{replica.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    replica.role === 'Primary' ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20' : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                  }`}>
                    {replica.role}
                  </span>
                </div>
                <div className="text-xs text-white/45 mt-1">
                  {replica.role === 'Replica' ? `Score: ${replica.score?.toFixed?.(2) ?? 'N/A'}` : 'Writes Active'}
                </div>
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RealtimeAreaChart title="Realtime CPU Trend" description="Updated from pushed Prometheus snapshots." data={history} />
        </div>
        <div className="rounded-2xl border border-white/10 bg-card/90 p-6 shadow-glow backdrop-blur flex flex-col h-full">
          <div>
            <h3 className="text-lg font-semibold text-white">Cluster Activity Log</h3>
            <p className="mt-1 text-xs text-white/55 mb-4">Failover events and cluster state transitions.</p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] pr-2">
            {snapshot.alerts && snapshot.alerts.length > 0 ? (
              snapshot.alerts.map((alert, idx) => (
                <div key={idx} className="flex items-start gap-3 text-sm border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <span className="text-white/45 font-mono text-xs mt-0.5 whitespace-nowrap">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    alert.type === 'error' ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20' :
                    alert.type === 'success' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' :
                    'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                  }`}>
                    {alert.type}
                  </span>
                  <span className="text-white/80 font-medium leading-relaxed">{alert.message}</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-white/45 py-8 text-center flex flex-col items-center justify-center h-full">
                <span>No cluster events recorded yet.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}