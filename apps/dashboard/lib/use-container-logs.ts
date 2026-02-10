'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

export interface LogMessage {
  type: 'log' | 'error' | 'connected' | 'disconnected';
  line?: string;
  message?: string;
  timestamp: string;
}

interface UseContainerLogsOptions {
  containerId: string | null;
  enabled?: boolean;
  maxLines?: number;
}

export function useContainerLogs({ containerId, enabled = true, maxLines = 500 }: UseContainerLogsOptions) {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldConnectRef = useRef(true);

  const connect = useCallback(() => {
    if (!containerId || !enabled || !shouldConnectRef.current) return;

    const token = localStorage.getItem('token');
    if (!token) {
      setError('No authentication token');
      return;
    }

    try {
      // Determine WebSocket URL based on current location
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = process.env.NODE_ENV === 'development' ? ':3001' : '';
      const wsUrl = `${protocol}//${host}${port}/ws/containers/${containerId}/logs?token=${token}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        setLogs(prev => [...prev, {
          type: 'connected',
          message: 'Connected to container logs',
          timestamp: new Date().toISOString()
        }]);
      };

      ws.onmessage = (event) => {
        try {
          const message: LogMessage = JSON.parse(event.data);
          setLogs(prev => {
            const updated = [...prev, message];
            // Keep only last maxLines
            if (updated.length > maxLines) {
              return updated.slice(-maxLines);
            }
            return updated;
          });
        } catch (err) {
          console.error('Failed to parse log message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error');
      };

      ws.onclose = () => {
        setIsConnected(false);
        setLogs(prev => [...prev, {
          type: 'disconnected',
          message: 'Disconnected from container logs',
          timestamp: new Date().toISOString()
        }]);

        // Attempt reconnection after 3 seconds if should still be connected
        if (shouldConnectRef.current && enabled && containerId) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [containerId, enabled, maxLines]);

  const disconnect = useCallback(() => {
    shouldConnectRef.current = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    shouldConnectRef.current = true;
    if (enabled && containerId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [containerId, enabled, connect, disconnect]);

  return {
    logs,
    isConnected,
    error,
    clearLogs,
    reconnect: connect
  };
}
