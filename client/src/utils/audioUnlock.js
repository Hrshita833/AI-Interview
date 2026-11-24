/**
 * Unlocks HTML5 Audio and Web AudioContext on mobile Chrome / iOS Safari
 * Must be invoked inside a user gesture event (e.g. click, touchstart)
 */
export const unlockAudio = () => {
  try {
    // 1. Unlock Web AudioContext if available
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      ctx
        .resume()
        .then(() => {
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
        })
        .catch(() => {});
    }

    // 2. Unlock HTML5 Audio element with a 1-sample silent WAV
    const silentAudio = new Audio();
    silentAudio.src =
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    silentAudio
      .play()
      .then(() => {
        silentAudio.pause();
      })
      .catch(() => {});
  } catch (err) {
    // Ignore unsupported browser errors
  }
};

export default unlockAudio;
