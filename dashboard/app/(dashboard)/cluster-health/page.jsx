"use client";

import { useRealtimeMetrics } from '../../../lib/hooks/use-realtime-metrics.js';
import { StatusCard } from '../../../components/metrics/status-pill.jsx';

export default function ClusterHealthPage() {
  const { snapshot } = useRealtimeMetrics();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Cluster Health</h1>
        <p className="mt-2 text-sm text-white/55">Failover state, replica availability, and node health at a glance.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {snapshot.replicas.map((replica) => (
          <StatusCard key={replica.name} title={replica.name} status={replica.status}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                replica.role === 'Primary' ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20' : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
              }`}>
                {replica.role}
              </span>
            </div>
            <div>State score: {replica.role === 'Replica' ? replica.score?.toFixed?.(2) ?? 'N/A' : 'N/A'}</div>
            <div>CPU: {replica.metrics.cpuPercent?.toFixed(1)}%</div>
            <div>Memory: {replica.metrics.memoryPercent?.toFixed(1)}%</div>
            <div>Connections: {replica.metrics.activeConnections}</div>
            <div>Latency: {replica.metrics.averageLatencyMs?.toFixed(0)} ms</div>
          </StatusCard>
        ))}
      </div>
    </section>
  );
}