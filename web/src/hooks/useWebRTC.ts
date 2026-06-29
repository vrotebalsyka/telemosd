import { useRef, useEffect, useCallback, useState } from 'react';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface UseWebRTCOpts {
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onRemoteTrack: (stream: MediaStream) => void;
}

export default function useWebRTC() {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const callbacksRef = useRef<UseWebRTCOpts>({
    onIceCandidate: () => {},
    onRemoteTrack: () => {},
  });

  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach(t => t.stop());
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, []);

  const init = useCallback(async (opts: UseWebRTCOpts) => {
    callbacksRef.current = opts;
    localStream?.getTracks().forEach(t => t.stop());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('getUserMedia error:', err);
      // Try without video
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
        setLocalStream(stream);
        return stream;
      } catch (err2) {
        console.error('getUserMedia (audio only) error:', err2);
        return null;
      }
    }
  }, [localStream]);

  const createPeerConnection = useCallback((stream: MediaStream) => {
    pcRef.current?.close();

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        callbacksRef.current.onIceCandidate(e.candidate);
      }
    };

    pc.ontrack = (e) => {
      const ms = e.streams[0];
      setRemoteStream(ms);
      callbacksRef.current.onRemoteTrack(ms);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setRemoteStream(null);
      }
    };

    return pc;
  }, []);

  const createOffer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return null;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }, []);

  const createAnswer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return null;
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }, []);

  const handleRemoteOffer = useCallback(async (sdp: string) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
  }, []);

  const handleRemoteAnswer = useCallback(async (sdp: string) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
  }, []);

  const handleIceCandidate = useCallback(
    (candidate: string, sdpMid: string | null, sdpMLineIndex: number | null) => {
      const pc = pcRef.current;
      if (!pc) return;
      pc.addIceCandidate(new RTCIceCandidate({ candidate, sdpMid, sdpMLineIndex }));
    },
    []
  );

  const toggleAudio = useCallback(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(t => {
      t.enabled = !t.enabled;
    });
    setAudioEnabled(prev => !prev);
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach(t => {
      t.enabled = !t.enabled;
    });
    setVideoEnabled(prev => !prev);
  }, [localStream]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      // Stop screen share - re-enable camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const pc = pcRef.current;
        if (pc && localStream) {
          const videoTrack = stream.getVideoTracks()[0];
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender && videoTrack) {
            await sender.replaceTrack(videoTrack);
          }
          localStream.getVideoTracks().forEach(t => t.stop());
          setLocalStream(stream);
        }
      } catch (err) {
        console.error('Error restoring camera:', err);
      }
      setScreenSharing(false);
    } else {
      // Start screen share
      try {
        const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: true,
          audio: false,
        });
        const pc = pcRef.current;
        if (pc && localStream) {
          const videoTrack = screenStream.getVideoTracks()[0];
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender && videoTrack) {
            await sender.replaceTrack(videoTrack);
          }
          localStream.getVideoTracks().forEach(t => t.stop());
          setLocalStream(screenStream);
        }
        // When user stops screen share via browser UI
        screenStream.getVideoTracks()[0].onended = () => {
          setScreenSharing(false);
        };
      } catch (err) {
        console.error('Screen share error:', err);
        return;
      }
      setScreenSharing(true);
    }
  }, [screenSharing, localStream]);

  const disconnect = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
  }, [localStream]);

  return {
    localStream,
    remoteStream,
    audioEnabled,
    videoEnabled,
    screenSharing,
    init,
    createPeerConnection,
    createOffer,
    createAnswer,
    handleRemoteOffer,
    handleRemoteAnswer,
    handleIceCandidate,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    disconnect,
  };
}
