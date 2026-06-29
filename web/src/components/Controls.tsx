interface Props {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  chatOpen: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onLeave: () => void;
}

export default function Controls({
  audioEnabled,
  videoEnabled,
  screenSharing,
  chatOpen,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onLeave,
}: Props) {
  return (
    <div className="controls-bar">
      <div className="control-label">
        <button
          className={`control-btn ${!audioEnabled ? 'off' : ''}`}
          onClick={onToggleAudio}
          title={audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
        >
          {audioEnabled ? '🎤' : '🔇'}
        </button>
        <span>Микрофон</span>
      </div>

      <div className="control-label">
        <button
          className={`control-btn ${!videoEnabled ? 'off' : ''}`}
          onClick={onToggleVideo}
          title={videoEnabled ? 'Выключить камеру' : 'Включить камеру'}
        >
          {videoEnabled ? '📷' : '🚫'}
        </button>
        <span>Камера</span>
      </div>

      <div className="control-label">
        <button
          className={`control-btn ${screenSharing ? 'active' : ''}`}
          onClick={onToggleScreenShare}
          title={screenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
        >
          🖥️
        </button>
        <span>Экран</span>
      </div>

      <div className="control-label">
        <button
          className={`control-btn ${chatOpen ? 'active' : ''}`}
          onClick={onToggleChat}
          title="Чат"
        >
          💬
        </button>
        <span>Чат</span>
      </div>

      <div className="control-label">
        <button
          className="control-btn danger"
          onClick={onLeave}
          title="Завершить звонок"
        >
          📞
        </button>
        <span>Завершить</span>
      </div>
    </div>
  );
}
