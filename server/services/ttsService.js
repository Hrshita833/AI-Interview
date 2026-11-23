import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import ttsVoices from "../config/ttsConfig.js";

// ── In-memory cache: key = hash(text+gender), value = WAV Buffer ──
const audioCache = new Map();

function cacheKey(text, gender) {
  return crypto
    .createHash("sha256")
    .update(`${gender}:${text}`)
    .digest("hex");
}

// ── WAV header writer (PCM 24 kHz, 16-bit, mono) ──
function writeWavHeader(pcmBuffer) {
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);
  header.write("RIFF", 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20);  // audio format = PCM
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
  const key = cacheKey(text, gender);
  if (audioCache.has(key)) return audioCache.get(key);

  const voice = ttsVoices[gender] || ttsVoices.female;
  const styledText = voice.stylePrefix + text;

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
                voiceName: voice.voiceName,
              },
            },
          },
        },
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!audioPart?.data) {
        throw new Error("No audio data in response");
      }

      const pcmBuffer = Buffer.from(audioPart.data, "base64");
      const wavBuffer = writeWavHeader(pcmBuffer);

      audioCache.set(key, wavBuffer);
      return wavBuffer;
    } catch (err) {
      lastError = err;
      const status = err?.status || err?.httpStatusCode || err?.code;

      // If 404 / model not found → try fallback
      if (
        status === 404 ||
        /not.?found|does not exist/i.test(err.message || "")
      ) {
        console.warn(
          `⚠️  TTS model "${model}" not found (404). Trying fallback...`
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
                    voiceName: voice.voiceName,
                  },
                },
              },
            },
          });

          const retryPart = retry.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          if (!retryPart?.data) throw new Error("No audio on retry");

          const pcm = Buffer.from(retryPart.data, "base64");
          const wav = writeWavHeader(pcm);
          audioCache.set(key, wav);
          return wav;
        } catch (retryErr) {
          const retryStatus = retryErr?.status || retryErr?.httpStatusCode;
          if (retryStatus === 429) {
            const rateLimitError = new Error("TTS_RATE_LIMITED");
            rateLimitError.statusCode = 429;
            throw rateLimitError;
          }
          throw retryErr;
        }
      }

      // Any other error → throw immediately
      throw err;
    }
  }

  // All models exhausted
  throw lastError || new Error("All TTS models failed");
}

export { generateTtsAudio };
