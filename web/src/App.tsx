import { useState } from 'react';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';

type Page = 'home' | 'room';

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');

  const handleJoin = (rid: string, name: string) => {
    setRoomId(rid);
    setUserName(name);
    setPage('room');
  };

  const handleLeave = () => {
    setPage('home');
    setRoomId('');
  };

  if (page === 'room' && roomId) {
    return <RoomPage roomId={roomId} userName={userName} onLeave={handleLeave} />;
  }

  return <HomePage onJoin={handleJoin} />;
}
