import maleVideo from "../assets/videos/male-ai.mp4";
import femaleVideo from "../assets/videos/female-ai.mp4";

/**
 * Single source of truth for frontend Interviewer Personas
 */
export const personas = {
  female: {
    gender: "female",
    name: "Ananya",
    voiceName: "Kore",
    videoSrc: femaleVideo,
    title: "Ananya (Female)",
  },
  male: {
    gender: "male",
    name: "Arjun",
    voiceName: "Puck",
    videoSrc: maleVideo,
    title: "Arjun (Male)",
  },
};

export default personas;
