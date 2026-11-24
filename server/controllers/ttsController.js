import { generateTtsAudio } from "../services/ttsService.js";
import personas from "../config/ttsConfig.js";

export const synthesizeSpeech = async (req, res) => {
  const { text, gender } = req.body || {};

  // ── Validate Input ──
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      status: 400,
      message: "text is required and must not be empty",
    });
  }
  if (text.length > 500) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      status: 400,
      message: "text must be 500 characters or fewer",
    });
  }
  if (!gender || !["male", "female"].includes(gender)) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      status: 400,
      message: "gender must be 'male' or 'female'",
    });
  }

  try {
    // ── Generate WAV (Cached & Audio-Smoothed) ──
    const wavBuffer = await generateTtsAudio(text.trim(), gender);

    res.set({
      "Content-Type": "audio/wav",
      "Content-Length": wavBuffer.length,
      "Cache-Control": "public, max-age=86400",
    });
    return res.send(wavBuffer);
  } catch (err) {
    const persona = personas[gender] || personas.female;
    const status =
      err.status ||
      err.httpStatusCode ||
      (err.message === "TTS_RATE_LIMITED" || err.errorCode === "TTS_RATE_LIMITED" ? 429 : 500);

    const errorCode =
      err.errorCode ||
      (status === 429
        ? "TTS_RATE_LIMITED"
        : status === 404
        ? "MODEL_NOT_FOUND"
        : "TTS_FAILED");

    // Structured diagnostic error logging (never prints the API key)
    console.error(
      `[TTS ERROR] ${JSON.stringify({
        timestamp: new Date().toISOString(),
        model: err.modelUsed || process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts",
        voiceName: persona.voiceName,
        textLength: text.length,
        status,
        code: errorCode,
        message: err.message,
      })}`
    );

    return res.status(status).json({
      error: errorCode,
      status,
      model: err.modelUsed || process.env.GEMINI_TTS_MODEL || null,
      message: err.message,
    });
  }
};
