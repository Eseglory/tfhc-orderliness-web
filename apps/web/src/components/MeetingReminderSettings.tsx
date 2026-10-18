'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '../lib/api';
import { alarmEngine, AlarmPreferences, AlarmSoundType } from '../lib/alarm-engine';

export function MeetingReminderSettings() {
  const [prefs, setPrefs] = useState<AlarmPreferences>(alarmEngine.getPreferences());
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('default');
  const [isSaving, setIsSaving] = useState(false);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideBrowser, setGuideBrowser] = useState<'chrome' | 'safari' | 'firefox' | 'edge' | 'ios'>('chrome');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check browser notification support & permission
    if (typeof window !== 'undefined') {
      if (!('Notification' in window)) {
        setPermissionState('unsupported');
      } else {
        setPermissionState(Notification.permission);
      }
    }

    // 2. Fetch server preferences
    fetchApi<AlarmPreferences>('/meetings/reminder-preferences')
      .then((serverPrefs) => {
        if (serverPrefs && typeof serverPrefs.remindersEnabled === 'boolean') {
          const updated = alarmEngine.updatePreferences(serverPrefs);
          setPrefs(updated);
        }
      })
      .catch(() => {
        // use local preferences
      });

    // Detect browser for guide default
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      if (/iPhone|iPad|iPod/.test(ua)) setGuideBrowser('ios');
      else if (/Edg/.test(ua)) setGuideBrowser('edge');
      else if (/Firefox/.test(ua)) setGuideBrowser('firefox');
      else if (/Safari/.test(ua) && !/Chrome/.test(ua)) setGuideBrowser('safari');
      else setGuideBrowser('chrome');
    }
  }, []);

  const handleUpdatePreference = async (partial: Partial<AlarmPreferences>) => {
    const next = alarmEngine.updatePreferences(partial);
    setPrefs(next);
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await fetchApi('/meetings/reminder-preferences', {
        method: 'PUT',
        body: JSON.stringify(next),
      });
      setStatusMessage('Preferences saved successfully.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch {
      setStatusMessage('Saved locally on this device.');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestSound = () => {
    alarmEngine.unlockAudioContext();
    setIsPlayingTest(true);
    alarmEngine.playSinglePattern(prefs.soundName);
    setTimeout(() => setIsPlayingTest(false), 2500);
  };

  const handleTestFullAlarm = () => {
    alarmEngine.unlockAudioContext();
    alarmEngine.startAlarm({
      meetingId: 'demo-test-meeting',
      title: 'TFHC Service Alarm Demo',
      startTime: new Date().toISOString(),
      locationName: 'Main Sanctuary / Online',
      isOnline: true,
      meetingUrl: 'https://meet.google.com',
      startedAt: Date.now(),
    });
  };

  const handleRequestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setPermissionState(perm);
      if (perm === 'granted') {
        alarmEngine.unlockAudioContext();
        setStatusMessage('Browser notifications enabled successfully!');
      } else if (perm === 'denied') {
        setShowGuideModal(true);
      }
    } catch {
      // ignore
    }
  };

  return (
    <section aria-label="Meeting reminder settings" className="p-5 sm:p-6 rounded-3xl bg-surface-container border border-outline-variant/30 space-y-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
            <span className="material-symbols-outlined text-2xl">alarm</span>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-on-surface">
              Smart Meeting Reminders &amp; Device Alarm
            </h2>
            <p className="text-xs text-on-surface-variant">
              Configure automatic alarms, sound preferences, and snooze intervals for services.
            </p>
          </div>
        </div>

        {/* Live Permission Indicator */}
        <div className="flex items-center gap-2">
          {permissionState === 'granted' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Notifications Active
            </span>
          ) : permissionState === 'denied' ? (
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/25 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">block</span>
              Blocked in Browser · How to Enable
            </button>
          ) : permissionState === 'unsupported' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/15 text-slate-400 text-xs font-bold">
              Unsupported Browser
            </span>
          ) : (
            <button
              type="button"
              onClick={handleRequestPermission}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-md shadow-primary/20 hover:opacity-95 transition-all active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">notifications</span>
              Enable Permissions
            </button>
          )}
        </div>
      </div>

      {/* Main Settings Toggles */}
      <div className="divide-y divide-outline-variant/20 border-y border-outline-variant/20">
        {/* Toggle 1: Meeting Reminders Enabled */}
        <div className="py-4 flex items-center justify-between gap-4">
          <div>
            <span className="text-sm font-bold text-on-surface block">
              Meeting Reminders
            </span>
            <span className="text-xs text-on-surface-variant">
              Receive automatic alerts at the scheduled time of church services and meetings.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.remindersEnabled}
            onClick={() => handleUpdatePreference({ remindersEnabled: !prefs.remindersEnabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              prefs.remindersEnabled ? 'bg-primary' : 'bg-surface-container-highest'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                prefs.remindersEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Toggle 2: Audible Device Alarm Enabled */}
        <div className="py-4 flex items-center justify-between gap-4">
          <div>
            <span className="text-sm font-bold text-on-surface block">
              Audible Device Alarm
            </span>
            <span className="text-xs text-on-surface-variant">
              Play an audible alarm tone on your device that rings until you tap Stop or Snooze.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.alarmSoundEnabled}
            onClick={() => handleUpdatePreference({ alarmSoundEnabled: !prefs.alarmSoundEnabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              prefs.alarmSoundEnabled ? 'bg-primary' : 'bg-surface-container-highest'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                prefs.alarmSoundEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Sound Selection & Preview */}
        <div className="py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-on-surface block">
                Alarm Sound Melody
              </span>
              <span className="text-xs text-on-surface-variant">
                Select your preferred audible ringing tone.
              </span>
            </div>
            <button
              type="button"
              onClick={handleTestSound}
              disabled={isPlayingTest}
              className="px-3.5 py-1.5 rounded-xl bg-surface-container-highest hover:bg-surface-container text-on-surface text-xs font-bold border border-outline-variant/40 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm text-amber-500">
                {isPlayingTest ? 'volume_up' : 'play_arrow'}
              </span>
              <span>{isPlayingTest ? 'Playing...' : 'Test Sound'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { id: 'chime', label: 'Chime Bell', desc: 'Harmonic 4-bell chime' },
              { id: 'marimba', label: 'Melodic Marimba', desc: 'Acoustic warm melody' },
              { id: 'digital', label: 'Digital Pulse', desc: 'Crisp classic alarm' },
              { id: 'wake', label: 'Gentle Wake', desc: 'Warm ascending synth' },
            ].map((sound) => (
              <button
                key={sound.id}
                type="button"
                onClick={() => handleUpdatePreference({ soundName: sound.id as AlarmSoundType })}
                className={`p-3 rounded-2xl border text-left transition-all active:scale-98 cursor-pointer ${
                  prefs.soundName === sound.id
                    ? 'bg-primary/10 border-primary text-primary font-bold shadow-sm'
                    : 'bg-surface-container-high/50 border-outline-variant/20 text-on-surface hover:border-outline-variant/40'
                }`}
              >
                <div className="text-xs font-bold">{sound.label}</div>
                <div className="text-[10px] text-on-surface-variant mt-0.5">{sound.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Snooze Interval Selector */}
        <div className="py-4 space-y-3">
          <div>
            <span className="text-sm font-bold text-on-surface block">
              Default Snooze Interval
            </span>
            <span className="text-xs text-on-surface-variant">
              How long the alarm silences before ringing again when you select Snooze.
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {[3, 5, 10, 15].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => handleUpdatePreference({ snoozeMinutes: mins })}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 cursor-pointer ${
                  prefs.snoozeMinutes === mins
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-500 shadow-sm'
                    : 'bg-surface-container-high/50 border-outline-variant/20 text-on-surface hover:border-outline-variant/40'
                }`}
              >
                {mins} Minutes {mins === 5 ? '(Default)' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action: Test Full Alarm Experience */}
      <div className="p-4 rounded-2xl bg-surface-container-high/60 border border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-on-surface block">
            Test Live Alarm Experience
          </span>
          <span className="text-[11px] text-on-surface-variant">
            Experience the real full-screen Stop and Snooze alarm dialog with audio.
          </span>
        </div>
        <button
          type="button"
          onClick={handleTestFullAlarm}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:opacity-90 text-white text-xs font-black shadow-md shadow-red-500/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-base">alarm_smart_wake</span>
          <span>Simulate Live Alarm</span>
        </button>
      </div>

      {/* Platform & Limitations Note */}
      <div className="p-4 rounded-2xl bg-surface-container-highest/50 border border-outline-variant/20 text-[11px] text-on-surface-variant space-y-1 leading-relaxed">
        <div className="flex items-center gap-1.5 font-bold text-on-surface">
          <span className="material-symbols-outlined text-sm text-primary">info</span>
          <span>How Meeting Alarms Work on Devices</span>
        </div>
        <p>
          When the application is open or in a background browser tab, audible ringing sounds on schedule. If your browser is closed on mobile, notifications are delivered via Web Push. Adding the app to your Home Screen (PWA) gives the most reliable experience.
        </p>
      </div>

      {/* Status Feedback */}
      {statusMessage && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold animate-in fade-in">
          {statusMessage}
        </div>
      )}

      {/* Browser Settings Guide Modal */}
      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-lg rounded-3xl bg-surface-container border border-outline-variant/30 shadow-2xl p-6 space-y-5 text-on-surface">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-xl text-primary">settings_suggest</span>
                <h3 className="text-base font-black text-on-surface">How to Enable Browser Notifications</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1 rounded-xl text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Browser Selector Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[
                { id: 'chrome', label: 'Chrome' },
                { id: 'safari', label: 'Safari' },
                { id: 'edge', label: 'Edge' },
                { id: 'firefox', label: 'Firefox' },
                { id: 'ios', label: 'iOS / iPhone' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setGuideBrowser(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    guideBrowser === tab.id
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Step-by-Step Instructions */}
            <div className="p-4 rounded-2xl bg-surface-container-high/60 border border-outline-variant/20 text-xs text-on-surface space-y-2 leading-relaxed">
              {guideBrowser === 'chrome' && (
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>Click the <strong>Lock / Tune icon</strong> at the left of the address bar.</li>
                  <li>Click <strong>Site settings</strong> or <strong>Permissions</strong>.</li>
                  <li>Find <strong>Notifications</strong> and change it to <strong>Allow</strong>.</li>
                  <li>Refresh this page to activate meeting alarms.</li>
                </ol>
              )}
              {guideBrowser === 'safari' && (
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>In macOS, click <strong>Safari</strong> in the top menu bar &gt; <strong>Settings...</strong></li>
                  <li>Click the <strong>Websites</strong> tab &gt; select <strong>Notifications</strong> on the left.</li>
                  <li>Find this website in the list and change it to <strong>Allow</strong>.</li>
                  <li>Refresh this page.</li>
                </ol>
              )}
              {guideBrowser === 'edge' && (
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>Click the <strong>Lock icon</strong> in the address bar.</li>
                  <li>Click <strong>Permissions for this site</strong>.</li>
                  <li>Find <strong>Notifications</strong> and select <strong>Allow</strong>.</li>
                  <li>Reload the page.</li>
                </ol>
              )}
              {guideBrowser === 'firefox' && (
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>Click the <strong>Padlock icon</strong> next to the URL.</li>
                  <li>Under <strong>Permissions</strong>, find <strong>Send Notifications</strong>.</li>
                  <li>Click the <strong>X</strong> next to <em>Blocked</em>, then refresh and click Allow.</li>
                </ol>
              )}
              {guideBrowser === 'ios' && (
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>Tap the <strong>Share</strong> button (box with upward arrow) in Safari.</li>
                  <li>Tap <strong>Add to Home Screen</strong> and tap <strong>Add</strong>.</li>
                  <li>Open the installed app from your home screen.</li>
                  <li>Go to <strong>Settings</strong> &gt; enable notifications when prompted.</li>
                </ol>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
