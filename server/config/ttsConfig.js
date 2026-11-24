/**
 * Single source of truth for Interviewer Personas
 * Male: Arjun (Puck voice)
 * Female: Ananya (Kore voice)
 * 
 * Official Gemini TTS prebuilt voices from ai.google.dev:
 * Female: Kore (warm, clear, friendly senior tone)
 * Male: Puck (relaxed, confident, conversational senior tone)
 */

const personas = {
  female: {
    gender: "female",
    name: "Ananya",
    voiceName: "Kore",
    avatarSrc: "/assets/female-ai-B01REilp.mp4",
    stylePrefix:
      "Say this warmly and naturally, like a friendly senior interviewer on a call, with a calm, conversational pace: ",
  },
  male: {
    gender: "male",
    name: "Arjun",
    voiceName: "Puck",
    avatarSrc: "/assets/male-ai-XFH2LA02.mp4",
    stylePrefix:
      "Say this in a relaxed, confident, friendly tone, like a real interviewer on a call, natural pace with small pauses: ",
  },
};

export default personas;
