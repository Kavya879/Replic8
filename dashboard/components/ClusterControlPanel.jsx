"use client";

import { useState } from 'react';

export function ClusterControlPanel({ replicas }) {
  const [loadingNode, setLoadingNode] = useState(null);
  const [toast, setToast] = useState(null);

  const baseUrl = (process.env.NEXT_PUBLIC_METRICS_WS_URL || 'ws://localhost:3002/ws/cluster')
    .replace('ws://', 'http://')
    .replace('wss://', 'https://')
    .replace('/ws/cluster', '');

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const performAction = async (nodeName, action) => {
    setLoadingNode(`${nodeName}-${action}`);
    try {
      const response = await fetch(`${baseUrl}/api/cluster/${nodeName}/${action}`, {
        method: 'POST',
        headers: {
          'x-api-key': process.env.NEXT_PUBLIC_METRICS_TOKEN || ''
        }
      });
      const data = await response.json();
      if (response.ok) {
        showToast(data.message || `Successfully executed ${action} on ${nodeName}`, 'success');
      } else {
        throw new Error(data.error || 'Failed to perform action');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoadingNode(null);
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl relative">
      {toast && (
        <div className={`absolute top-4 right-4 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-lg z-50 animate-in fade-in slide-in-from-top-2 ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`}>
          {toast.message}
        </div>
      )}
      <h3 className="text-lg font-semibold text-white mb-4">Cluster Control Panel</h3>
      <div className="space-y-4">
        {replicas.map((replica) => (
          <div key={replica.name} className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/20">
            <div>
              <div className="text-sm font-medium text-white/90">{replica.name}</div>
              <div className="text-xs text-white/50">{replica.role} • {replica.status}</div>
            </div>
            <div className="flex gap-2">
              <button
                disabled={loadingNode === `${replica.name}-start`}
                onClick={() => performAction(replica.name, 'start')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[60px]"
              >
                {loadingNode === `${replica.name}-start` ? '...' : 'Start'}
              </button>
              <button
                disabled={loadingNode === `${replica.name}-stop`}
                onClick={() => performAction(replica.name, 'stop')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[60px]"
              >
                {loadingNode === `${replica.name}-stop` ? '...' : 'Stop'}
              </button>
              <button
                disabled={loadingNode === `${replica.name}-restart`}
                onClick={() => performAction(replica.name, 'restart')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[70px]"
              >
                {loadingNode === `${replica.name}-restart` ? '...' : 'Restart'}
              </button>
            </div>
          </div>
        ))}
        {replicas.length === 0 && (
          <div className="text-sm text-white/40 text-center py-4">No nodes available</div>
        )}
      </div>
    </div>
  );
}
