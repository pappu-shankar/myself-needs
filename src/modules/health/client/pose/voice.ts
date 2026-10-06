/**
 * Voice coach for the camera rep counter: speaks each rep number and the odd
 * form cue through the browser's own speech synthesis (nothing leaves the
 * device). Browser-only, but the speech engine is injected so the queueing
 * and throttling rules are unit-tested with a fake.
 *
 * Rules:
 * - A rep count always speaks at once; it cuts off whatever is talking
 *   (a stale count or a cue) because the newest number is what matters.
 * - A cue never talks over a rep count: offered while a count is speaking it
 *   waits for that count to finish (only the latest waiting cue is kept, and
 *   it's dropped if another rep arrives first).
 * - A cue offered while another cue is speaking is dropped.
 * - The same cue speaks at most once per `cueRepeatMs`.
 * - Where speech synthesis doesn't exist, every call is a no-op.
 */

/** The slice of `SpeechSynthesis` the coach uses. */
export interface SpeechEngine {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
}

/** The slice of `SpeechSynthesisUtterance` the coach sets and listens to. */
export type CoachUtterance = Pick<
  SpeechSynthesisUtterance,
  "text" | "voice" | "lang" | "rate" | "onend" | "onerror"
>;

export interface VoiceCoachOptions {
  engine?: SpeechEngine | null;
  createUtterance?: (text: string) => CoachUtterance;
  now?: () => number;
  /** Same cue at most once per this many ms. */
  cueRepeatMs?: number;
  /** BCP-47 tag to prefer among English voices (e.g. navigator.language). */
  preferredLang?: string;
}

export interface VoiceCoach {
  readonly supported: boolean;
  /** Speak a rep number now. */
  rep(count: number): void;
  /** Offer a form cue; spoken only if the rules above allow. */
  cue(text: string | null | undefined): void;
  /** Silence everything and forget anything waiting. */
  cancel(): void;
}

export const DEFAULT_CUE_REPEAT_MS = 6000;

/** A touch brisk — counts land closer to the rep they belong to. */
const SPEECH_RATE = 1.1;

type Kind = "rep" | "cue";

/** The best English voice: the user's own English locale first, then a
 * default English voice, then any English voice; null leaves the browser's
 * default (with `lang` set to English). */
export function pickEnglishVoice(
  voices: readonly SpeechSynthesisVoice[],
  preferredLang?: string,
): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (english.length === 0) return null;
  const preferred = preferredLang?.toLowerCase();
  const local =
    preferred?.startsWith("en") === true
      ? english.filter((v) => v.lang.toLowerCase().replace("_", "-") === preferred)
      : [];
  const pool = local.length > 0 ? local : english;
  return pool.find((v) => v.localService && v.default) ?? pool.find((v) => v.default) ?? pool[0];
}

function browserEngine(): SpeechEngine | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  if (typeof SpeechSynthesisUtterance === "undefined") return null;
  return window.speechSynthesis;
}

const NOOP_COACH: VoiceCoach = {
  supported: false,
  rep: () => {},
  cue: () => {},
  cancel: () => {},
};

export function createVoiceCoach(options: VoiceCoachOptions = {}): VoiceCoach {
  const maybeEngine = options.engine === undefined ? browserEngine() : options.engine;
  if (!maybeEngine) return NOOP_COACH;
  const engine: SpeechEngine = maybeEngine;
  const createUtterance =
    options.createUtterance ?? ((text: string) => new SpeechSynthesisUtterance(text));
  const now = options.now ?? (() => performance.now());
  const cueRepeatMs = options.cueRepeatMs ?? DEFAULT_CUE_REPEAT_MS;
  const preferredLang =
    options.preferredLang ?? (typeof navigator === "undefined" ? undefined : navigator.language);

  let current: { kind: Kind; utterance: CoachUtterance } | null = null;
  let pendingCue: string | null = null;
  const lastSpokenCue = new Map<string, number>();
  let voice: SpeechSynthesisVoice | null = null;

  function say(kind: Kind, text: string): void {
    // Voices load asynchronously in Chrome — retry until one turns up.
    voice ??= pickEnglishVoice(engine.getVoices(), preferredLang);
    const utterance = createUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "en-US";
    utterance.rate = SPEECH_RATE;
    // cancel() fires end/error on the utterance it cut off, possibly after
    // the next one started — only the current utterance may clear the slot.
    const done = () => {
      if (current?.utterance !== utterance) return;
      const finished = current.kind;
      current = null;
      if (finished === "rep" && pendingCue !== null) {
        const next = pendingCue;
        pendingCue = null;
        speakCue(next);
      }
    };
    utterance.onend = done;
    utterance.onerror = done;
    current = { kind, utterance };
    engine.speak(utterance as SpeechSynthesisUtterance);
  }

  function speakCue(text: string): void {
    const t = now();
    const last = lastSpokenCue.get(text);
    if (last !== undefined && t - last < cueRepeatMs) return;
    lastSpokenCue.set(text, t);
    say("cue", text);
  }

  return {
    supported: true,
    rep(count) {
      pendingCue = null;
      if (current) {
        current = null;
        engine.cancel();
      }
      say("rep", String(count));
    },
    cue(text) {
      const cue = text?.trim();
      if (!cue) return;
      if (current?.kind === "rep") {
        pendingCue = cue;
        return;
      }
      if (current) return;
      speakCue(cue);
    },
    cancel() {
      pendingCue = null;
      current = null;
      engine.cancel();
    },
  };
}
