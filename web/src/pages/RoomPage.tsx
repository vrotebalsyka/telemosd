import { useEffect, useState, useCallback, useRef } from 'react';
import VideoGrid from '../components/VideoGrid';
import Controls from '../components/Controls';
import ChatPanel from '../components/ChatPanel';
import useWebSocket from '../hooks/useWebSocket';
import useWebRTC from '../hooks/useWebRTC';

interface Props {
  roomId: string;
  userName: string;
  onLeave: () => void;
}

interface Participant {
  userId: string;
  userName: string;
}

export default function RoomPage({ roomId, userName, onLeave }: Props) {
  const ws = useWebSocket();
  const rtc = useWebRTC();
  const [roomName, setRoomName] = useState('');
  const [realRoomId, setRealRoomId] = useState(roomId === '__create__' ? '' : roomId);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [myId, setMyId] = useState('');
  const [copied, setCopied] = useState(false);
  const initCalled = useRef(false);
  const otherUserIdRef = useRef('');

  // On WS connect, create or join room
  useEffect(() => {
    if (!ws.connected) return;
    if (roomId === '__create__') {
      ws.send({ type: 'create-room', payload: { roomName: `${userName}'s Room`, userName } });
    } else {
      ws.send({ type: 'join-room', payload: { roomId, name: userName } });
    }
  }, [ws.connected]);

  // Process incoming WS messages
  useEffect(() => {
    if (!ws.lastMessage) return;
    const msg = ws.lastMessage;

    switch (msg.type) {
      case 'room-created': {
        const p = msg.payload;
        setRoomName(p.roomName);
        setRealRoomId(p.roomId);
        setMyId(p.userId);
        setWaiting(true);
        break;
      }

      case 'room-joined': {
        const p = msg.payload;
        setRoomName(p.roomName);
        setMyId(p.userId);
        // We just joined — if others are here, wait for their offer
        if (p.participants?.length > 0) {
          otherUserIdRef.current = p.participants[0].userId;
          setWaiting(false);
        } else {
          setWaiting(true);
        }
        break;
      }

      case 'user-joined': {
        const p = msg.payload;
        setParticipants(prev => [...prev, { userId: p.userId, userName: p.userName }]);
        otherUserIdRef.current = p.userId;
        setWaiting(false);
        startCall(true);
        break;
      }

      case 'user-left': {
        setParticipants([]);
        rtc.disconnect();
        setWaiting(true);
        break;
      }

      case 'offer': {
        const p = msg.payload;
        startCall(false, p.sdp);
        break;
      }

      case 'answer': {
        rtc.handleRemoteAnswer(msg.payload.sdp);
        break;
      }

      case 'ice-candidate': {
        const p = msg.payload;
        rtc.handleIceCandidate(p.candidate, p.sdpMid, p.sdpMLineIndex);
        break;
      }
    }
  }, [ws.lastMessage]);

  const startCall = useCallback(async (isOfferer: boolean, remoteSdp?: string) => {
    if (initCalled.current) return;
    initCalled.current = true;

    const stream = await rtc.init({
      onIceCandidate: (candidate) => {
        ws.send({
          type: 'ice-candidate',
          payload: {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
          },
        });
      },
      onRemoteTrack: () => {},
    });

    if (!stream) return;

    rtc.createPeerConnection(stream);

    if (isOfferer) {
      const offer = await rtc.createOffer();
      if (offer) {
        ws.send({ type: 'offer', payload: { sdp: offer.sdp } });
      }
    } else if (remoteSdp) {
      await rtc.handleRemoteOffer(remoteSdp);
      const answer = await rtc.createAnswer();
      if (answer) {
        ws.send({ type: 'answer', payload: { sdp: answer.sdp } });
      }
    }
  }, [rtc, ws]);

  const handleLeave = useCallback(() => {
    rtc.disconnect();
    onLeave();
  }, [rtc, onLeave]);

  const inviteLink = realRoomId ? `${window.location.origin}/?room=${realRoomId}` : '';

  const copyInviteLink = useCallback(() => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = inviteLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [inviteLink]);

  return (
    <div className="room-page">
      <div className="room-header">
        <h2>{roomName || 'Telemost'}</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {realRoomId && (
            <button className="btn-invite" onClick={copyInviteLink}>
              {copied ? '✓ Скопировано' : '🔗 Пригласить'}
            </button>
          )}
          <button className="btn-leave" onClick={handleLeave}>Завершить</button>
        </div>
      </div>

      <div className="room-content">
        <div className="video-area">
          {waiting ? (
            <div className="waiting-overlay">
              <div className="waiting-spinner" />
              <p>Ожидание собеседника...</p>
              {realRoomId ? (
                <div className="invite-box">
                  <p style={{ fontSize: 13, color: '#aaa', marginBottom: 8 }}>
                    Отправьте эту ссылку собеседнику:
                  </p>
                  <div className="invite-link-row">
                    <input
                      type="text"
                      readOnly
                      value={inviteLink}
                      className="invite-input"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button className="btn-copy" onClick={copyInviteLink}>
                      {copied ? '✓' : '📋'}
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: '#666' }}>Создание комнаты...</p>
              )}
            </div>
          ) : (
            <VideoGrid
              localStream={rtc.localStream}
              remoteStream={rtc.remoteStream}
              audioEnabled={rtc.audioEnabled}
              videoEnabled={rtc.videoEnabled}
              userName={userName}
              remoteUserName={
                participants.find(p => p.userId === otherUserIdRef.current)?.userName || 'Собеседник'
              }
            />
          )}
        </div>

        {chatOpen && (
          <ChatPanel
            userId={myId}
            userName={userName}
            lastMessage={ws.lastMessage}
            sendMessage={(text) => ws.send({ type: 'chat-message', payload: { text } })}
          />
        )}
      </div>

      <Controls
        audioEnabled={rtc.audioEnabled}
        videoEnabled={rtc.videoEnabled}
        screenSharing={rtc.screenSharing}
        chatOpen={chatOpen}
        onToggleAudio={rtc.toggleAudio}
        onToggleVideo={rtc.toggleVideo}
        onToggleScreenShare={rtc.toggleScreenShare}
        onToggleChat={() => setChatOpen(prev => !prev)}
        onLeave={handleLeave}
      />
    </div>
  );
}
