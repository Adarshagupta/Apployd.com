'use client';

import { useEffect, useRef, useState } from 'react';
import { LogMessage } from '../lib/use-container-logs';

interface ContainerLogViewerProps {
  logs: LogMessage[];
  isConnected: boolean;
  error: string | null;
  onClear?: () => void;
  onReconnect?: () => void;
}

export function ContainerLogViewer({ 
  logs, 
  isConnected, 
  error, 
  onClear,
  onReconnect 
}: ContainerLogViewerProps) {
  const logEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [userScrolled, setUserScrolled] = useState(false);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && !userScrolled && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, userScrolled]);

  // Detect user scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
      
      if (isAtBottom) {
        setUserScrolled(false);
        setAutoScroll(true);
      } else {
        setUserScrolled(true);
        setAutoScroll(false);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const copyLogs = () => {
    const logText = logs
      .filter(log => log.type === 'log')
      .map(log => log.line)
      .join('\n');
    navigator.clipboard.writeText(logText);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const getLogStyle = (log: LogMessage) => {
    if (log.type === 'connected') return 'text-green-400';
    if (log.type === 'disconnected') return 'text-yellow-400';
    if (log.type === 'error') return 'text-red-400';
    
    // Color code based on log content
    const line = log.line?.toLowerCase() || '';
    if (line.includes('error') || line.includes('exception') || line.includes('fatal')) {
      return 'text-red-300';
    }
    if (line.includes('warn') || line.includes('warning')) {
      return 'text-yellow-300';
    }
    if (line.includes('info')) {
      return 'text-blue-300';
    }
    if (line.includes('debug')) {
      return 'text-gray-400';
    }
    
    return 'text-gray-200';
  };

  return (
    <div className="flex flex-col h-full border border-gray-700 rounded-lg overflow-hidden bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-300">
              {isConnected ? 'Connected' : error ? `Error: ${error}` : 'Disconnected'}
            </span>
          </div>
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                setUserScrolled(false);
                logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
            >
              Jump to bottom
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={copyLogs}
            className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-200"
            disabled={logs.length === 0}
          >
            Copy
          </button>
          {onClear && (
            <button
              onClick={onClear}
              className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-200"
              disabled={logs.length === 0}
            >
              Clear
            </button>
          )}
          {!isConnected && onReconnect && (
            <button
              onClick={onReconnect}
              className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
            >
              Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Log content */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm"
        style={{ minHeight: '400px', maxHeight: '600px' }}
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            {isConnected ? 'Waiting for logs...' : 'Not connected'}
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="flex gap-2 mb-1">
              <span className="text-gray-500 select-none shrink-0">
                {formatTimestamp(log.timestamp)}
              </span>
              <span className={getLogStyle(log)}>
                {log.type === 'log' ? log.line : log.message}
              </span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
