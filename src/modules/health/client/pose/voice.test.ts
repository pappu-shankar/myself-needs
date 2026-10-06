// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUE_REPEAT_MS,
  createVoiceCoach,
  pickEnglishVoice,
  type CoachUtterance,
  type SpeechEngine,
} from "./voice";

/** A speech engine that records what it was asked to say; `finish()` plays
 * the current utterance to its end, as the browser would. */
function fakeEngine(voices: SpeechSynthesisVoice[] = []) {
  const spoken: string[] = [];
  let talking: CoachUtterance | null = null;
  let cancels = 0;
  const engine: SpeechEngine = {
    speak(u) {
      spoken.push(u.text);
      talking = u;
    },
    cancel() {
      cancels++;
      const cut = talking;
      talking = null;
      // Browsers report the cut-off utterance as errored ("interrupted").
      cut?.onerror?.call(cut as SpeechSynthesisUtterance, {} as SpeechSynthesisErrorEvent);
    },
    getVoices: () => voices,
  };
  return {
    engine,
    spoken,
    get cancels() {
      return cancels;
    },
    current: () => talking,
    finish() {
      const u = talking;
      talking = null;
      u?.onend?.call(u as SpeechSynthesisUtterance, {} as SpeechSynthesisEvent);
    },
  };
}

function setup(voices: SpeechSynthesisVoice[] = []) {
  const fake = fakeEngine(voices);
  let t = 0;
  const coach = createVoiceCoach({
    engine: fake.engine,
    createUtterance: (text) =>
      ({ text, voice: null, lang: "", rate: 1, onend: null, onerror: null }) as CoachUtterance,
    now: () => t,
    preferredLang: "en-GB",
  });
  return {
    coach,
    fake,
    advance(ms: number) {
      t += ms;
    },
  };
}

function voice(name: string, lang: string, extra: Partial<SpeechSynthesisVoice> = {}) {
  return {
    name,
    lang,
    default: false,
    localService: true,
    voiceURI: name,
    ...extra,
  } as SpeechSynthesisVoice;
}

describe("createVoiceCoach", () => {
  it("is a silent no-op without speech synthesis", () => {
    const coach = createVoiceCoach({ engine: null });
    expect(coach.supported).toBe(false);
    expect(() => {
      coach.rep(1);
      coach.cue("Go deeper");
      coach.cancel();
    }).not.toThrow();
  });

  it("speaks every rep number, cutting off a stale one", () => {
    const { coach, fake } = setup();
    coach.rep(1);
    fake.finish();
    coach.rep(2);
    coach.rep(3); // 2 still talking — 3 wins
    expect(fake.spoken).toEqual(["1", "2", "3"]);
    expect(fake.cancels).toBe(1);
  });

  it("never speaks a cue over a rep count: waits for the count, then speaks", () => {
    const { coach, fake } = setup();
    coach.rep(4);
    coach.cue("Go deeper");
    expect(fake.spoken).toEqual(["4"]);
    fake.finish();
    expect(fake.spoken).toEqual(["4", "Go deeper"]);
  });

  it("keeps only the latest waiting cue and drops it if another rep comes first", () => {
    const { coach, fake } = setup();
    coach.rep(1);
    coach.cue("Go deeper");
    coach.cue("Knees out");
    coach.rep(2);
    fake.finish();
    expect(fake.spoken).toEqual(["1", "2"]);
    coach.rep(3);
    coach.cue("Knees out");
    fake.finish();
    expect(fake.spoken).toEqual(["1", "2", "3", "Knees out"]);
  });

  it("lets a rep count cut off a cue", () => {
    const { coach, fake } = setup();
    coach.cue("Step back so your whole body is in frame");
    coach.rep(1);
    expect(fake.spoken).toEqual(["Step back so your whole body is in frame", "1"]);
    expect(fake.current()?.text).toBe("1");
  });

  it("drops a cue offered while another cue is talking", () => {
    const { coach, fake } = setup();
    coach.cue("Go deeper");
    coach.cue("Knees out");
    fake.finish();
    expect(fake.spoken).toEqual(["Go deeper"]);
  });

  it("speaks the same cue at most once per repeat window", () => {
    const { coach, fake, advance } = setup();
    coach.cue("Go deeper");
    fake.finish();
    advance(DEFAULT_CUE_REPEAT_MS - 1);
    coach.cue("Go deeper");
    coach.cue("Knees out"); // a different cue isn't throttled
    fake.finish();
    advance(1);
    coach.cue("Go deeper");
    fake.finish();
    expect(fake.spoken).toEqual(["Go deeper", "Knees out", "Go deeper"]);
  });

  it("throttles a cue that waited behind a rep count too", () => {
    const { coach, fake, advance } = setup();
    coach.cue("Go deeper");
    fake.finish();
    advance(1000);
    coach.rep(1);
    coach.cue("Go deeper");
    fake.finish();
    expect(fake.spoken).toEqual(["Go deeper", "1"]);
  });

  it("ignores empty cues", () => {
    const { coach, fake } = setup();
    coach.cue(null);
    coach.cue("   ");
    expect(fake.spoken).toEqual([]);
  });

  it("cancel silences speech and forgets the waiting cue", () => {
    const { coach, fake } = setup();
    coach.rep(1);
    coach.cue("Go deeper");
    coach.cancel();
    expect(fake.cancels).toBe(1);
    fake.finish();
    expect(fake.spoken).toEqual(["1"]);
    coach.cue("Go deeper");
    expect(fake.spoken).toEqual(["1", "Go deeper"]);
  });

  it("an interrupted utterance's late end event doesn't free the slot", () => {
    const { coach, fake } = setup();
    coach.rep(1);
    const first = fake.current();
    coach.rep(2);
    first?.onend?.call(first as SpeechSynthesisUtterance, {} as SpeechSynthesisEvent);
    coach.cue("Go deeper"); // 2 is still talking, so the cue waits
    expect(fake.spoken).toEqual(["1", "2"]);
    fake.finish();
    expect(fake.spoken).toEqual(["1", "2", "Go deeper"]);
  });

  it("speaks with an English voice", () => {
    const en = voice("Daniel", "en-GB");
    const { coach, fake } = setup([voice("Amélie", "fr-FR", { default: true }), en]);
    coach.rep(1);
    expect(fake.current()?.voice).toBe(en);
    expect(fake.current()?.lang).toBe("en-GB");
  });
});

describe("pickEnglishVoice", () => {
  it("prefers the user's English locale, then a default English voice", () => {
    const us = voice("Samantha", "en-US", { default: true });
    const gb = voice("Daniel", "en-GB");
    const fr = voice("Amélie", "fr-FR");
    expect(pickEnglishVoice([fr, us, gb], "en-GB")).toBe(gb);
    expect(pickEnglishVoice([fr, gb, us], "en-IN")).toBe(us);
    expect(pickEnglishVoice([fr, gb, us], "fr-FR")).toBe(us);
    expect(pickEnglishVoice([fr])).toBeNull();
    expect(pickEnglishVoice([])).toBeNull();
  });
});
