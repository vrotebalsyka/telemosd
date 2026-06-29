import { useEffect, useRef, useState, useCallback } from 'react';

export interface WSMessage {
  type: string;
  payload?: any;
}

export interface UseWSResult {
  send: (msg: WSMessage) => void;
  lastMessage: WSMessage | null;
  connected: boolean;
  messages: WSMessage[];
  clearMessages: () => void;
}

export default function useWebSocket(): UseWSResult {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const handlersRef = useRef<{ [key: string]: (msg: WSMessage) => void }>({});

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws`;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // Auto-reconnect after 2s
        setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          setLastMessage(msg);
          setMessages(prev => [...prev, msg]);

          // Call registered handler
          const handler = handlersRef.current[msg.type];
          if (handler) handler(msg);
        } catch (err) {
          console.error('Invalid WS message:', err);
        }
      };
    }

    connect();

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const send = useCallback((msg: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { send, lastMessage, connected, messages, clearMessages };
}
