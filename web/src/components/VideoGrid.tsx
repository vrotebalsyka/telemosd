import VideoPlayer from './VideoPlayer';

interface Props {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  userName: string;
  remoteUserName: string;
}

export default function VideoGrid({ localStream, remoteStream, audioEnabled, videoEnabled, userName, remoteUserName }: Props) {
  const hasRemote = !!remoteStream;

  return (
    <div className={`video-grid ${!hasRemote ? 'single' : ''}`}>
      <VideoPlayer
        stream={localStream}
        muted
        label={userName}
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
      />
      {hasRemote && (
        <VideoPlayer
          stream={remoteStream}
          label={remoteUserName}
        />
      )}
    </div>
  );
}
