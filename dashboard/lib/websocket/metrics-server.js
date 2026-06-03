import { WebSocketServer, WebSocket } from 'ws';
import { loadRealtimeMetricsSnapshot } from '../api/prometheus.js';

export function startMetricsWebSocketServer(port = 8081) {
  const server = new WebSocketServer({ port });
  const clients = new Set();

  server.on('connection', (socket) => {
    clients.add(socket);

    socket.on('close', () => {
      clients.delete(socket);
    });
  });

  const pushSnapshot = async () => {
    const payload = await loadRealtimeMetricsSnapshot();
    const message = JSON.stringify(payload);

    for (const socket of clients) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  };

  const interval = setInterval(() => {
    void pushSnapshot();
  }, 5000);

  void pushSnapshot();

  return {
    close() {
      clearInterval(interval);
      server.close();
    }
  };
}