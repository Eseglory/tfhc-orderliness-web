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
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
  }

  public unlockAudioContext(): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => undefined);
      }
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
   * Message Send Sound: Crisp ascending chime (800Hz -> 1350Hz)
   */
  public playMessageSend(): void {
    if (!this.settings.master || !this.settings.messages) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1350, now + 0.08);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Ignore audio synthesis errors
    }
  }

  /**
   * Message Receive Sound: Warm marimba chord (E5 659Hz + B5 987Hz)
   */
  public playMessageReceive(): void {
    if (!this.settings.master || !this.settings.messages) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now); // E5

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.05); // B5

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.35);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.35);
    } catch {
      // Ignore
    }
  }

  /**
   * Notification Pop: Clean modern alert ping (G5 784Hz -> C6 1046Hz)
   */
  public playNotification(): void {
    if (!this.settings.master || !this.settings.notifications) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(783.99, now); // G5
      osc.frequency.setValueAtTime(1046.5, now + 0.1); // C6

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch {
      // Ignore
    }
  }

  /**
   * Typing Feedback: Subtle, soft 15ms click
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
   * Start Incoming Call Ringtone: Rhythmic, harmonic marimba loop (repeats every 2 seconds)
   */
  public startIncomingRingtone(): void {
    if (!this.settings.master || !this.settings.ringtone) return;
    this.stopIncomingRingtone();

    const playSequence = () => {
      const ctx = this.getContext();
      if (!ctx) return;

      try {
        const notes = [
          { freq: 523.25, time: 0 },    // C5
          { freq: 659.25, time: 0.16 }, // E5
          { freq: 783.99, time: 0.32 }, // G5
          { freq: 1046.5, time: 0.48 }, // C6
          { freq: 783.99, time: 0.68 }, // G5
          { freq: 1046.5, time: 0.84 }, // C6
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

          noteGain.gain.setValueAtTime(0.25, now + time);
          noteGain.gain.exponentialRampToValueAtTime(0.001, now + time + 0.22);

          osc.connect(noteGain);
          noteGain.connect(mainGain);

          osc.start(now + time);
          osc.stop(now + time + 0.22);
        });
      } catch {
        // Ignore
      }
    };

    playSequence();
    this.ringtoneInterval = setInterval(playSequence, 2000);
  }

  /**
   * Stop Incoming Call Ringtone
   */
  public stopIncomingRingtone(): void {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
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

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.setValueAtTime(0.12, now + 1.4);
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
