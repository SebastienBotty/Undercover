'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface UseGameSocketResult {
  status: ConnectionStatus;
  lastMessage: any | null;
  send: (message: object) => void;
}

export function useGameSocket(url: string | null): UseGameSocketResult {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [lastMessage, setLastMessage] = useState<any | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      setStatus('connecting');
      const ws = new WebSocket(url as string);
      wsRef.current = ws;

      ws.onopen = () => setStatus('open');
      ws.onmessage = (event: any) => setLastMessage(JSON.parse(event.data));
      ws.onerror = () => setStatus('error');
      ws.onclose = () => {
        setStatus('closed');
        if (!cancelled) {
          retryTimeout = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url]);

  const send = useCallback((message: object) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  return { status, lastMessage, send };
}
