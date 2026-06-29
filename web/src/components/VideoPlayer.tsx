import { useRef, useEffect } from 'react';

interface Props {
  stream: MediaStream | null;
  muted?: boolean;
  label: string;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
}

export default function VideoPlayer({ stream, muted, label, audioEnabled, videoEnabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = stream && videoEnabled !== false;
  const hasAudio = stream && audioEnabled !== false;

  // Get initials for avatar
  const initials = label
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="video-container">
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
        />
      ) : (
        <div className="no-video-placeholder">
          <div className="avatar">{initials}</div>
          <span>{label}</span>
        </div>
      )}

      <div className="video-label">{label}</div>

      {!hasAudio && (
        <div className="video-muted-indicator">🔇</div>
      )}
    </div>
  );
}
