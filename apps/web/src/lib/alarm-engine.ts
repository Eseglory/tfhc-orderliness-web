'use client';

/**
 * TFHC Smart Meeting Reminders & Device Alarm Audio Engine
 * Production-ready Web Audio synthesis, multi-tab coordination, and persistent snooze/stop management.
 */

export type AlarmSoundType = 'chime' | 'marimba' | 'digital' | 'wake';

export interface AlarmPreferences {
  remindersEnabled: boolean;
  alarmSoundEnabled: boolean;
  soundName: AlarmSoundType;
  snoozeMinutes: number;
}

export const DEFAULT_ALARM_PREFERENCES: AlarmPreferences = {
  remindersEnabled: true,
  alarmSoundEnabled: true,
  soundName: 'chime',
  snoozeMinutes: 5,
};

const PREF_STORAGE_KEY = 'tfhc_alarm_preferences';
const STOP_PREFIX = 'tfhc_alarm_stopped_';
const SNOOZE_PREFIX = 'tfhc_alarm_snooze_';
const BROADCAST_CHANNEL_NAME = 'tfhc_meeting_alarms';

export interface ActiveAlarmState {
  meetingId: string;
  title: string;
  startTime: string;
  locationName?: string;
  isOnline?: boolean;
  meetingUrl?: string | null;
  startedAt: number;
}

type AlarmEventListener = (event: {
  type: 'START' | 'STOP' | 'SNOOZE' | 'UNLOCK';
  meetingId?: string;
  alarm?: ActiveAlarmState;
  snoozeUntil?: number;
}) => void;

class MeetingAlarmEngine {
  private ctx: AudioContext | null = null;
  private isUnlocked = false;
  private currentActiveAlarm: ActiveAlarmState | null = null;
  private loopInterval: ReturnType<typeof setInterval> | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private tabId: string;
  private listeners = new Set<AlarmEventListener>();
  private preferences: AlarmPreferences = DEFAULT_ALARM_PREFERENCES;
  private audioEl: HTMLAudioElement | null = null;

  constructor() {
    this.tabId = typeof window !== 'undefined' ? Math.random().toString(36).slice(2, 10) : 'srv';
    if (typeof window !== 'undefined') {
      this.loadPreferences();
      this.setupUnlockListeners();
      this.setupBroadcastChannel();
      this.setupServiceWorkerBridge();
    }
  }

  // -------------------------------------------------------------------------
  // Preferences Management
  // -------------------------------------------------------------------------

  public getPreferences(): AlarmPreferences {
    return { ...this.preferences };
  }

