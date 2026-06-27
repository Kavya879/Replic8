"use client";

import { useRealtimeMetrics } from '../../../lib/hooks/use-realtime-metrics.js';
import { StatusPill } from '../../../components/metrics/status-pill.jsx';
import { Card } from '../../../components/ui/card.jsx';

export default function ReplicationStatusPage() {
  const { snapshot } = useRealtimeMetrics();

  // Find primary and replicas
  const primaryNode = snapshot.replicas.find(node => node.role === 'Primary');
  const replicaNodes = snapshot.replicas.filter(node => node.role === 'Replica');

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Replication Topology</h1>
        <p className="mt-2 text-sm text-white/55">Real-time replication mapping and standby stream monitoring.</p>
      </div>

      {/* Topology Map */}
      <div className="rounded-2xl border border-white/10 bg-card/90 p-8 shadow-glow backdrop-blur flex flex-col items-center justify-center min-h-[400px]">
        <h3 className="text-lg font-semibold text-white mb-8 self-start">Active Cluster Topology</h3>
        
        <div className="flex flex-col items-center w-full max-w-4xl relative">
          
          {/* Primary Node Container */}
          {primaryNode ? (
            <div className="flex flex-col items-center z-10 animate-fade-in">
              <div className="border border-cyan-400/30 bg-cyan-950/20 px-6 py-4 rounded-xl shadow-glow text-center w-64">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Primary / Write Node
                </span>
                <h4 className="text-white font-semibold text-lg mt-2">{primaryNode.name}</h4>
                <p className="text-xs text-white/55 mt-1">Status: {primaryNode.status}</p>
                <p className="text-xs text-white/55">Connections: {primaryNode.metrics?.activeConnections ?? 0}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center z-10 animate-pulse">
              <div className="border border-rose-500/30 bg-rose-950/20 px-6 py-4 rounded-xl shadow-glow text-center w-64">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Primary Down
                </span>
                <h4 className="text-white font-semibold text-lg mt-2">No Active Primary</h4>
                <p className="text-xs text-rose-400 mt-1">Cluster in degraded state</p>
              </div>
            </div>
          )}

          {/* Connective Arrows */}
          {primaryNode && replicaNodes.length > 0 && (
            <div className="w-full flex justify-around h-16 relative">
              <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.15)" />
                  </marker>
                </defs>
                {replicaNodes.map((_, idx) => {
                  const widthFraction = 100 / replicaNodes.length;
                  const targetX = `${widthFraction * (idx + 0.5)}%`;
                  return (
                    <line 
                      key={idx}
                      x1="50%" 
                      y1="0" 
                      x2={targetX} 
                      y2="100%" 
                      stroke="rgba(255,255,255,0.15)" 
                      strokeWidth="2" 
                      strokeDasharray="4"
                      markerEnd="url(#arrow)"
                    />
                  );
                })}
              </svg>
            </div>
          )}

          {/* Replicas Container */}
          {replicaNodes.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 w-full mt-4 z-10 justify-center">
              {replicaNodes.map((replica) => (
                <div 
                  key={replica.name} 
                  className={`px-5 py-4 rounded-xl border text-center min-w-56 transition-all duration-300 ${
                    replica.status === 'Healthy' ? 'border-emerald-500/20 bg-emerald-950/5' :
                    replica.status === 'Warning' ? 'border-amber-500/20 bg-amber-950/5' :
                    'border-rose-500/20 bg-rose-950/5'
                  }`}
                >
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    replica.name === 'postgres-primary' 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                      : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  }`}>
                    {replica.name === 'postgres-primary' ? 'Rejoined Replica' : 'Read Standby'}
                  </span>
                  <h4 className="text-white font-semibold mt-2">{replica.name}</h4>
                  <p className="text-xs text-white/55 mt-1">Status: {replica.status}</p>
                  <p className="text-xs text-white/55">Lag: {replica.metrics?.replicationLagMs?.toFixed(0) ?? 0} ms{typeof replica.metrics?.replicationLagBytes === 'number' ? ` · ${replica.metrics.replicationLagBytes} B` : ''}</p>
                  {replica.name === 'postgres-primary' && (
                    <div className="mt-2 text-[10px] text-amber-300/80 bg-amber-950/30 border border-amber-900/30 py-0.5 px-2 rounded animate-pulse">
                      Rejoining Cluster As Replica
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-white/45 text-sm mt-8">No read replicas configured or active.</div>
          )}

        </div>
      </div>

      {/* Replication Lag Overview */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <h4 className="text-sm font-semibold text-white/70 mb-2">Replica Stream Sync</h4>
          <p className="text-sm text-white/55 mb-4">Replicas receive Write-Ahead Logs (WAL) continuously from the current Primary.</p>
          <div className="space-y-3">
            {replicaNodes.map((replica) => (
              <div key={replica.name} className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                <span className="text-white/80">{replica.name}</span>
                <span className={`font-semibold ${replica.status === 'Down' ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {replica.status === 'Down' ? 'OFFLINE' : 'STREAMING'}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h4 className="text-sm font-semibold text-white/70 mb-2">HA Failover Rules</h4>
          <ul className="text-xs text-white/55 space-y-2 list-disc list-inside leading-relaxed">
            <li>Primary health is monitored every 5 seconds.</li>
            <li>If primary fails, the router promotes the replica with the lowest score.</li>
            <li>Once promoted, the replica initiates a standalone primary timeline.</li>
            <li>Old primary rejoins the cluster as a standby replica after data sync.</li>
          </ul>
        </Card>
      </div>
    </section>
  );
}