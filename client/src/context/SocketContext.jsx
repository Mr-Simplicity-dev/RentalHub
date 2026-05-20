import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io } from 'socket.io-client';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuth';
import { getAuthToken } from '../services/authStorage';
import CallNotification from '../components/calls/CallNotification';
import CallSessionPanel from '../components/calls/AudioCallPanel';
import { getWebRtcIceServers } from '../config/webrtcConfig';

export const SocketContext = createContext(null);

const getSocketUrl = () => {
  const configured =
    process.env.REACT_APP_SOCKET_URL ||
    process.env.REACT_APP_API_URL ||
    '';

  if (!configured || configured === '/api') {
    return undefined;
  }

  return configured.replace(/\/api\/?$/, '');
};

const isVideoEnabledCall = (callType) => ['video', 'virtual_tour'].includes(callType);

export const SocketProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null);
  const [activeCallNotice, setActiveCallNotice] = useState(null);
  const [activeMediaCall, setActiveMediaCall] = useState(null);
  const [mediaCallStatus, setMediaCallStatus] = useState('idle');
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenShareSupported, setScreenShareSupported] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const stopScreenShareRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const activeMediaCallRef = useRef(null);
  const mediaInitPromiseRef = useRef(null);

  const cleanupMediaResources = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      screenStreamRef.current = null;
    }

    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    remoteStreamRef.current = null;
    cameraTrackRef.current = null;
    activeMediaCallRef.current = null;
    mediaInitPromiseRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setActiveMediaCall(null);
    setMediaCallStatus('idle');
    setMicrophoneEnabled(true);
    setCameraEnabled(true);
    setScreenSharing(false);
  }, []);

  useEffect(() => {
    setScreenShareSupported(Boolean(navigator.mediaDevices?.getDisplayMedia));
  }, []);

  const createPeerConnection = useCallback((call, activeSocket) => {
    const peer = new RTCPeerConnection({
      iceServers: getWebRtcIceServers(),
    });
    const nextRemoteStream = new MediaStream();

    remoteStreamRef.current = nextRemoteStream;
    setRemoteStream(nextRemoteStream);

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      activeSocket.emit('call:signal:ice-candidate', {
        callId: call.callId,
        candidate: event.candidate,
      });
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams || [];
      const tracks = stream?.getTracks?.() || [event.track].filter(Boolean);
      tracks.forEach((track) => {
        if (!nextRemoteStream.getTracks().some((item) => item.id === track.id)) {
          nextRemoteStream.addTrack(track);
        }
      });
      setRemoteStream(nextRemoteStream);
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        setMediaCallStatus('connected');
      } else if (['disconnected', 'checking'].includes(peer.connectionState)) {
        setMediaCallStatus('reconnecting');
      } else if (['failed', 'closed'].includes(peer.connectionState)) {
        setMediaCallStatus(peer.connectionState === 'failed' ? 'failed' : 'idle');
      }
    };

    return peer;
  }, []);

  const beginMediaCall = useCallback(
    (call, { initiator = false, activeSocket } = {}) => {
      if (!call?.callId || !activeSocket) return Promise.resolve(null);

      if (activeMediaCallRef.current?.callId === call.callId && peerRef.current) {
        return Promise.resolve(peerRef.current);
      }

      if (mediaInitPromiseRef.current) {
        return mediaInitPromiseRef.current;
      }

      const initPromise = (async () => {
        cleanupMediaResources();
        const isVideoCall = isVideoEnabledCall(call.callType);
        activeMediaCallRef.current = call;
        setActiveMediaCall(call);
        setActiveCallNotice(null);
        setMediaCallStatus(isVideoCall ? 'requesting_camera' : 'requesting_microphone');

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Calls require a supported HTTPS browser.');
        }

        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideoCall ? { facingMode: 'user' } : false,
        });

        localStreamRef.current = localStream;
        cameraTrackRef.current = localStream.getVideoTracks()[0] || null;
        setLocalStream(localStream);
        setMicrophoneEnabled(true);
        setCameraEnabled(isVideoCall ? localStream.getVideoTracks().some((track) => track.enabled) : false);
        setScreenSharing(false);

        const peer = createPeerConnection(call, activeSocket);
        peerRef.current = peer;

        localStream.getTracks().forEach((track) => {
          peer.addTrack(track, localStream);
        });

        setMediaCallStatus('connecting');

        if (initiator) {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          activeSocket.emit('call:signal:offer', {
            callId: call.callId,
            description: peer.localDescription,
          });
        }

        return peer;
      })();

      mediaInitPromiseRef.current = initPromise;

      return initPromise.catch((error) => {
        cleanupMediaResources();
        toast.error(error.message || 'Unable to start call');
        activeSocket.emit('call:end', { callId: call.callId });
        return null;
      }).finally(() => {
        mediaInitPromiseRef.current = null;
      });
    },
    [cleanupMediaResources, createPeerConnection]
  );

  const toggleMicrophone = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks?.() || [];
    if (!tracks.length) return;

    const nextEnabled = !microphoneEnabled;
    tracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setMicrophoneEnabled(nextEnabled);
  }, [microphoneEnabled]);

  const toggleCamera = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks?.() || [];
    if (!tracks.length) return;

    const nextEnabled = !cameraEnabled;
    tracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setCameraEnabled(nextEnabled);
  }, [cameraEnabled]);

  const stopScreenShare = useCallback(async () => {
    const screenStream = screenStreamRef.current;
    const screenTrack = screenStream?.getVideoTracks?.()[0];
    const cameraTrack =
      cameraTrackRef.current || localStreamRef.current?.getVideoTracks?.()[0];
    const videoSender = peerRef.current
      ?.getSenders()
      .find((sender) => sender.track?.kind === 'video');

    screenStreamRef.current = null;

    if (screenTrack) {
      screenTrack.onended = null;
    }

    if (videoSender && cameraTrack && cameraTrack.readyState !== 'ended') {
      cameraTrack.enabled = cameraEnabled;
      await videoSender.replaceTrack(cameraTrack);
    }

    screenStream?.getTracks?.().forEach((track) => {
      if (track.readyState !== 'ended') {
        track.stop();
      }
    });

    setLocalStream(localStreamRef.current);
    setScreenSharing(false);
  }, [cameraEnabled]);

  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
  }, [stopScreenShare]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      await stopScreenShare();
      return;
    }

      if (!isVideoEnabledCall(activeMediaCallRef.current?.callType)) {
        toast.info('Screen sharing is available during video calls only');
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error('Screen sharing is not supported on this browser');
      return;
    }

    const videoSender = peerRef.current
      ?.getSenders()
      .find((sender) => sender.track?.kind === 'video');

    if (!videoSender) {
      toast.error('Video connection is not ready for screen sharing');
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenTrack = screenStream.getVideoTracks()[0];

      if (!screenTrack) {
        throw new Error('No screen video track was selected');
      }

      screenTrack.onended = () => {
        stopScreenShareRef.current?.();
      };

      screenStreamRef.current = screenStream;
      await videoSender.replaceTrack(screenTrack);
      setLocalStream(new MediaStream([screenTrack]));
      setScreenSharing(true);
    } catch (error) {
      if (error.name !== 'NotAllowedError') {
        toast.error(error.message || 'Could not start screen sharing');
      }
    }
  }, [screenSharing, stopScreenShare]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setConnected(false);
      setOnlineUserIds(new Set());
      setIncomingCall(null);
      setOutgoingCall(null);
      setActiveCallNotice(null);
      cleanupMediaResources();
      return undefined;
    }

    const token = getAuthToken();
    if (!token) return undefined;

    const nextSocket = io(getSocketUrl(), {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    setSocket(nextSocket);

    nextSocket.on('connect', () => setConnected(true));
    nextSocket.on('disconnect', () => setConnected(false));
    nextSocket.on('connect_error', (error) => {
      setConnected(false);
      console.warn('Socket connection failed:', error.message);
    });

    nextSocket.on('presence:state', ({ users = [] }) => {
      setOnlineUserIds(new Set(users.map((item) => String(item.id))));
    });

    nextSocket.on('presence:online', ({ user: onlineUser }) => {
      if (!onlineUser?.id) return;
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.add(String(onlineUser.id));
        return next;
      });
    });

    nextSocket.on('presence:offline', ({ userId }) => {
      if (!userId) return;
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.delete(String(userId));
        return next;
      });
    });

    nextSocket.on('call:incoming', (call) => {
      setIncomingCall(call);
      toast.info(`${call.caller?.full_name || 'Someone'} is calling you`);
    });

    nextSocket.on('call:outgoing', (call) => {
      setOutgoingCall(call);
      if (call.receiverOnline === false) {
        toast.info('Call notification sent. The receiver is currently offline.');
      } else {
        toast.info(`Calling ${call.receiver?.full_name || 'receiver'}...`);
      }
    });

    nextSocket.on('call:accepted', (call) => {
      setIncomingCall(null);
      setOutgoingCall(null);
      if (['audio', 'video', 'virtual_tour'].includes(call.callType)) {
        const initiator = Number(call.caller?.id) === Number(user.id);
        beginMediaCall(call, { initiator, activeSocket: nextSocket });
        toast.success(
          call.callType === 'virtual_tour'
            ? 'Virtual tour accepted. Starting video...'
            : `Call accepted. Starting ${call.callType}...`
        );
      } else {
        setActiveCallNotice(call);
        toast.success('Call accepted.');
      }
    });

    nextSocket.on('call:rejected', (call) => {
      setIncomingCall(null);
      setOutgoingCall(null);
      setActiveCallNotice(null);
      cleanupMediaResources();
      toast.info(`${call.receiver?.full_name || 'Receiver'} rejected the call`);
    });

    nextSocket.on('call:missed', (call) => {
      setIncomingCall(null);
      setOutgoingCall(null);
      setActiveCallNotice(null);
      cleanupMediaResources();
      toast.warning('Call missed');
    });

    nextSocket.on('call:ended', () => {
      setIncomingCall(null);
      setOutgoingCall(null);
      setActiveCallNotice(null);
      cleanupMediaResources();
      toast.info('Call ended');
    });

    nextSocket.on('call:signal:offer', async (payload) => {
      try {
        const call = activeMediaCallRef.current?.callId === payload.callId
          ? activeMediaCallRef.current
          : payload;
        const peer = await beginMediaCall(call, {
          initiator: false,
          activeSocket: nextSocket,
        });

        if (!peer) return;

        await peer.setRemoteDescription(
          new RTCSessionDescription(payload.description)
        );
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        nextSocket.emit('call:signal:answer', {
          callId: payload.callId,
          description: peer.localDescription,
        });
      } catch (error) {
        toast.error(error.message || 'Could not answer call');
        nextSocket.emit('call:end', { callId: payload.callId });
      }
    });

    nextSocket.on('call:signal:answer', async (payload) => {
      try {
        if (!peerRef.current) return;
        await peerRef.current.setRemoteDescription(
          new RTCSessionDescription(payload.description)
        );
      } catch (error) {
        toast.error(error.message || 'Could not connect call');
        nextSocket.emit('call:end', { callId: payload.callId });
      }
    });

    nextSocket.on('call:signal:ice-candidate', async (payload) => {
      try {
        if (!peerRef.current || !payload.candidate) return;
        await peerRef.current.addIceCandidate(
          new RTCIceCandidate(payload.candidate)
        );
      } catch {
        // Ignore late ICE candidates after a call has ended.
      }
    });

    return () => {
      nextSocket.disconnect();
      setSocket(null);
      setConnected(false);
      cleanupMediaResources();
    };
  }, [beginMediaCall, cleanupMediaResources, isAuthenticated, user?.id]);

  const isUserOnline = useCallback(
    (userId) => Boolean(userId && onlineUserIds.has(String(userId))),
    [onlineUserIds]
  );

  const requestPresence = useCallback(
    (userIds = []) => new Promise((resolve) => {
      if (!socket?.connected || !Array.isArray(userIds) || userIds.length === 0) {
        resolve({});
        return;
      }

      socket.timeout(5000).emit('presence:check', { userIds }, (error, response) => {
        if (error || !response?.success) {
          resolve({});
          return;
        }

        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          Object.entries(response.statuses || {}).forEach(([userId, online]) => {
            if (online) {
              next.add(String(userId));
            } else {
              next.delete(String(userId));
            }
          });
          return next;
        });

        resolve(response.statuses || {});
      });
    }),
    [socket]
  );

  const startCall = useCallback(
    (payload = {}) => new Promise((resolve) => {
      if (!socket?.connected) {
        toast.error('Realtime connection is not ready yet');
        resolve({ success: false });
        return;
      }

      socket.timeout(8000).emit('call:invite', payload, (error, response) => {
        if (error || !response?.success) {
          toast.error(response?.message || 'Could not send call notification');
          resolve({ success: false, message: response?.message });
          return;
        }

        resolve(response);
      });
    }),
    [socket]
  );

  const acceptCall = useCallback(
    (callId) => new Promise((resolve) => {
      if (!socket?.connected || !callId) {
        resolve({ success: false });
        return;
      }

      socket.timeout(5000).emit('call:accept', { callId }, (error, response) => {
        if (error || !response?.success) {
          toast.error(response?.message || 'Could not accept call');
          resolve({ success: false });
          return;
        }
        resolve(response);
      });
    }),
    [socket]
  );

  const rejectCall = useCallback(
    (callId) => new Promise((resolve) => {
      if (!socket?.connected || !callId) {
        resolve({ success: false });
        return;
      }

      socket.timeout(5000).emit('call:reject', { callId }, (error, response) => {
        if (error || !response?.success) {
          toast.error(response?.message || 'Could not reject call');
          resolve({ success: false });
          return;
        }
        resolve(response);
      });
    }),
    [socket]
  );

  const endCall = useCallback(
    (callId) => new Promise((resolve) => {
      const targetCallId = callId || activeMediaCallRef.current?.callId;
      if (!socket?.connected || !targetCallId) {
        cleanupMediaResources();
        resolve({ success: false });
        return;
      }

      socket.timeout(5000).emit('call:end', { callId: targetCallId }, (error, response) => {
        if (error || !response?.success) {
          toast.error(response?.message || 'Could not end call');
          cleanupMediaResources();
          resolve({ success: false });
          return;
        }
        resolve(response);
      });
    }),
    [cleanupMediaResources, socket]
  );

  const value = useMemo(
    () => ({
      socket,
      connected,
      onlineUserIds,
      incomingCall,
      outgoingCall,
      activeCallNotice,
      activeMediaCall,
      activeAudioCall: activeMediaCall,
      mediaCallStatus,
      audioCallStatus: mediaCallStatus,
      microphoneEnabled,
      cameraEnabled,
      screenSharing,
      screenShareSupported,
      localStream,
      remoteStream,
      isUserOnline,
      requestPresence,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMicrophone,
      toggleCamera,
      toggleScreenShare,
    }),
    [
      socket,
      connected,
      onlineUserIds,
      incomingCall,
      outgoingCall,
      activeCallNotice,
      activeMediaCall,
      mediaCallStatus,
      microphoneEnabled,
      cameraEnabled,
      screenSharing,
      screenShareSupported,
      localStream,
      remoteStream,
      isUserOnline,
      requestPresence,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMicrophone,
      toggleCamera,
      toggleScreenShare,
    ]
  );

  return (
    <SocketContext.Provider value={value}>
      {children}
      <CallNotification
        incomingCall={incomingCall}
        outgoingCall={outgoingCall}
        activeCallNotice={activeCallNotice}
        onAccept={acceptCall}
        onReject={rejectCall}
        onEnd={endCall}
      />
      <CallSessionPanel
        call={activeMediaCall}
        currentUserId={user?.id}
        status={mediaCallStatus}
        microphoneEnabled={microphoneEnabled}
        cameraEnabled={cameraEnabled}
        screenSharing={screenSharing}
        screenShareSupported={screenShareSupported}
        localStream={localStream}
        remoteStream={remoteStream}
        onToggleMute={toggleMicrophone}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onEnd={endCall}
      />
    </SocketContext.Provider>
  );
};
