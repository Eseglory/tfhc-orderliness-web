'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { soundFx } from '../../lib/sound-fx';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

export type CallStatus =
  | 'idle'
  | 'ringing_incoming'
  | 'ringing_outgoing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'rejected'
  | 'failed';

interface CallState {
  callId: string;
  roomId: string;
  isIncoming: boolean;
  peerName: string;
  targetMemberId?: string;
  isVideo: boolean;
  status: CallStatus;
}

const CALL_TIMEOUT_SECONDS = 35;

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
  const [audioBlocked, setAudioBlocked] = useState(false);

  // Synchronized refs to eliminate stale closure bugs
  const callRef = useRef<CallState | null>(null);
  callRef.current = call;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iceCandidatesQueueRef = useRef<RTCIceCandidateInit[]>([]);

  // Duration timer for connected calls
  useEffect(() => {
    if (call?.status !== 'connected') {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(t);
  }, [call?.status]);

  const cleanUpCall = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }

    soundFx.stopIncomingRingtone();
    soundFx.stopOutgoingRingback();

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;

    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    iceCandidatesQueueRef.current = [];
    setCall(null);
    setMicMuted(false);
    setCamOff(false);
    setElapsed(0);
    setAudioBlocked(false);
  }, []);

  const endCall = useCallback(() => {
    const current = callRef.current;
    if (current && socket) {
      socket.emit('call:end', {
        callId: current.callId,
        roomId: current.roomId,
        targetMemberId: current.targetMemberId,
      });
    }
    cleanUpCall();
  }, [socket, cleanUpCall]);

  const rejectCall = useCallback(() => {
    const current = callRef.current;
    if (current && socket) {
      socket.emit('call:reject', {
        callId: current.callId,
        roomId: current.roomId,
        targetMemberId: current.targetMemberId,
      });
    }
    cleanUpCall();
  }, [socket, cleanUpCall]);

  const flushQueuedIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
    while (iceCandidatesQueueRef.current.length > 0) {
      const candidate = iceCandidatesQueueRef.current.shift();
      if (candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Ignore candidate failure during renegotiation
        }
      }
    }
  }, []);

  const setupPeerConnection = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // Ignore
      }
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      const activeCall = callRef.current;
      if (event.candidate && socket && activeCall) {
        socket.emit('call:signal', {
          targetMemberId: activeCall.targetMemberId,
          roomId: activeCall.roomId,
          callId: activeCall.callId,
          signal: { type: 'candidate', candidate: event.candidate.toJSON() },
        });
      }
    };

    pc.ontrack = (event) => {
      let stream = event.streams && event.streams[0];
      if (!stream) {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(event.track);
        stream = remoteStreamRef.current;
      } else {
        remoteStreamRef.current = stream;
      }

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch(() => {
          setAudioBlocked(true);
        });
      }

      if (remoteVideoRef.current && callRef.current?.isVideo) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch(() => {
          setAudioBlocked(true);
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        soundFx.stopIncomingRingtone();
        soundFx.stopOutgoingRingback();
        if (ringTimeoutRef.current) {
          clearTimeout(ringTimeoutRef.current);
          ringTimeoutRef.current = null;
        }
        setCall((prev) => (prev ? { ...prev, status: 'connected' } : null));
      } else if (pc.connectionState === 'disconnected') {
        setCall((prev) => (prev ? { ...prev, status: 'reconnecting' } : null));
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanUpCall();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        soundFx.stopIncomingRingtone();
        soundFx.stopOutgoingRingback();
      } else if (['failed', 'closed'].includes(pc.iceConnectionState)) {
        cleanUpCall();
      }
    };

    return pc;
  }, [socket, cleanUpCall]);

  // Handle incoming call signal / response
  const acceptCall = async () => {
    const current = callRef.current;
    if (!current || !socket) return;

    soundFx.stopIncomingRingtone();
    soundFx.unlockAudioContext();

    setCall((prev) => (prev ? { ...prev, status: 'connecting' } : null));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: current.isVideo
          ? {
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : false,
      });

      localStreamRef.current = stream;
      if (localVideoRef.current && current.isVideo) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = setupPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Signal caller that we are ready for the SDP offer
      socket.emit('call:signal', {
        targetMemberId: current.targetMemberId,
        roomId: current.roomId,
        callId: current.callId,
        signal: { type: 'ready' },
      });
    } catch (err) {
      console.error('Call media acquisition error:', err);
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

      // Don't interrupt an active call
      if (callRef.current && callRef.current.status === 'connected') {
        socket.emit('call:reject', {
          callId: data.callId,
          roomId: data.roomId,
          targetMemberId: data.caller.memberId,
          reason: 'busy',
        });
        return;
      }

      // Start ringing sound
      soundFx.startIncomingRingtone();

      setCall({
        callId: data.callId,
        roomId: data.roomId,
        isIncoming: true,
        peerName: data.caller.name || 'Member',
        targetMemberId: data.caller.memberId,
        isVideo: Boolean(data.isVideo),
        status: 'ringing_incoming',
      });

      // Ring timeout
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = setTimeout(() => {
        rejectCall();
      }, CALL_TIMEOUT_SECONDS * 1000);
    };

    const onSignal = async (data: {
      fromMemberId: string;
      signal: any;
      callId: string;
    }) => {
      const activeCall = callRef.current;
      if (!activeCall || activeCall.callId !== data.callId) return;

      const pc = pcRef.current;
      const sig = data.signal;
      if (!sig) return;

      try {
        if (sig.type === 'ready') {
          // Caller sends SDP offer
          if (pc) {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: activeCall.isVideo,
            });
            await pc.setLocalDescription(offer);
            socket.emit('call:signal', {
              targetMemberId: data.fromMemberId,
              callId: data.callId,
              signal: offer,
            });
          }
        } else if (sig.type === 'offer') {
          // Recipient receives SDP offer
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(sig));
            await flushQueuedIceCandidates(pc);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('call:signal', {
              targetMemberId: data.fromMemberId,
              callId: data.callId,
              signal: answer,
            });
          }
        } else if (sig.type === 'answer') {
          // Caller receives SDP answer
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(sig));
            await flushQueuedIceCandidates(pc);
          }
        } else if (sig.type === 'candidate' && sig.candidate) {
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
          } else {
            // Queue candidate until remote description is set
            iceCandidatesQueueRef.current.push(sig.candidate);
          }
        }
      } catch (err) {
        console.error('WebRTC signal processing error:', err);
      }
    };

    const onEnded = () => {
      cleanUpCall();
    };

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
  }, [socket, currentMemberId, cleanUpCall, rejectCall, flushQueuedIceCandidates]);

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

      soundFx.unlockAudioContext();
      soundFx.startOutgoingRingback();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: detail.isVideo
            ? {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : false,
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
          (res: { ok: boolean; callId?: string; error?: string }) => {
            if (res.ok && res.callId) {
              setCall({
                callId: res.callId,
                roomId: detail.roomId,
                isIncoming: false,
                peerName: detail.peerName,
                targetMemberId: detail.targetMemberId,
                isVideo: detail.isVideo,
                status: 'ringing_outgoing',
              });

              const pc = setupPeerConnection();
              stream.getTracks().forEach((t) => pc.addTrack(t, stream));

              // Ring timeout for outgoing call
              if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
              ringTimeoutRef.current = setTimeout(() => {
                endCall();
              }, CALL_TIMEOUT_SECONDS * 1000);
            } else {
              console.warn('Call initiate failed:', res.error);
              cleanUpCall();
            }
          }
        );
      } catch (err) {
        console.error('Call media error:', err);
        cleanUpCall();
      }
    };

    window.addEventListener('tfhc:start-call', handleInitiate);
    return () => window.removeEventListener('tfhc:start-call', handleInitiate);
  }, [socket, setupPeerConnection, cleanUpCall, endCall]);

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

  const unlockAudioManually = () => {
    soundFx.unlockAudioContext();
    if (remoteAudioRef.current) {
      remoteAudioRef.current.play().catch(() => undefined);
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.play().catch(() => undefined);
    }
    setAudioBlocked(false);
  };

  if (!call) return null;

  const isConnected = call.status === 'connected';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
      {/* Hidden audio element for remote audio output */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 text-white shadow-2xl flex flex-col items-center justify-between min-h-[380px] max-h-[85vh] overflow-y-auto">
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
            {isConnected
              ? formatTimer(elapsed)
              : call.status === 'connecting'
              ? 'Connecting stream…'
              : call.isIncoming
              ? 'Incoming call…'
              : 'Ringing…'}
          </p>

          {audioBlocked && (
            <button
              onClick={unlockAudioManually}
              className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold animate-pulse active:scale-95"
            >
              <span className="material-symbols-outlined text-xs">volume_up</span>
              <span>Tap to enable audio</span>
            </button>
          )}
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
              <div className="relative">
                <div
                  className={`w-24 h-24 rounded-full bg-[#f2320c]/20 border-2 border-[#f2320c] flex items-center justify-center text-white text-3xl font-extrabold shadow-xl ${
                    !isConnected ? 'animate-pulse' : ''
                  }`}
                >
                  {call.peerName.charAt(0).toUpperCase()}
                </div>
                {!isConnected && (
                  <div className="absolute inset-0 rounded-full border-2 border-[#f2320c] animate-ping opacity-25 pointer-events-none" />
                )}
              </div>
              <p className="text-xs text-slate-400">
                {isConnected ? 'Call in progress' : 'Waiting for connection…'}
              </p>
            </div>
          )}
        </div>

        {/* Action Controls */}
        {call.isIncoming && !isConnected && call.status === 'ringing_incoming' ? (
          <div className="flex items-center gap-8">
            <button
              onClick={rejectCall}
              className="flex flex-col items-center gap-1 text-xs font-bold text-rose-400 active:scale-95 transition-all"
            >
              <div className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 flex items-center justify-center text-white shadow-lg shadow-rose-600/30 cursor-pointer">
                <span className="material-symbols-outlined text-2xl">call_end</span>
              </div>
              <span>Decline</span>
            </button>
            <button
              onClick={acceptCall}
              className="flex flex-col items-center gap-1 text-xs font-bold text-emerald-400 active:scale-95 transition-all"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30 animate-bounce cursor-pointer">
                <span className="material-symbols-outlined text-2xl">call</span>
              </div>
              <span>Accept</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button
              onClick={toggleMic}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                micMuted
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : 'bg-slate-800 text-white hover:bg-slate-700'
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
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                  camOff
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-slate-800 text-white hover:bg-slate-700'
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
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 flex items-center justify-center text-white shadow-lg shadow-rose-600/30 active:scale-95 transition-all cursor-pointer"
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
