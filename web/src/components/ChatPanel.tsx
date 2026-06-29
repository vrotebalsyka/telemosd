import { useState, useRef, useEffect, FormEvent } from 'react';
import type { WSMessage } from '../hooks/useWebSocket';

interface Props {
  userId: string;
  userName: string;
  lastMessage: WSMessage | null;
  sendMessage: (text: string) => void;
}

interface ChatMsg {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

export default function ChatPanel({ userId, userName, lastMessage, sendMessage }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Handle incoming chat messages
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'chat-message') {
      const msg = lastMessage.payload as ChatMsg;
      setMessages(prev => [...prev, msg]);
    }

    if (lastMessage.type === 'chat-history') {
      const history = lastMessage.payload?.messages as ChatMsg[];
      if (history) {
        setMessages(history);
      }
    }
  }, [lastMessage]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">Чат</div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{ color: '#666', fontSize: 14, textAlign: 'center', padding: 24 }}>
            Сообщений пока нет
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`chat-message ${msg.userId === userId ? 'own' : ''}`}
          >
            <div className="meta">
              {msg.userName} · {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text">{msg.text}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input-area" onSubmit={handleSubmit}>
        <input
          placeholder="Напишите сообщение..."
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button type="submit">→</button>
      </form>
    </div>
  );
}
