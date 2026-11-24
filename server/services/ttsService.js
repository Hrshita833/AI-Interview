import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import personas from "../config/ttsConfig.js";

// ── In-memory LRU cache: key = hash(text+voice), value = WAV Buffer ──
class SimpleLruCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }
}

const audioCache = new SimpleLruCache(100);

function cacheKey(text, voiceName) {
  return crypto
    .createHash("sha256")
    .update(`${voiceName}:${text}`)
    .digest("hex");
}

// ── Smooth 30ms fade-out + 200ms trailing silence to remove clicks/pops ──
function applyFadeOutAndSilence(pcmBuffer) {
  // Ensure even length for 16-bit samples (2 bytes per sample)
  let safeBuffer = pcmBuffer;
  if (safeBuffer.length % 2 !== 0) {
    safeBuffer = safeBuffer.subarray(0, safeBuffer.length - 1);
  }

  const sampleCount = safeBuffer.length / 2;
  const fadeSamples = Math.min(720, sampleCount); // 30ms @ 24kHz = 720 samples
  const fadeStart = sampleCount - fadeSamples;

  const processedPcm = Buffer.from(safeBuffer);

  for (let i = 0; i < fadeSamples; i++) {
    const sampleIndex = fadeStart + i;
    const byteOffset = sampleIndex * 2;
    const originalSample = processedPcm.readInt16LE(byteOffset);
    const fadeFactor = 1.0 - i / fadeSamples;
    const fadedSample = Math.round(originalSample * fadeFactor);
    processedPcm.writeInt16LE(
      Math.max(-32768, Math.min(32767, fadedSample)),
      byteOffset
    );
  }

  // 200ms trailing silence @ 24kHz = 4800 samples = 9600 bytes
  const silenceBuffer = Buffer.alloc(4800 * 2, 0);

  return Buffer.concat([processedPcm, silenceBuffer]);
}

// ── WAV header writer (PCM 24 kHz, 16-bit, mono) ──
function writeWavHeader(pcmBuffer) {
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8); // 48000
  const blockAlign = numChannels * (bitsPerSample / 8); // 2
  const dataSize = pcmBuffer.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);
  header.write("RIFF", 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4); // RIFF chunk size
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// ── Core TTS generation (with fallback model) ──
async function generateTtsAudio(text, gender) {
  const persona = personas[gender] || personas.female;
  const key = cacheKey(text, persona.voiceName);
  const cached = audioCache.get(key);
  if (cached) return cached;

  const styledText = persona.stylePrefix + text;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY is not defined in environment variables!");
    throw new Error("GEMINI_API_KEY is not configured on the server");
  }

  const ai = new GoogleGenAI({ apiKey });

  const candidateModels = [
    process.env.GEMINI_TTS_MODEL,
    "gemini-3.8-flash-tts",
    process.env.GEMINI_TTS_FALLBACK_MODEL,
    "gemini-3.1-flash-tts-preview",
  ].filter(Boolean);
  const models = [...new Set(candidateModels)];

  let lastError = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: styledText,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: persona.voiceName,
              },
            },
          },
        },
      });

      // Collect all inline audio data parts and decode base64 as binary
      const audioBuffers = [];
      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part?.inlineData?.data) {
          audioBuffers.push(Buffer.from(part.inlineData.data, "base64"));
        }
      }

      if (audioBuffers.length === 0) {
        throw new Error("No audio data returned by model");
      }

      const rawPcm = Buffer.concat(audioBuffers);
      const cleanPcm = applyFadeOutAndSilence(rawPcm);
      const wavBuffer = writeWavHeader(cleanPcm);

      audioCache.set(key, wavBuffer);
      return wavBuffer;
    } catch (err) {
      lastError = err;
      const status = err?.status || err?.httpStatusCode || err?.code;

      // If 404 / model not found → try fallback model once
      if (
        status === 404 ||
        /not.?found|does not exist/i.test(err.message || "")
      ) {
        console.warn(
          `⚠️  TTS model "${model}" not found (404). Trying fallback model...`
        );
        continue;
      }

      // If 429 rate-limited → one retry after short backoff
      if (status === 429) {
        console.warn(`⚠️  TTS rate-limited on "${model}". Retrying in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const retry = await ai.models.generateContent({
            model,
            contents: styledText,
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: persona.voiceName,
                  },
                },
              },
            },
          });

          const retryParts = retry.candidates?.[0]?.content?.parts || [];
          const retryAudioBuffers = [];
          for (const part of retryParts) {
            if (part?.inlineData?.data) {
              retryAudioBuffers.push(Buffer.from(part.inlineData.data, "base64"));
            }
          }

          if (retryAudioBuffers.length === 0) throw new Error("No audio on retry");

          const rawPcm = Buffer.concat(retryAudioBuffers);
          const cleanPcm = applyFadeOutAndSilence(rawPcm);
          const wavBuffer = writeWavHeader(cleanPcm);

          audioCache.set(key, wavBuffer);
          return wavBuffer;
        } catch (retryErr) {
          lastError = retryErr;
          console.warn(`⚠️  Retry on "${model}" failed (${retryErr.message}). Trying fallback model...`);
          continue; // Try next model in candidateModels
        }
      }

      // If other error, log and try next model
      console.warn(`⚠️  TTS model "${model}" error (${err.message}). Trying fallback model...`);
      continue;
    }
  }

  // All models exhausted
  const finalStatus = lastError?.status || lastError?.httpStatusCode;
  if (finalStatus === 429) {
    const rateLimitError = new Error("TTS_RATE_LIMITED");
    rateLimitError.statusCode = 429;
    throw rateLimitError;
  }

  throw lastError || new Error("All TTS models failed");
}

export { generateTtsAudio };
