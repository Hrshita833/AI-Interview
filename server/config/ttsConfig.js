/**
 * TTS voice configuration
 * Easy to change voices — just update the voiceName values.
 * Full list of prebuilt voices: Kore, Puck, Charon, Zephyr, Fenrir,
 * Enceladus, Aoede, Leda, Orus, etc. Preview at Google AI Studio.
 */

const ttsVoices = {
  female: {
    voiceName: "Kore",
    personaName: "Priya",
    stylePrefix:
      "Say this warmly and naturally, like a friendly senior interviewer on a call, with a calm, conversational pace: ",
  },
  male: {
    voiceName: "Puck",
    personaName: "Rahul",
    stylePrefix:
      "Say this in a relaxed, confident, friendly tone, like a real interviewer on a call, natural pace with small pauses: ",
  },
};

export default ttsVoices;
