import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import personas from "../config/ttsConfig.js";

// ── In-memory LRU cache: key = hash(cleanText + voiceName), value = WAV Buffer ──
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
    .update(`v3:${voiceName}:${text}`)
    .digest("hex");
}

/**
 * ── Comprehensive Audio Smoothing Engine ──
 * Eliminates all glitch/pop/click sounds at both start and end:
 * 1. 60ms Leading Digital Silence (1440 samples @ 24kHz = 2880 bytes):
 *    Gives mobile phone hardware DAC time to wake up without clipping the start of speech.
 * 2. 25ms Smooth Linear Fade-In (600 samples @ 24kHz):
 *    Smoothly ramps speech amplitude from 0 to eliminate initial DC offset click.
 * 3. 30ms Smooth Linear Fade-Out (720 samples @ 24kHz):
 *    Smoothly ramps speech amplitude down to 0 to prevent end truncation click.
 * 4. 200ms Trailing Digital Silence (4800 samples @ 24kHz = 9600 bytes):
 *    Allows DAC to settle before the HTML5 audio element ends.
 */
function applyAudioSmoothing(pcmBuffer) {
  // Ensure even byte length for 16-bit PCM samples (2 bytes per sample)
  let safeBuffer = pcmBuffer;
  if (safeBuffer.length % 2 !== 0) {
    safeBuffer = safeBuffer.subarray(0, safeBuffer.length - 1);
  }

  const sampleCount = safeBuffer.length / 2;
  const processedPcm = Buffer.from(safeBuffer); // clean copy to avoid Buffer pool byteOffset issues

  // 1. Smooth 25ms Fade-In (600 samples)
  const fadeInSamples = Math.min(600, Math.floor(sampleCount / 2));
  for (let i = 0; i < fadeInSamples; i++) {
    const byteOffset = i * 2;
    const originalSample = processedPcm.readInt16LE(byteOffset);
    const fadeFactor = i / fadeInSamples;
    const fadedSample = Math.round(originalSample * fadeFactor);
    processedPcm.writeInt16LE(
      Math.max(-32768, Math.min(32767, fadedSample)),
      byteOffset
    );
  }

  // 2. Smooth 30ms Fade-Out (720 samples)
  const fadeOutSamples = Math.min(720, Math.floor(sampleCount / 2));
  const fadeStart = sampleCount - fadeOutSamples;
  for (let i = 0; i < fadeOutSamples; i++) {
    const sampleIndex = fadeStart + i;
    const byteOffset = sampleIndex * 2;
    const originalSample = processedPcm.readInt16LE(byteOffset);
    const fadeFactor = 1.0 - i / fadeOutSamples;
    const fadedSample = Math.round(originalSample * fadeFactor);
    processedPcm.writeInt16LE(
      Math.max(-32768, Math.min(32767, fadedSample)),
      byteOffset
    );
  }

  // 3. 60ms Leading Silence (1440 samples = 2880 bytes)
  const leadingSilence = Buffer.alloc(1440 * 2, 0);

  // 4. 200ms Trailing Silence (4800 samples = 9600 bytes)
  const trailingSilence = Buffer.alloc(4800 * 2, 0);

  return Buffer.concat([leadingSilence, processedPcm, trailingSilence]);
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
  header.writeUInt32LE(16, 16); // PCM subchunk size
  header.writeUInt16LE(1, 20); // audio format = 1 (PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// ── Helper to execute generateContent with fallback payload shapes ──
async function callGeminiTts(ai, model, cleanText, persona) {
  // First attempt: with speechMetadata for turn-level style direction
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: cleanText,
              speechMetadata: {
                style: persona.style || "warm, friendly, conversational",
              },
            },
          ],
        },
      ],
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
    return response;
  } catch (err) {
    // If the error was due to speechMetadata schema rejection, retry with simple string contents
    const isSchemaError = err?.status === 400 && /speechMetadata|schema|unknown field/i.test(err?.message || "");
    if (isSchemaError) {
      return await ai.models.generateContent({
        model,
        contents: cleanText,
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
    }
    throw err;
  }
}

// ── Core TTS generation (with fallback model & structured retry) ──
async function generateTtsAudio(text, gender) {
  // Sanitize text for TTS: remove markdown symbols, bullets, asterisks, and numbering
  const cleanText = text
    .trim()
    .replace(/[*_~`]/g, "")
    .replace(/^(?:Q\d+[:.]?|\d+[\.\)]|[-•*])\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();

  const persona = personas[gender] || personas.female;
  const key = cacheKey(cleanText, persona.voiceName);
  const cached = audioCache.get(key);
  if (cached) return cached;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY is not configured on the server");
    err.status = 500;
    err.errorCode = "CONFIG_ERROR";
    throw err;
  }

  const ai = new GoogleGenAI({ apiKey });

  // Model cascade: Primary (GEMINI_TTS_MODEL or gemini-3.8-flash-tts) -> Fallback (GEMINI_TTS_FALLBACK_MODEL or gemini-3.1-flash-tts-preview)
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
      const response = await callGeminiTts(ai, model, cleanText, persona);

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
      const cleanPcm = applyAudioSmoothing(rawPcm);
      const wavBuffer = writeWavHeader(cleanPcm);

      audioCache.set(key, wavBuffer);
      return wavBuffer;
    } catch (err) {
      lastError = err;
      err.modelUsed = model;
      err.voiceName = persona.voiceName;
      const status = err?.status || err?.httpStatusCode || err?.code;

      // If 404 / model not found → log clear warning and try fallback model
      if (
        status === 404 ||
        /not.?found|does not exist/i.test(err.message || "")
      ) {
        console.warn(
          `⚠️ [TTS FALLBACK] Model "${model}" not found (404). Trying fallback model...`
        );
        continue;
      }

      // If 429 rate-limited → one retry after 2s backoff on current model
      if (status === 429) {
        console.warn(`⚠️ [TTS RATE LIMIT] Rate-limited on "${model}". Retrying in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const retry = await callGeminiTts(ai, model, cleanText, persona);
          const retryParts = retry.candidates?.[0]?.content?.parts || [];
          const retryAudioBuffers = [];
          for (const part of retryParts) {
            if (part?.inlineData?.data) {
              retryAudioBuffers.push(Buffer.from(part.inlineData.data, "base64"));
            }
          }

          if (retryAudioBuffers.length === 0) throw new Error("No audio on retry");

          const rawPcm = Buffer.concat(retryAudioBuffers);
          const cleanPcm = applyAudioSmoothing(rawPcm);
          const wavBuffer = writeWavHeader(cleanPcm);

          audioCache.set(key, wavBuffer);
          return wavBuffer;
        } catch (retryErr) {
          lastError = retryErr;
          lastError.modelUsed = model;
          lastError.voiceName = persona.voiceName;
          console.warn(`⚠️ [TTS RETRY FAILED] Retry on "${model}" failed (${retryErr.message}). Trying fallback model...`);
          continue; // Try next model in cascade
        }
      }

      // If other error, log warning and try next model
      console.warn(`⚠️ [TTS ERROR] Model "${model}" error (${err.message}). Trying fallback model...`);
      continue;
    }
  }

  // All models exhausted: attach structured fields to lastError
  const finalStatus = lastError?.status || lastError?.httpStatusCode;
  if (finalStatus === 429) {
    const rateLimitError = new Error("TTS_RATE_LIMITED");
    rateLimitError.status = 429;
    rateLimitError.errorCode = "TTS_RATE_LIMITED";
    rateLimitError.modelUsed = lastError?.modelUsed;
    rateLimitError.voiceName = persona.voiceName;
    throw rateLimitError;
  }

  if (lastError) {
    lastError.status = finalStatus || 500;
    lastError.errorCode = lastError.status === 404 ? "MODEL_NOT_FOUND" : "TTS_FAILED";
    throw lastError;
  }

  const genericError = new Error("All TTS models failed");
  genericError.status = 500;
  genericError.errorCode = "TTS_FAILED";
  genericError.modelUsed = models[0];
  genericError.voiceName = persona.voiceName;
  throw genericError;
}

export { generateTtsAudio };