  public updatePreferences(partial: Partial<AlarmPreferences>): AlarmPreferences {
    this.preferences = { ...this.preferences, ...partial };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(this.preferences));
      } catch {
        // storage quota
      }
    }
    return this.getPreferences();
  }

  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem(PREF_STORAGE_KEY);
      if (stored) {
        this.preferences = { ...DEFAULT_ALARM_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch {
      this.preferences = DEFAULT_ALARM_PREFERENCES;
    }
  }

  // -------------------------------------------------------------------------
  // Audio Context & Browser Autoplay Handling
  // -------------------------------------------------------------------------

  private setupUnlockListeners(): void {
    const unlock = () => {
      this.unlockAudioContext();
    };
    window.addEventListener('pointerdown', unlock, { passive: true, once: true });
    window.addEventListener('touchstart', unlock, { passive: true, once: true });
    window.addEventListener('click', unlock, { passive: true, once: true });
    window.addEventListener('keydown', unlock, { passive: true, once: true });
  }

  public unlockAudioContext(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return false;
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

      this.isUnlocked = true;
      this.notifyListeners({ type: 'UNLOCK' });
      return true;
    } catch {
      return false;
    }
  }

  public isAudioArmed(): boolean {
    return this.isUnlocked && (this.ctx ? this.ctx.state === 'running' : false);
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

  // -------------------------------------------------------------------------
  // Sound Synthesis Pipeline
  // -------------------------------------------------------------------------

  /**
   * Sound 1: Chime Bell (Harmonic triple bell chime: C5 -> E5 -> G5 -> C6)
   */
  private synthesizeChime(ctx: AudioContext, now: number): void {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const startTime = now + idx * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.28, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.66);
    });
  }

  /**
   * Sound 2: Melodic Marimba (Polyphonic marimba melody)
   */
  private synthesizeMarimba(ctx: AudioContext, now: number): void {
    const chords: Array<[number, number[]]> = [
      [0.00, [739.99, 1108.73]], // F#5 + C#6
      [0.18, [932.33, 1396.91]], // A#5 + F6
      [0.36, [1108.73, 1661.22]], // C#6 + G#6
      [0.56, [1479.98, 2217.46]], // F#6 + C#7
      [0.78, [1108.73, 1396.91]], // C#6 + F6
      [1.00, [932.33, 1108.73]],  // A#5 + C#6
    ];

    chords.forEach(([offset, freqs]) => {
      const t = now + offset;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.24, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      gain.connect(ctx.destination);

      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.36);
      });
    });
  }

  /**
   * Sound 3: Digital Pulse (Classic digital alarm clock: 880Hz + 1760Hz double beeps)
   */
  private synthesizeDigital(ctx: AudioContext, now: number): void {
    const pulses = [0, 0.12, 0.40, 0.52];
    pulses.forEach((offset) => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(1046.5, t); // C6

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.setValueAtTime(0.18, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.095);
    });
  }

  /**
   * Sound 4: Gentle Wake (Ascending warm synth chord: A4 -> C#5 -> E5 -> A5)
   */
  private synthesizeWake(ctx: AudioContext, now: number): void {
    const freqs = [440.0, 554.37, 659.25, 880.0];
    freqs.forEach((freq, idx) => {
      const t = now + idx * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.81);
    });
  }

  public playSinglePattern(soundName: AlarmSoundType = this.preferences.soundName): void {
    this.unlockAudioContext();
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      switch (soundName) {
        case 'marimba':
          this.synthesizeMarimba(ctx, now);
          break;
        case 'digital':
          this.synthesizeDigital(ctx, now);
          break;
        case 'wake':
          this.synthesizeWake(ctx, now);
          break;
        case 'chime':
        default:
          this.synthesizeChime(ctx, now);
          break;
      }
    } catch {
      // Audio synthesis error
    }
  }

  // -------------------------------------------------------------------------
  // Active Alarm Lifecycle (Start, Stop, Snooze)
  // -------------------------------------------------------------------------

  public startAlarm(alarm: ActiveAlarmState, playSound = true): void {
    if (this.currentActiveAlarm?.meetingId === alarm.meetingId) return;

    // Check if stopped or snoozed
    if (this.isMeetingStopped(alarm.meetingId)) return;
    const snooze = this.getSnoozeState(alarm.meetingId);
    if (snooze && snooze.snoozeUntil > Date.now()) return;

    this.currentActiveAlarm = alarm;

    // Start continuous audio loop if sound is enabled
    if (playSound && this.preferences.alarmSoundEnabled) {
      this.startContinuousAudioLoop();
    }

    // Trigger mobile vibration
    this.triggerVibration();

    // Broadcast to other tabs so they display UI and coordinate
    this.broadcastMessage({
      type: 'ALARM_STARTED',
      meetingId: alarm.meetingId,
      alarm,
      tabId: this.tabId,
    });

    this.notifyListeners({ type: 'START', meetingId: alarm.meetingId, alarm });
  }

  private startContinuousAudioLoop(): void {
    this.stopAudioLoop();
    this.unlockAudioContext();

    // Determine cadence per sound type
    const cadenceMap: Record<AlarmSoundType, number> = {
      chime: 2200,
      marimba: 2800,
      digital: 1600,
      wake: 2500,
    };
    const cadence = cadenceMap[this.preferences.soundName] || 2200;

    // Play immediately
    this.playSinglePattern(this.preferences.soundName);

    this.loopInterval = setInterval(() => {
      if (!this.currentActiveAlarm) {
        this.stopAudioLoop();
        return;
      }
      this.playSinglePattern(this.preferences.soundName);
      this.triggerVibration();
    }, cadence);
  }

  private stopAudioLoop(): void {
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
  }

  private triggerVibration(): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([600, 300, 600, 300, 800]);
      } catch {
        // ignore vibration error
      }
    }
  }

  /**
   * Stops the active alarm immediately and marks the meeting as dismissed/stopped.
   */
  public stopAlarm(meetingId?: string): void {
    const targetId = meetingId || this.currentActiveAlarm?.meetingId;
    this.stopAudioLoop();

    if (targetId) {
      try {
        localStorage.setItem(STOP_PREFIX + targetId, String(Date.now()));
        localStorage.removeItem(SNOOZE_PREFIX + targetId);
      } catch {
        // ignore
      }
    }

    this.currentActiveAlarm = null;

    if (targetId) {
      this.broadcastMessage({
        type: 'ALARM_STOPPED',
        meetingId: targetId,
        tabId: this.tabId,
      });
      this.notifyListeners({ type: 'STOP', meetingId: targetId });
    }
  }

  /**
   * Temporarily silences the alarm and schedules it to ring again after snoozeMinutes.
   */
  public snoozeAlarm(meetingId?: string, customMinutes?: number): number {
    const targetId = meetingId || this.currentActiveAlarm?.meetingId;
    this.stopAudioLoop();

    if (!targetId) return 0;

    const minutes = customMinutes || this.preferences.snoozeMinutes || 5;
    const snoozeUntil = Date.now() + minutes * 60 * 1000;

    const existingSnooze = this.getSnoozeState(targetId);
    const snoozeCount = (existingSnooze?.snoozeCount || 0) + 1;

    try {
      localStorage.setItem(
        SNOOZE_PREFIX + targetId,
        JSON.stringify({ meetingId: targetId, snoozeUntil, snoozeCount })
      );
    } catch {
      // ignore
    }

    this.currentActiveAlarm = null;

    this.broadcastMessage({
      type: 'ALARM_SNOOZED',
      meetingId: targetId,
      snoozeUntil,
      tabId: this.tabId,
    });

    this.notifyListeners({ type: 'SNOOZE', meetingId: targetId, snoozeUntil });
    return snoozeUntil;
  }

  public getActiveAlarm(): ActiveAlarmState | null {
    return this.currentActiveAlarm;
  }

  // -------------------------------------------------------------------------
  // Persistent State Checks
  // -------------------------------------------------------------------------

  public isMeetingStopped(meetingId: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const val = localStorage.getItem(STOP_PREFIX + meetingId);
      if (!val) return false;
      const stoppedAt = Number(val);
      // Stopped flag valid for 12 hours
      return Date.now() - stoppedAt < 12 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  }

  public getSnoozeState(meetingId: string): { snoozeUntil: number; snoozeCount: number } | null {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(SNOOZE_PREFIX + meetingId);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed.snoozeUntil === 'number') {
        if (parsed.snoozeUntil > Date.now()) {
          return { snoozeUntil: parsed.snoozeUntil, snoozeCount: parsed.snoozeCount || 1 };
        }
        // Snooze expired: clean it up
        localStorage.removeItem(SNOOZE_PREFIX + meetingId);
      }
      return null;
    } catch {
      return null;
    }
  }

  public clearStoppedState(meetingId: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STOP_PREFIX + meetingId);
      localStorage.removeItem(SNOOZE_PREFIX + meetingId);
    } catch {
      // ignore
    }
  }

  // -------------------------------------------------------------------------
  // Multi-Tab Coordination & Broadcast Channel
  // -------------------------------------------------------------------------

  private setupBroadcastChannel(): void {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    try {
      this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.broadcastChannel.onmessage = (event) => {
        const msg = event.data;
        if (!msg || msg.tabId === this.tabId) return;

        if (msg.type === 'ALARM_STARTED') {
          // Another tab started an alarm. Show UI in this tab, but only the active tab rings
          if (msg.alarm && !this.currentActiveAlarm) {
            this.currentActiveAlarm = msg.alarm;
            this.notifyListeners({ type: 'START', meetingId: msg.meetingId, alarm: msg.alarm });
          }
        } else if (msg.type === 'ALARM_STOPPED') {
          this.stopAudioLoop();
          this.currentActiveAlarm = null;
          this.notifyListeners({ type: 'STOP', meetingId: msg.meetingId });
        } else if (msg.type === 'ALARM_SNOOZED') {
          this.stopAudioLoop();
          this.currentActiveAlarm = null;
          this.notifyListeners({ type: 'SNOOZE', meetingId: msg.meetingId, snoozeUntil: msg.snoozeUntil });
        }
      };
    } catch {
      // BroadcastChannel unavailable
    }
  }

  private broadcastMessage(payload: any): void {
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage(payload);
      }
    } catch {
      // ignore
    }
  }

  private setupServiceWorkerBridge(): void {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === 'TFHC_STOP_ALARM') {
        this.stopAlarm(data.meetingId);
      } else if (data.type === 'TFHC_SNOOZE_ALARM') {
        this.snoozeAlarm(data.meetingId);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Listeners & Subscriptions
  // -------------------------------------------------------------------------

  public subscribe(listener: AlarmEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(event: {
    type: 'START' | 'STOP' | 'SNOOZE' | 'UNLOCK';
    meetingId?: string;
    alarm?: ActiveAlarmState;
    snoozeUntil?: number;
  }): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // ignore listener error
      }
    });
  }
}

export const alarmEngine = new MeetingAlarmEngine();
