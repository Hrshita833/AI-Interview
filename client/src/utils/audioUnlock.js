import { logDebugEvent } from "./debugLogger";

/**
 * Unlocks HTML5 Audio and Web AudioContext on mobile Chrome / iOS Safari.
 * Executes ONLY ONCE on user gesture to avoid repeated audio device restarts.
 */
let globalAudioCtx = null;
let isAudioUnlocked = false;

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
  if (isAudioUnlocked) return;

  try {
    // 1. Resume Web AudioContext on user gesture
    const ctx = getAudioContext();
    if (ctx && ctx.state !== "running") {
      ctx
        .resume()
        .then(() => {
          logDebugEvent("context", "AudioContext resumed", `State: ${ctx.state}`);
          // Play 0-amplitude silent buffer to prime audio graph
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

    // 2. Unlock HTML5 Audio once with 100% digital zero WAV (no pop/click)
    const silentAudio = new Audio();
    // 44-byte WAV header + 4 zero bytes (0x00000000)
    silentAudio.src =
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQQAAAAAAAAA";
    silentAudio
      .play()
      .then(() => {
        silentAudio.pause();
        isAudioUnlocked = true;
        logDebugEvent("audio", "HTML5 Audio unlocked", "Zero-pop unlock complete");
      })
      .catch((err) => {
        logDebugEvent("audio", "HTML5 Audio unlock rejected", err.name || err.message);
      });

    isAudioUnlocked = true;
  } catch (err) {
    logDebugEvent("audio", "unlockAudio error", err.message);
  }
};

export default unlockAudio;
