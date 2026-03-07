'use client';

import { useEffect, useRef, useCallback } from 'react';
import { resolveWebSocketBaseUrl } from '../lib/api';

interface TerminalProps {
  projectId: string;
  token: string;
  className?: string;
}

export default function Terminal({ projectId, token, className }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import('xterm').Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<import('xterm-addon-fit').FitAddon | null>(null);

  const connect = useCallback(async () => {
    if (!containerRef.current) return;

    const { Terminal } = await import('xterm');
    const { FitAddon } = await import('xterm-addon-fit');
    const { WebLinksAddon } = await import('xterm-addon-web-links');

    // Dispose existing
    termRef.current?.dispose();
    wsRef.current?.close();

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
      theme: {
        background: '#0a0a0a',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
        blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
        brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b',
        brightYellow: '#f5f543', brightBlue: '#3b8eea', brightMagenta: '#d670d6',
        brightCyan: '#29b8db', brightWhite: '#e5e5e5',
      },
      allowTransparency: false,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    // Connect WebSocket
    const base = resolveWebSocketBaseUrl();
    const cols = term.cols;
    const rows = term.rows;
    const ws = new WebSocket(
      `${base}/ws/projects/${projectId}/terminal?token=${encodeURIComponent(token)}&cols=${cols}&rows=${rows}`,
    );
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      term.write('\r\n\x1b[32m● Connected to dev container\x1b[0m\r\n\r\n');
    };

    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        // Could be a JSON control message
        try {
          const msg = JSON.parse(e.data) as Record<string, unknown>;
          if (msg.type === 'error') {
            term.write(`\r\n\x1b[31m⚠ ${msg.message}\x1b[0m\r\n`);
            return;
          }
          if (msg.type === 'connected') {
            return; // already handled onopen
          }
        } catch {
          term.write(e.data);
        }
      } else {
        term.write(new Uint8Array(e.data as ArrayBuffer));
      }
    };

    ws.onclose = (e) => {
      term.write(`\r\n\x1b[33m● Disconnected (${e.code})\x1b[0m\r\n`);
    };

    ws.onerror = () => {
      term.write('\r\n\x1b[31m● Connection error\x1b[0m\r\n');
    };

    // Terminal input → WebSocket
    term.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Resize handler
    const resizeObs = new ResizeObserver(() => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });

    if (containerRef.current) {
      resizeObs.observe(containerRef.current);
    }

    // Cleanup
    return () => {
      resizeObs.disconnect();
      ws.close();
      term.dispose();
    };
  }, [projectId, token]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    connect().then((fn) => { cleanup = fn; });
    return () => {
      cleanup?.();
      termRef.current?.dispose();
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <div className={`flex flex-col h-full bg-[#0a0a0a] ${className ?? ''}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
        <span className="text-xs text-gray-500 ml-2 flex-1">Terminal — bash</span>
        <button
          onClick={() => connect()}
          className="text-xs text-gray-500 hover:text-white"
          title="Reconnect"
        >⟳</button>
      </div>

      {/* Mobile keyboard helpers */}
      <div className="flex gap-1 px-2 py-1 bg-gray-900 border-b border-gray-800 overflow-x-auto shrink-0 sm:hidden">
        {['Tab', 'Ctrl+C', 'Ctrl+D', 'Esc', '↑', '↓', '←', '→'].map((key) => (
          <button
            key={key}
            className="shrink-0 px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded border border-gray-700 hover:bg-gray-700"
            onClick={() => {
              const ws = wsRef.current;
              if (!ws || ws.readyState !== WebSocket.OPEN) return;
              const map: Record<string, string> = {
                Tab: '\x09', 'Ctrl+C': '\x03', 'Ctrl+D': '\x04',
                Esc: '\x1b', '↑': '\x1b[A', '↓': '\x1b[B', '←': '\x1b[D', '→': '\x1b[C',
              };
              ws.send(map[key] ?? key);
            }}
          >{key}</button>
        ))}
      </div>

      {/* xterm container */}
      <div ref={containerRef} className="flex-1 p-2 overflow-hidden" />
    </div>
  );
}
