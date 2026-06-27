"use client";

import { useEffect, useState } from 'react';

const initialState = {
    timestamp: null,
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
    let socket = null;
    let reconnectTimeout = null;
    let isMounted = true;

    function connect() {
      if (!isMounted) return;

      const baseUrl = process.env.NEXT_PUBLIC_METRICS_WS_URL || 'ws://localhost:3002/ws/cluster';
      const token = process.env.NEXT_PUBLIC_METRICS_TOKEN;
      const url = token ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : baseUrl;
      socket = new WebSocket(url);

      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          setSnapshot(payload);
          setHistory((current) => [
            ...current.slice(-119),
            {
              timestamp: payload.timestamp,
              value: payload.system?.cpuPercent || 0
            }
          ]);
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
        }
      });

      socket.addEventListener('close', () => {
        if (isMounted) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      });

      socket.addEventListener('error', () => {
        if (socket) {
          socket.close();
        }
      });
    }

    connect();

    return () => {
      isMounted = false;
      if (socket) {
        socket.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  return {
    snapshot,
    history
  };
}