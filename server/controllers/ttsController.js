import { generateTtsAudio } from "../services/ttsService.js";

export const synthesizeSpeech = async (req, res) => {
  try {
    const { text, gender } = req.body;

    // ── Validate ──
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "text is required" });
    }
    if (text.length > 500) {
      return res
        .status(400)
        .json({ error: "INVALID_INPUT", message: "text must be 500 characters or fewer" });
    }
    if (!gender || !["male", "female"].includes(gender)) {
      return res
        .status(400)
        .json({ error: "INVALID_INPUT", message: "gender must be 'male' or 'female'" });
    }

    // ── Generate (cached) ──
    const wavBuffer = await generateTtsAudio(text.trim(), gender);

    res.set({
      "Content-Type": "audio/wav",
      "Content-Length": wavBuffer.length,
      "Cache-Control": "public, max-age=86400",
    });
    return res.send(wavBuffer);
  } catch (err) {
    console.error("TTS Error:", err.message);

    if (err.message === "TTS_RATE_LIMITED") {
      return res.status(429).json({ error: "TTS_RATE_LIMITED" });
    }

    return res.status(500).json({ error: "TTS_FAILED", message: err.message });
  }
};
