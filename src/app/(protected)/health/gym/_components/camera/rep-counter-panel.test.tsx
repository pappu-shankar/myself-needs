import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { path, squatPose } from "@/modules/health/client/pose/test-poses";
import type { Pose } from "@/modules/health/client/pose/geometry";
import { RepCounterPanel } from "./rep-counter-panel";

// MediaPipe needs real WASM + WebGL; the panel only reaches it through this
// module, so the tests swap it for a stub.
const landmarker = vi.hoisted(() => ({
  loadLandmarker: vi.fn(() => Promise.resolve({})),
  detect: vi.fn(() => null),
  closeLandmarker: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/modules/health/client/pose/landmarker", () => landmarker);

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, "mediaDevices", { value, configurable: true });
}

function setSecureContext(value: boolean | undefined) {
  Object.defineProperty(window, "isSecureContext", { value, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  setMediaDevices(undefined);
  setSecureContext(undefined);
});

afterEach(() => {
  // Unmount while the media stubs still exist — unmounting stops the camera.
  cleanup();
  vi.restoreAllMocks();
  const video = HTMLVideoElement.prototype as Partial<HTMLVideoElement>;
  delete video.requestVideoFrameCallback;
  delete video.cancelVideoFrameCallback;
});

describe("RepCounterPanel", () => {
  it("shows the no-camera state when the browser exposes no camera", async () => {
    const { container } = render(<RepCounterPanel />);
    expect(screen.getByRole("alert")).toHaveTextContent("No camera found");
    expect(screen.getByRole("button", { name: "Start camera" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(screen.getByLabelText("Movement")).toHaveValue("squat");
    expect(screen.getByText(/video never leaves your computer/)).toBeInTheDocument();
    expectNoAxeViolations(await axe(container));
  });

  it("explains an insecure context", () => {
    setSecureContext(false);
    render(<RepCounterPanel />);
    expect(screen.getByRole("alert")).toHaveTextContent("Camera needs a secure connection");
  });

  it("changes movement and its camera-placement hint", () => {
    render(<RepCounterPanel defaultMovement="pushup" />);
    const select = screen.getByLabelText("Movement");
    expect(select).toHaveAccessibleDescription(/Side view: .*floor level/);
    fireEvent.change(select, { target: { value: "lateral_raise" } });
    expect(select).toHaveValue("lateral_raise");
    expect(select).toHaveAccessibleDescription(/Front view: /);
  });

  it("offers 'Use N reps' only when the parent wants the count, disabled at zero", () => {
    const { rerender } = render(<RepCounterPanel />);
    expect(screen.queryByRole("button", { name: /Use 0 reps/ })).toBeNull();
    rerender(<RepCounterPanel onFinish={() => {}} targetReps={8} />);
    expect(screen.getByRole("button", { name: "Use 0 reps" })).toBeDisabled();
    expect(screen.getByRole("progressbar", { name: "Reps toward target" })).toHaveAttribute(
      "aria-valuemax",
      "8",
    );
  });

  it("reports a denied camera permission", async () => {
    setMediaDevices({
      getUserMedia: vi.fn(() => Promise.reject(new DOMException("blocked", "NotAllowedError"))),
    });
    render(<RepCounterPanel />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
    });
    expect(await screen.findByText("Camera permission denied")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("reports a model that fails to load and turns the camera back off", async () => {
    const stop = vi.fn();
    setMediaDevices({
      getUserMedia: vi.fn(() => Promise.resolve({ getTracks: () => [{ stop }] })),
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    landmarker.loadLandmarker.mockRejectedValueOnce(new Error("404 pose_landmarker_lite.task"));
    render(<RepCounterPanel />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
    });
    expect(await screen.findByText("Couldn't load the pose model")).toBeInTheDocument();
    expect(stop).toHaveBeenCalled();
  });

  it("starts, stops every track and cancels the frame loop on Stop and on unmount", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(() => Promise.resolve({ getTracks: () => [{ stop }] }));
    setMediaDevices({ getUserMedia });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const request = vi.fn(() => 7);
    const cancel = vi.fn();
    Object.assign(HTMLVideoElement.prototype, {
      requestVideoFrameCallback: request,
      cancelVideoFrameCallback: cancel,
    });

    const { unmount } = render(<RepCounterPanel />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
    });
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, video: expect.anything() }),
    );
    expect(await screen.findByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(request).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(7);
    expect(screen.getByRole("button", { name: "Start camera" })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
    });
    await screen.findByRole("button", { name: "Stop" });
    unmount();
    expect(stop).toHaveBeenCalledTimes(2);
    expect(landmarker.closeLandmarker).toHaveBeenCalled();
  });

  it("shows Voice and Auto-log toggles with their initial state from props", () => {
    Object.defineProperty(window, "speechSynthesis", {
      value: { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] },
      configurable: true,
    });
    vi.stubGlobal("SpeechSynthesisUtterance", class {});
    try {
      const { unmount } = render(<RepCounterPanel voiceCoach />);
      expect(screen.getByRole("checkbox", { name: /Voice/ })).toBeChecked();
      // Auto-log only makes sense when there's somewhere to log to.
      expect(screen.queryByRole("checkbox", { name: /Auto-log/ })).toBeNull();
      unmount();
      render(<RepCounterPanel onFinish={() => {}} autoFinish />);
      expect(screen.getByRole("checkbox", { name: /Auto-log/ })).toBeChecked();
      const voice = screen.getByRole("checkbox", { name: /Voice/ });
      expect(voice).not.toBeChecked();
      fireEvent.click(voice);
      expect(voice).toBeChecked();
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(window, "speechSynthesis");
    }
  });

  it("disables Voice where speech synthesis isn't available", () => {
    render(<RepCounterPanel voiceCoach />);
    const voice = screen.getByRole("checkbox", { name: /Voice/ });
    expect(voice).toBeDisabled();
    expect(voice).not.toBeChecked();
    expect(screen.getByText(/not supported in this browser/)).toBeInTheDocument();
  });

  describe("hands-free auto-log", () => {
    /** Drives the panel's frame loop by hand: each step advances the clock,
     * the video time and the pose the stubbed landmarker returns. */
    async function startDriven(props: Parameters<typeof RepCounterPanel>[0]) {
      const stop = vi.fn();
      setMediaDevices({
        getUserMedia: vi.fn(() => Promise.resolve({ getTracks: () => [{ stop }] })),
      });
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
      vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
      let clock = 0;
      let pose: Pose | null = null;
      vi.spyOn(performance, "now").mockImplementation(() => clock);
      vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
      vi.spyOn(HTMLMediaElement.prototype, "currentTime", "get").mockImplementation(
        () => clock / 1000,
      );
      vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(1000);
      vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(1000);
      landmarker.detect.mockImplementation((() => pose) as () => null);
      let callback: (() => void) | null = null;
      Object.assign(HTMLVideoElement.prototype, {
        requestVideoFrameCallback: (cb: () => void) => {
          callback = cb;
          return 1;
        },
        cancelVideoFrameCallback: () => {},
      });

      render(<RepCounterPanel {...props} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
      });
      await screen.findByRole("button", { name: "Stop" });

      const frames = (next: (Pose | null)[]) =>
        act(() => {
          for (const p of next) {
            clock += 33;
            pose = p;
            callback?.();
          }
        });
      const squats = (count: number) =>
        Array.from({ length: count }, () => [
          ...path([175, 85], 12),
          ...path([85, 175], 12),
          ...Array<number>(4).fill(175),
        ])
          .flat()
          .map(squatPose);
      const still = (ms: number) => Array<Pose>(Math.ceil(ms / 33)).fill(squatPose(175));
      return { frames, squats, still, stop };
    }

    it("logs the set after the user stops moving and a 3-second countdown", async () => {
      const onFinish = vi.fn();
      const { frames, squats, still, stop } = await startDriven({ onFinish, autoFinish: true });
      frames([squatPose(175), ...squats(3)]);
      expect(screen.getByRole("button", { name: "Use 3 reps" })).toBeEnabled();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        frames(still(4500));
        expect(screen.getByRole("status")).toHaveTextContent("Logging 3 reps…");
        // One act per second: each tick re-arms the timer after React commits.
        const tick = () =>
          act(async () => {
            vi.advanceTimersByTime(1000);
          });
        await tick();
        await tick();
        expect(onFinish).not.toHaveBeenCalled();
        await tick();
      } finally {
        vi.useRealTimers();
      }
      expect(onFinish).toHaveBeenCalledWith(
        expect.objectContaining({ movement: "squat", reps: 3 }),
      );
      expect(stop).toHaveBeenCalled();
    });

    it("Cancel keeps counting and doesn't re-trigger until a new rep", async () => {
      const onFinish = vi.fn();
      const { frames, squats, still } = await startDriven({ onFinish, autoFinish: true });
      frames([squatPose(175), ...squats(2), ...still(4500)]);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText(/Logging/)).toBeNull();
      frames(still(5000));
      expect(screen.queryByText(/Logging/)).toBeNull();
      frames([...squats(1), ...still(4500)]);
      expect(screen.getByText("Logging 3 reps…")).toBeInTheDocument();
      expect(onFinish).not.toHaveBeenCalled();
    });

    it("never auto-logs with the toggle off", async () => {
      const onFinish = vi.fn();
      const { frames, squats, still } = await startDriven({ onFinish });
      expect(screen.getByRole("checkbox", { name: /Auto-log/ })).not.toBeChecked();
      frames([squatPose(175), ...squats(2), ...still(6000)]);
      expect(screen.queryByText(/Logging/)).toBeNull();
    });
  });

  it("records the set for an on-device replay, then discards it on close", async () => {
    const created: { mimeType: string; stopped: boolean }[] = [];
    class FakeRecorder {
      static isTypeSupported = (type: string) => type === "video/webm";
      state: RecordingState = "inactive";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      entry: { mimeType: string; stopped: boolean };
      constructor(
        _stream: unknown,
        readonly options: { mimeType: string },
      ) {
        this.entry = { mimeType: options.mimeType, stopped: false };
        created.push(this.entry);
      }
      get mimeType() {
        return this.options.mimeType;
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.entry.stopped = true;
        this.ondataavailable?.({ data: new Blob(["frames"], { type: "video/webm" }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:replay");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      setMediaDevices({
        getUserMedia: vi.fn(() =>
          Promise.resolve({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] }),
        ),
      });
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
      vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
      Object.assign(HTMLVideoElement.prototype, {
        requestVideoFrameCallback: () => 1,
        cancelVideoFrameCallback: () => {},
      });

      render(<RepCounterPanel />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
      });
      await screen.findByRole("button", { name: "Stop" });
      expect(created).toEqual([{ mimeType: "video/webm", stopped: false }]);
      expect(screen.queryByRole("button", { name: "Replay set" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Stop" }));
      expect(created[0].stopped).toBe(true);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Replay set" }));

      const dialog = await screen.findByRole("dialog", { name: "Set replay" });
      expect(dialog).toHaveTextContent(/stays on this device/);
      expect(screen.getByRole("radio", { name: "0.5×" })).toBeChecked();
      fireEvent.click(screen.getByRole("radio", { name: "0.25×" }));
      expect(screen.getByRole("radio", { name: "0.25×" })).toBeChecked();
      expect(screen.getByRole("slider", { name: "Position" })).toBeInTheDocument();
      const download = screen.getByRole("link", { name: "Download video" });
      expect(download).toHaveAttribute("href", "blob:replay");
      expect(download.getAttribute("download")).toMatch(/^gym-set-\d{4}-\d{2}-\d{2}-\d{4}\.webm$/);

      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:replay");
      expect(screen.queryByRole("button", { name: "Replay set" })).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
