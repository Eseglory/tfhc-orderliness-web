'use client';

/**
 * TFHC-ORDERLINESS Web Audio Sound & Communication Alerts Engine
 * High-fidelity, zero-network-dependency audio synthesis using the Web Audio API.
 * Handles modern browser autoplay policies, user gesture unlocking, and configurable settings.
 */

export interface SoundSettings {
  master: boolean;
  messages: boolean;
  notifications: boolean;
  ringtone: boolean;
  typing: boolean;
}

const DEFAULT_SETTINGS: SoundSettings = {
  master: true,
  messages: true,
  notifications: true,
  ringtone: true,
  typing: false,
};

const STORAGE_KEY = 'tfhc_sound_settings';

class SoundFxEngine {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private settings: SoundSettings = DEFAULT_SETTINGS;
  private ringtoneInterval: ReturnType<typeof setInterval> | null = null;
  private ringbackInterval: ReturnType<typeof setInterval> | null = null;
  private ringtoneGain: GainNode | null = null;
  private ringbackGain: GainNode | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadSettings();
      this.setupUnlockListeners();
    }
  }

  private loadSettings(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      this.settings = DEFAULT_SETTINGS;
    }
  }

  public getSettings(): SoundSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<SoundSettings>): SoundSettings {
    this.settings = { ...this.settings, ...partial };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      } catch {
        // storage quota
      }
    }
    return this.getSettings();
  }

  private setupUnlockListeners(): void {
    const unlock = () => {
      this.unlockAudioContext();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  public unlockAudioContext(): void {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => undefined);
      }
      // Play 1-sample silent buffer to unlock iOS Safari Web Audio policy
      const buf = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
      this.unlocked = true;
    } catch {
      // AudioContext unavailable
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  /**
   * Message Send Sound: Iconic crisp WhatsApp-like ascending pop (950Hz -> 1750Hz)
   */
  public playMessageSend(): void {
    if (!this.settings.master || !this.settings.messages) return;
    this.unlockAudioContext();
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(1750, now + 0.045);

      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.085);
    } catch {
      // Ignore audio synthesis errors
    }
  }

  /**
   * Message Receive Sound: WhatsApp-style bright melodic chime (G5 784Hz -> C6 1046Hz + E6 1318Hz)
   */
  public playMessageReceive(): void {
    if (!this.settings.master || !this.settings.messages) return;
    this.unlockAudioContext();
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Tone 1: Intro warm bell
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(783.99, now); // G5
      gain1.gain.setValueAtTime(0.22, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.14);

      // Tone 2: Harmonic sweet double bell
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      const gain2 = ctx.createGain();

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046.5, now + 0.07); // C6
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(1318.5, now + 0.07); // E6

      gain2.gain.setValueAtTime(0.26, now + 0.07);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc2.connect(gain2);
      osc3.connect(gain2);
      gain2.connect(ctx.destination);

      osc2.start(now + 0.07);
      osc2.stop(now + 0.32);
      osc3.start(now + 0.07);
      osc3.stop(now + 0.32);
    } catch {
      // Ignore
    }
  }

  /**
   * Notification Pop: Clean modern alert ping
   */
  public playNotification(): void {
    if (!this.settings.master || !this.settings.notifications) return;
    this.unlockAudioContext();
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08); // E6

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch {
      // Ignore
    }
  }

  /**
   * Typing Feedback: Subtle soft click
   */
  public playTypingFeedback(): void {
    if (!this.settings.master || !this.settings.typing) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, now);

      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.02);
    } catch {
      // Ignore
    }
  }

  /**
   * Call Connected Chime: Ascending two-chord confirmation
   */
  public playCallConnected(): void {
    if (!this.settings.master) return;
    this.unlockAudioContext();
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(659.25, now + 0.1); // E5

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.1); // G5

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.35);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.35);
    } catch {
      // Ignore
    }
  }

  /**
   * Busy / Call Declined Tone: 3 rapid telephone busy beeps (480Hz + 620Hz)
   */
  public playBusyTone(): void {
    if (!this.settings.master) return;
    this.unlockAudioContext();
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const pulses = [0, 0.22, 0.44];

      pulses.forEach((offset) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(480, now + offset);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(620, now + offset);

        gain.gain.setValueAtTime(0.18, now + offset);
        gain.gain.setValueAtTime(0.18, now + offset + 0.14);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.16);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now + offset);
        osc1.stop(now + offset + 0.16);
        osc2.start(now + offset);
        osc2.stop(now + offset + 0.16);
      });
    } catch {
      // Ignore
    }
  }

  private incomingAudioEl: HTMLAudioElement | null = null;
  private ringtoneBlobUrl: string | null = null;

  private generateRingtoneWavUrl(): string | null {
    if (typeof window === 'undefined') return null;
    if (this.ringtoneBlobUrl) return this.ringtoneBlobUrl;

    try {
      const sampleRate = 22050;
      const duration = 2.4;
      const totalSamples = Math.floor(sampleRate * duration);
      const byteLength = totalSamples * 2;
      const buffer = new ArrayBuffer(44 + byteLength);
      const view = new DataView(buffer);

      const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
        }
      };

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + byteLength, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, 1, true); // Mono
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeString(36, 'data');
      view.setUint32(40, byteLength, true);

      // Signature polyphonic acoustic marimba chords
      const melody: Array<[number, number, number[], number]> = [
        [0.00, 0.35, [739.99, 1108.73], 0.36], // F#5 + C#6
        [0.18, 0.35, [932.33, 1396.91], 0.38], // A#5 + F6
        [0.36, 0.40, [1108.73, 1661.22], 0.42], // C#6 + G#6
        [0.58, 0.45, [1479.98, 2217.46], 0.45], // F#6 + C#7
        [0.82, 0.40, [1108.73, 1396.91], 0.38], // C#6 + F6
        [1.04, 0.45, [932.33, 1108.73], 0.36],  // A#5 + C#6
        [1.30, 0.70, [830.61, 1244.51], 0.40],  // G#5 + D#6
      ];

      let offset = 44;
      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        let sampleVal = 0;

        for (const [start, len, freqs, amp] of melody) {
          if (t >= start && t < start + len) {
            const elapsed = t - start;
            const attack = Math.min(1, elapsed / 0.008);
            const decay = Math.exp(-elapsed * 6.5);
            const envelope = attack * decay * amp;

            for (const freq of freqs) {
              sampleVal += Math.sin(2 * Math.PI * freq * elapsed) * envelope * 0.7;
              sampleVal += Math.sin(2 * Math.PI * (freq * 2) * elapsed) * envelope * 0.3;
            }
          }
        }

        const clamped = Math.max(-1, Math.min(1, sampleVal));
        view.setInt16(offset, Math.floor(clamped * 32767), true);
        offset += 2;
      }

      const blob = new Blob([buffer], { type: 'audio/wav' });
      this.ringtoneBlobUrl = URL.createObjectURL(blob);
      return this.ringtoneBlobUrl;
    } catch {
      return null;
    }
  }

  private getOrCreateIncomingAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!this.incomingAudioEl) {
      const url = this.generateRingtoneWavUrl();
      if (!url) return null;
      try {
        const audio = new Audio(url);
        audio.loop = true;
        audio.preload = 'auto';
        this.incomingAudioEl = audio;
      } catch {
        return null;
      }
    }
    return this.incomingAudioEl;
  }

  /**
   * Start Incoming Call Ringtone: Dual pipeline (HTML5 audio loop + Web Audio oscillators + phone vibration)
   */
  public startIncomingRingtone(): void {
    if (!this.settings.master || !this.settings.ringtone) return;
    this.stopIncomingRingtone();
    this.unlockAudioContext();

    // 1. Mobile phone vibration
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([600, 300, 600, 300, 1000]);
      } catch {
        // Ignore
      }
    }

    // 2. HTML5 Audio looping playback (native audio thread, reliable across devices)
    const audio = this.getOrCreateIncomingAudio();
    if (audio) {
      audio.currentTime = 0;
      audio.loop = true;
      audio.volume = 1.0;
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch((err) => {
          console.warn('Incoming ringtone autoplay prevented by browser policy:', err);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tfhc:ringtone-blocked'));
            const oneTouchUnmute = () => {
              audio.play().catch(() => undefined);
              this.unlockAudioContext();
              window.removeEventListener('pointerdown', oneTouchUnmute);
              window.removeEventListener('touchstart', oneTouchUnmute);
              window.removeEventListener('click', oneTouchUnmute);
            };
            window.addEventListener('pointerdown', oneTouchUnmute, { once: true, passive: true });
            window.addEventListener('touchstart', oneTouchUnmute, { once: true, passive: true });
            window.addEventListener('click', oneTouchUnmute, { once: true, passive: true });
          }
        });
      }
    }

    // 3. Web Audio oscillator enhancement (adds acoustic depth when context is running)
    const playSequence = () => {
      const ctx = this.getContext();
      if (!ctx || ctx.state !== 'running') return;

      try {
        const notes = [
          { freq: 739.99, time: 0 },    // F#5
          { freq: 932.33, time: 0.18 }, // A#5
          { freq: 1108.73, time: 0.36 }, // C#6
          { freq: 1479.98, time: 0.58 }, // F#6
          { freq: 1108.73, time: 0.82 }, // C#6
          { freq: 932.33, time: 1.04 },  // A#5
          { freq: 830.61, time: 1.30 },  // G#5
        ];

        const now = ctx.currentTime;
        const mainGain = ctx.createGain();
        mainGain.gain.setValueAtTime(0.28, now);
        mainGain.connect(ctx.destination);
        this.ringtoneGain = mainGain;

        notes.forEach(({ freq, time }) => {
          const osc = ctx.createOscillator();
          const noteGain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + time);

          noteGain.gain.setValueAtTime(0.24, now + time);
          noteGain.gain.exponentialRampToValueAtTime(0.001, now + time + 0.35);

          osc.connect(noteGain);
          noteGain.connect(mainGain);

          osc.start(now + time);
          osc.stop(now + time + 0.35);
        });
      } catch {
        // Ignore
      }
    };

    if (this.ctx && this.ctx.state === 'running') {
      playSequence();
      this.ringtoneInterval = setInterval(playSequence, 2400);
    }
  }

  /**
   * Stop Incoming Call Ringtone and phone vibration
   */
  public stopIncomingRingtone(): void {
    if (this.incomingAudioEl) {
      try {
        this.incomingAudioEl.pause();
        this.incomingAudioEl.currentTime = 0;
      } catch {
        // Ignore
      }
    }
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {
        // Ignore
      }
    }
    if (this.ringtoneGain) {
      try {
        this.ringtoneGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
        this.ringtoneGain.disconnect();
      } catch {
        // Ignore
      }
      this.ringtoneGain = null;
    }
  }

  /**
   * Start Outgoing Call Ringback Tone: 440Hz + 480Hz dual-frequency phone pulses (1.5s on, 2.5s off)
   */
  public startOutgoingRingback(): void {
    if (!this.settings.master || !this.settings.ringtone) return;
    this.stopOutgoingRingback();
    this.unlockAudioContext();

    const playPulse = () => {
      const ctx = this.getContext();
      if (!ctx) return;

      try {
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, now); // 440Hz
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, now); // 480Hz

        gain.gain.setValueAtTime(0.16, now);
        gain.gain.setValueAtTime(0.16, now + 1.4);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        this.ringbackGain = gain;

        osc1.start(now);
        osc1.stop(now + 1.5);
        osc2.start(now);
        osc2.stop(now + 1.5);
      } catch {
        // Ignore
      }
    };

    playPulse();
    this.ringbackInterval = setInterval(playPulse, 4000);
  }

  /**
   * Stop Outgoing Call Ringback Tone
   */
  public stopOutgoingRingback(): void {
    if (this.ringbackInterval) {
      clearInterval(this.ringbackInterval);
      this.ringbackInterval = null;
    }
    if (this.ringbackGain) {
      try {
        this.ringbackGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
        this.ringbackGain.disconnect();
      } catch {
        // Ignore
      }
      this.ringbackGain = null;
    }
  }
}

export const soundFx = new SoundFxEngine();
