"use client";

import { useEffect, useState } from 'react';

const initialState = {
  timestamp: new Date().toISOString(),
  replicas: [],
  system: {
    cpuPercent: 0,
    memoryPercent: 0,
    connectionCount: 0,
    replicationLagMs: 0
  },
  queries: {
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    requestsPerSecond: 0
  }
};

export function useRealtimeMetrics() {
  const [snapshot, setSnapshot] = useState(initialState);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const socket = new WebSocket(process.env.NEXT_PUBLIC_METRICS_WS_URL || 'ws://localhost:8081');

    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data);
      setSnapshot(payload);
      setHistory((current) => [
        ...current.slice(-119),
        {
          timestamp: payload.timestamp,
          value: payload.system.cpuPercent
        }
      ]);
    });

    return () => {
      socket.close();
    };
  }, []);

  return {
    snapshot,
    history
  };
}