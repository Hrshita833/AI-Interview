import { logDebugEvent } from "./debugLogger";

/**
 * Unlocks HTML5 Audio and Web AudioContext on mobile Chrome / iOS Safari
 * Must be invoked inside a user gesture event (e.g. click, touchstart)
 */
let globalAudioCtx = null;

export const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  if (!globalAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      globalAudioCtx = new AudioCtx();
    }
  }
  return globalAudioCtx;
};

export const unlockAudio = () => {
  try {
    const ctx = getAudioContext();
    if (ctx) {
      const prev = ctx.state;
      ctx
        .resume()
        .then(() => {
          logDebugEvent("context", "AudioContext resumed", `State: ${prev} -> ${ctx.state}`);
          const buffer = ctx.createBuffer(1, 1, 24000);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
        })
        .catch((err) => {
          logDebugEvent("context", "AudioContext resume failed", err.message);
        });
    }

    // Unlock HTML5 Audio element with a 1-sample silent WAV
    const silentAudio = new Audio();
    silentAudio.src =
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    silentAudio
      .play()
      .then(() => {
        silentAudio.pause();
        logDebugEvent("audio", "Silent HTML5 Audio unlocked", "play() resolved on gesture");
      })
      .catch((err) => {
        logDebugEvent("audio", "Silent HTML5 Audio unlock rejected", err.name || err.message);
      });
  } catch (err) {
    logDebugEvent("audio", "unlockAudio error", err.message);
  }
};

export default unlockAudio;
