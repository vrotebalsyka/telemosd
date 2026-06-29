import { useState, useEffect, FormEvent } from 'react';

interface Props {
  onJoin: (roomId: string, name: string) => void;
}

export default function HomePage({ onJoin }: Props) {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');

  // Read room ID from URL ?room= parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setRoomId(room);
    }
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onJoin('__create__', name.trim());
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !roomId.trim()) return;
    onJoin(roomId.trim(), name.trim());
  };

  return (
    <div className="home-page">
      <div className="home-card">
        <h1>📹 Telemost</h1>
        <p>Видеозвонки и демонстрация экрана</p>

        <form className="home-form" onSubmit={handleCreate}>
          <input
            placeholder="Ваше имя"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary">
            Создать комнату
          </button>
        </form>

        <div className="divider">или</div>

        <form className="home-form" onSubmit={handleJoin}>
          <input
            placeholder={roomId || 'ID комнаты'}
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
            required
          />
          <button type="submit" className="btn-secondary">
            {roomId ? '🔗 Присоединиться к комнате' : 'Присоединиться'}
          </button>
        </form>
      </div>
    </div>
  );
}
