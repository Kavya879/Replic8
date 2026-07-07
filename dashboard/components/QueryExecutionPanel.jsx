"use client";

import { useState } from 'react';

export function QueryExecutionPanel({ replicas }) {
  const [sql, setSql] = useState('');
  const [executionMode, setExecutionMode] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const baseUrl = (process.env.NEXT_PUBLIC_METRICS_WS_URL || 'ws://localhost:3002/ws/cluster')
    .replace('ws://', 'http://')
    .replace('wss://', 'https://')
    .replace('/ws/cluster', '');

  const executeQuery = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NEXT_PUBLIC_METRICS_TOKEN || ''
        },
        body: JSON.stringify({
          sql: sql,
          executionMode: executionMode
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute query');
      }
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getActiveNodeNames = () => {
    return replicas.map(r => r.name);
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl flex flex-col">
      <h3 className="text-lg font-semibold text-white mb-4">Query Execution</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-white/70 mb-2 uppercase tracking-wide">Execution Mode</label>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm text-white/90 bg-black/20 px-3 py-2 rounded-lg border border-white/10 cursor-pointer hover:bg-white/5 transition-colors">
              <input
                type="radio"
                name="executionMode"
                value="auto"
                checked={executionMode === 'auto'}
                onChange={(e) => setExecutionMode(e.target.value)}
                className="accent-cyan-400"
              />
              Auto Routing
            </label>
            {getActiveNodeNames().map(nodeName => (
              <label key={nodeName} className="flex items-center gap-2 text-sm text-white/90 bg-black/20 px-3 py-2 rounded-lg border border-white/10 cursor-pointer hover:bg-white/5 transition-colors">
                <input
                  type="radio"
                  name="executionMode"
                  value={nodeName}
                  checked={executionMode === nodeName}
                  onChange={(e) => setExecutionMode(e.target.value)}
                  className="accent-cyan-400"
                />
                {nodeName}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-white/70 mb-2 uppercase tracking-wide">SQL Query</label>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white placeholder-white/30 font-mono focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all resize-none"
            placeholder="SELECT * FROM pg_stat_activity;"
          />
        </div>

        <button
          onClick={executeQuery}
          disabled={loading || !sql.trim()}
          className="w-full py-3 rounded-xl font-semibold bg-cyan-500 text-black hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex justify-center items-center gap-2"
        >
          {loading ? (
             <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
          ) : 'Execute Query'}
        </button>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 border-t border-white/10 pt-4">
            <div className="flex gap-4 mb-3 text-xs">
              <span className="text-white/60">Node: <strong className="text-cyan-300">{result.pool}</strong></span>
              <span className="text-white/60">Route: <strong className="text-cyan-300">{result.route}</strong></span>
              <span className="text-white/60">Rows: <strong className="text-cyan-300">{result.rowCount ?? 0}</strong></span>
            </div>
            
            <div className="overflow-x-auto bg-black/40 rounded-xl border border-white/10">
              {result.rows && result.rows.length > 0 ? (
                <table className="w-full text-left text-sm text-white/80">
                  <thead className="bg-white/5 border-b border-white/10 text-white/50">
                    <tr>
                      {Object.keys(result.rows[0]).map(key => (
                        <th key={key} className="px-4 py-2 font-medium">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-xs">
                    {result.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-white/5">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-4 py-2 truncate max-w-[200px]" title={String(val)}>
                            {val === null ? <span className="text-white/30 italic">null</span> : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-4 text-sm text-white/50 text-center font-mono">
                  {result.command ? `Success: ${result.command}` : 'No rows returned'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
