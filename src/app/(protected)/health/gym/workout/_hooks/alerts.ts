/**
 * Rest-over / hold-done signals: a short beep (Web Audio), a vibration and an
 * optional system notification. Browsers only allow audio and permission
 * prompts from a user gesture, so `primeAlerts` runs on the tap that
 * completes a set; the signal itself fires later from a timer. Everything is
 * best-effort and silently does nothing where unsupported.
 */

type AudioContextCtor = typeof AudioContext;

let audio: AudioContext | null = null;

function audioCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  );
}

/** Creates/resumes the audio context and asks for notification permission once — call from a tap. */
export function primeAlerts({
  sound,
  notifications,
}: {
  sound: boolean;
  notifications: boolean;
}): void {
  if (sound) {
    try {
      const Ctor = audioCtor();
      if (Ctor) {
        audio ??= new Ctor();
        if (audio.state === "suspended") void audio.resume().catch(() => {});
      }
    } catch {
      audio = null;
    }
  }
  if (notifications) {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission().catch(() => {});
      }
    } catch {
      // Not supported here.
    }
  }
}

/** `count` short 880 Hz beeps. */
export function beep(count = 3): void {
  try {
    const ctx = audio;
    if (!ctx || ctx.state === "closed") return;
    const t0 = ctx.currentTime + 0.02;
    for (let i = 0; i < count; i++) {
      const start = t0 + i * 0.25;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    }
  } catch {
    // Audio unavailable.
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported.
  }
}

export function notify(title: string, body: string): void {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const note = new Notification(title, { body, tag: "gym-rest-timer" });
    note.onclick = () => {
      window.focus();
      note.close();
    };
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}
