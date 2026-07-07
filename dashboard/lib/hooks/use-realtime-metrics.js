"use client";

import { useEffect, useRef, useState } from 'react';

const MAX_ACTIVITY_ITEMS = 50;

const initialState = {
  timestamp: null,
  alerts: [],
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

function formatNodeName(name) {
  return name
    .replace(/^postgres-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getPrimaryNode(snapshot) {
  return snapshot?.replicas?.find((node) => node.role === 'Primary' && node.status !== 'Down') || null;
}

function buildSyntheticActivity(previousSnapshot, nextSnapshot) {
  const entries = [];
  const previousPrimary = getPrimaryNode(previousSnapshot);
  const currentPrimary = getPrimaryNode(nextSnapshot);

  if (previousPrimary && previousPrimary.name !== currentPrimary?.name) {
    entries.push({
      timestamp: nextSnapshot.timestamp || new Date().toISOString(),
      type: 'error',
      message: `${formatNodeName(previousPrimary.name)} Down`
    });

    if (currentPrimary) {
      entries.push({
        timestamp: nextSnapshot.timestamp || new Date().toISOString(),
        type: 'info',
        message: `${formatNodeName(currentPrimary.name)} Promoted`
      });
    }
  }

  return entries;
}

export function useRealtimeMetrics() {
  const [snapshot, setSnapshot] = useState(initialState);
  const [history, setHistory] = useState([]);
  const previousSnapshotRef = useRef(initialState);
  const [activityLog, setActivityLog] = useState([]);

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
          const previousSnapshot = previousSnapshotRef.current;
          setSnapshot(payload);
          setHistory((current) => [
            ...current.slice(-119),
            {
              timestamp: payload.timestamp,
              value: payload.system?.cpuPercent || 0
            }
          ]);

          if (Array.isArray(payload.alerts) && payload.alerts.length > 0) {
            setActivityLog(payload.alerts.slice(0, MAX_ACTIVITY_ITEMS));
          } else {
            const syntheticActivity = buildSyntheticActivity(previousSnapshot, payload);

            if (syntheticActivity.length > 0) {
              setActivityLog((current) => [
                ...syntheticActivity,
                ...current
              ].slice(0, MAX_ACTIVITY_ITEMS));
            }
          }

          previousSnapshotRef.current = payload;
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
    history,
    activityLog
  };
}