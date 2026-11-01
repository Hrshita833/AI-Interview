import { GoogleGenAI } from '@google/genai';

export const askAi = async (messages) => {
    try {
        if(!messages || !Array.isArray(messages) || messages.length === 0) {
            throw new Error("Messages array is empty.");
        }
        
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        let systemInstruction = "";
        let userContent = "";

        // Extract system instruction and user content from the messages array
        messages.forEach(msg => {
            if (msg.role === 'system') {
                systemInstruction += msg.content + "\n";
            } else if (msg.role === 'user') {
                userContent += msg.content + "\n";
            }
        });

        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: userContent.trim(),
            config: {
                systemInstruction: systemInstruction.trim() || undefined
            }
        });
        
        if (!response || !response.text) {
            throw new Error("AI returned empty response.");
        }

        return response.text;
    } catch (error) {
        console.error("Gemini Error:", error.message);
        throw new Error("Gemini API Error");
    }
}