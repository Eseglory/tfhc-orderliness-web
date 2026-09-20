'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

interface CallState {
  callId: string;
  roomId: string;
  isIncoming: boolean;
  peerName: string;
  targetMemberId?: string;
  isVideo: boolean;
  connected: boolean;
}

export function WebRtcCallModal({
  socket,
  currentMemberId,
}: {
  socket: Socket | null;
  currentMemberId?: string | null;
}) {
  const [call, setCall] = useState<CallState | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Timer for duration
  useEffect(() => {
    if (!call?.connected) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(t);
  }, [call?.connected]);

  const cleanUpCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;

    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    setCall(null);
    setMicMuted(false);
    setCamOff(false);
    setElapsed(0);
  }, []);

  const endCall = useCallback(() => {
    if (call && socket) {
      socket.emit('call:end', {
        callId: call.callId,
        roomId: call.roomId,
        targetMemberId: call.targetMemberId,
      });
    }
    cleanUpCall();
  }, [call, socket, cleanUpCall]);

  const rejectCall = useCallback(() => {
    if (call && socket) {
      socket.emit('call:reject', {
        callId: call.callId,
        roomId: call.roomId,
        targetMemberId: call.targetMemberId,
      });
    }
    cleanUpCall();
  }, [call, socket, cleanUpCall]);

  const setupPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && socket && call) {
        socket.emit('call:signal', {
          targetMemberId: call.targetMemberId,
          roomId: call.roomId,
          callId: call.callId,
          signal: { type: 'candidate', candidate: event.candidate },
        });
      }
    };

    pc.ontrack = (event) => {
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }
      event.streams[0].getTracks().forEach((track) => {
        remoteStreamRef.current?.addTrack(track);
      });

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCall((prev) => (prev ? { ...prev, connected: true } : null));
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        cleanUpCall();
      }
    };

    return pc;
  }, [socket, call, cleanUpCall]);

  // Handle incoming call signal / response
  const acceptCall = async () => {
    if (!call || !socket) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: call.isVideo,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current && call.isVideo) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = setupPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Signal ready for offer / negotiation
      socket.emit('call:signal', {
        targetMemberId: call.targetMemberId,
        roomId: call.roomId,
        callId: call.callId,
        signal: { type: 'ready' },
      });
    } catch {
      rejectCall();
    }
  };

  // Socket signaling listener
  useEffect(() => {
    if (!socket) return;

    const onIncoming = (data: {
      callId: string;
      roomId: string;
      caller: { memberId: string; name: string };
      isVideo: boolean;
    }) => {
      if (data.caller.memberId === currentMemberId) return;
      setCall({
        callId: data.callId,
        roomId: data.roomId,
        isIncoming: true,
        peerName: data.caller.name,
        targetMemberId: data.caller.memberId,
        isVideo: data.isVideo,
        connected: false,
      });
    };

    const onSignal = async (data: {
      fromMemberId: string;
      signal: any;
      callId: string;
    }) => {
      const pc = pcRef.current;
      const sig = data.signal;

      if (sig.type === 'ready') {
        // We are the caller, send offer
        if (pc) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call:signal', {
            targetMemberId: data.fromMemberId,
            callId: data.callId,
            signal: offer,
          });
        }
      } else if (sig.type === 'offer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(sig));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('call:signal', {
            targetMemberId: data.fromMemberId,
            callId: data.callId,
            signal: answer,
          });
        }
      } else if (sig.type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(sig));
        }
      } else if (sig.type === 'candidate') {
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
          } catch {}
        }
      }
    };

    const onEnded = () => cleanUpCall();
    const onRejected = () => {
      cleanUpCall();
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:signal', onSignal);
    socket.on('call:ended', onEnded);
    socket.on('call:rejected', onRejected);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:signal', onSignal);
      socket.off('call:ended', onEnded);
      socket.off('call:rejected', onRejected);
    };
  }, [socket, currentMemberId, cleanUpCall]);

  // Expose global initiate call trigger
  useEffect(() => {
    const handleInitiate = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        roomId: string;
        targetMemberId?: string;
        peerName: string;
        isVideo: boolean;
      };
      if (!socket) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: detail.isVideo,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current && detail.isVideo) {
          localVideoRef.current.srcObject = stream;
        }

        socket.emit(
          'call:initiate',
          {
            roomId: detail.roomId,
            targetMemberId: detail.targetMemberId,
            isVideo: detail.isVideo,
          },
          (res: { ok: boolean; callId?: string }) => {
            if (res.ok && res.callId) {
              setCall({
                callId: res.callId,
                roomId: detail.roomId,
                isIncoming: false,
                peerName: detail.peerName,
                targetMemberId: detail.targetMemberId,
                isVideo: detail.isVideo,
                connected: false,
              });
              const pc = setupPeerConnection();
              stream.getTracks().forEach((t) => pc.addTrack(t, stream));
            } else {
              cleanUpCall();
            }
          }
        );
      } catch {
        cleanUpCall();
      }
    };

    window.addEventListener('tfhc:start-call', handleInitiate);
    return () => window.removeEventListener('tfhc:start-call', handleInitiate);
  }, [socket, setupPeerConnection, cleanUpCall]);

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCam = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCamOff(!videoTrack.enabled);
      }
    }
  };

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (!call) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
      {/* Hidden audio element for remote audio */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 text-white shadow-2xl flex flex-col items-center justify-between min-h-[360px] max-h-[85vh] overflow-y-auto">
        {/* Call Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-[11px] font-bold text-slate-300">
            <span className="material-symbols-outlined text-sm text-[#f2320c]">
              {call.isVideo ? 'videocam' : 'call'}
            </span>
            <span>{call.isVideo ? 'Video Call' : 'Voice Call'}</span>
          </div>
          <h2 className="text-xl font-extrabold text-white mt-1">{call.peerName}</h2>
          <p className="text-xs text-slate-400 font-mono">
            {call.connected
              ? formatTimer(elapsed)
              : call.isIncoming
              ? 'Incoming call…'
              : 'Ringing…'}
          </p>
        </div>

        {/* Video or Avatar Display */}
        <div className="relative w-full aspect-video rounded-2xl bg-slate-950 overflow-hidden flex items-center justify-center border border-slate-800/80 my-4 shadow-inner">
          {call.isVideo ? (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-3 right-3 w-28 h-20 rounded-xl bg-black/60 overflow-hidden border border-white/20 shadow-lg">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-24 h-24 rounded-full bg-[#f2320c]/20 border-2 border-[#f2320c] flex items-center justify-center text-white text-3xl font-extrabold shadow-xl">
                {call.peerName.charAt(0).toUpperCase()}
              </div>
              <p className="text-xs text-slate-400">
                {call.connected ? 'Call in progress' : 'Connecting audio stream…'}
              </p>
            </div>
          )}
        </div>

        {/* Action Controls */}
        {call.isIncoming && !call.connected ? (
          <div className="flex items-center gap-6">
            <button
              onClick={rejectCall}
              className="flex flex-col items-center gap-1 text-xs font-bold text-rose-400 active:scale-95 transition-all"
            >
              <div className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 flex items-center justify-center text-white shadow-lg shadow-rose-600/30">
                <span className="material-symbols-outlined text-2xl">call_end</span>
              </div>
              <span>Decline</span>
            </button>
            <button
              onClick={acceptCall}
              className="flex flex-col items-center gap-1 text-xs font-bold text-emerald-400 active:scale-95 transition-all"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30 animate-pulse">
                <span className="material-symbols-outlined text-2xl">call</span>
              </div>
              <span>Accept</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button
              onClick={toggleMic}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                micMuted ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-slate-800 text-white hover:bg-slate-700'
              }`}
              title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              <span className="material-symbols-outlined text-xl">
                {micMuted ? 'mic_off' : 'mic'}
              </span>
            </button>

            {call.isVideo && (
              <button
                onClick={toggleCam}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                  camOff ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-slate-800 text-white hover:bg-slate-700'
                }`}
                title={camOff ? 'Turn camera on' : 'Turn camera off'}
              >
                <span className="material-symbols-outlined text-xl">
                  {camOff ? 'videocam_off' : 'videocam'}
                </span>
              </button>
            )}

            <button
              onClick={endCall}
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 flex items-center justify-center text-white shadow-lg shadow-rose-600/30 active:scale-95 transition-all"
              title="End Call"
            >
              <span className="material-symbols-outlined text-2xl">call_end</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
