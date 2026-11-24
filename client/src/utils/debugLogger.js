/**
 * Debug Logger for Voice & Audio diagnostics.
 * Activated when ?debug=1 is in the URL query string.
 */

const MAX_EVENTS = 30;
const subscribers = new Set();
const eventLogs = [];
let nextId = 1;

export const isDebugMode = () => {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("debug") === "1";
  } catch {
    return false;
  }
};

export const logDebugEvent = (category, type, message, details = null) => {
  const now = new Date();
  const time = now.toTimeString().split(" ")[0] + "." + String(now.getMilliseconds()).padStart(3, "0");

  const entry = {
    id: nextId++,
    time,
    category, // 'tts' | 'audio' | 'wav' | 'mic' | 'mode' | 'context'
    type,
    message,
    details,
  };

  eventLogs.push(entry);
  if (eventLogs.length > MAX_EVENTS) {
    eventLogs.shift();
  }

  // Also log to browser console with colored badge
  if (isDebugMode()) {
    console.log(
      `%c[DEBUG ${category.toUpperCase()}] %c${time} %c${type}: %c${message}`,
      "color: #10b981; font-weight: bold;",
      "color: #6b7280;",
      "color: #3b82f6; font-weight: 600;",
      "color: inherit;",
      details || ""
    );
  }

  // Notify listeners
  subscribers.forEach((callback) => {
    try {
      callback([...eventLogs]);
    } catch (e) {}
  });

  return entry;
};

export const getDebugLogs = () => [...eventLogs];

export const clearDebugLogs = () => {
  eventLogs.length = 0;
  subscribers.forEach((callback) => callback([]));
};

export const subscribeDebugLogs = (callback) => {
  subscribers.add(callback);
  callback([...eventLogs]);
  return () => subscribers.delete(callback);
};

/**
 * Validates standard PCM WAV header from an ArrayBuffer (minimum 44 bytes)
 */
export const validateWavHeader = (arrayBuffer) => {
  if (!arrayBuffer || arrayBuffer.byteLength < 44) {
    return {
      valid: false,
      reason: `Buffer too small: ${arrayBuffer?.byteLength || 0} bytes (min 44 required)`,
    };
  }

  try {
    const view = new DataView(arrayBuffer);
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const riffSize = view.getUint32(4, true);
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    const fmt = String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15));
    const fmtSize = view.getUint32(16, true);
    const audioFormat = view.getUint16(20, true);
    const numChannels = view.getUint16(22, true);
    const sampleRate = view.getUint32(24, true);
    const byteRate = view.getUint32(28, true);
    const blockAlign = view.getUint16(32, true);
    const bitsPerSample = view.getUint16(34, true);
    const dataHeader = String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39));
    const dataSize = view.getUint32(40, true);

    const isRiff = riff === "RIFF";
    const isWave = wave === "WAVE";
    const isPcm = audioFormat === 1;
    const isMono = numChannels === 1;
    const is24kHz = sampleRate === 24000;
    const is16Bit = bitsPerSample === 16;
    const isData = dataHeader === "data";

    const valid = isRiff && isWave && isPcm && isMono && is24kHz && is16Bit && isData;

    return {
      valid,
      sampleRate,
      numChannels,
      bitsPerSample,
      audioFormat,
      dataSize,
      actualTotalSize: arrayBuffer.byteLength,
      riff,
      wave,
      dataHeader,
      reason: valid
        ? "WAV header perfectly valid (24kHz, 16-bit, Mono PCM)"
        : `Invalid fields: ${[
            !isRiff ? `RIFF=${riff}` : "",
            !isWave ? `WAVE=${wave}` : "",
            !isPcm ? `Format=${audioFormat}` : "",
            !isMono ? `Channels=${numChannels}` : "",
            !is24kHz ? `SampleRate=${sampleRate}` : "",
            !is16Bit ? `Bits=${bitsPerSample}` : "",
            !isData ? `DataHeader=${dataHeader}` : "",
          ]
            .filter(Boolean)
            .join(", ")}`,
    };
  } catch (err) {
    return {
      valid: false,
      reason: `Header parse error: ${err.message}`,
    };
  }
};
