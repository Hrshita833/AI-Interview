import { GoogleGenAI } from '@google/genai';

export const askAi = async (messages) => {
    try {
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            throw new Error("Messages array is empty.");
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("❌ GEMINI_API_KEY is not defined in environment variables!");
            throw new Error("GEMINI_API_KEY is not configured on the server");
        }

        const ai = new GoogleGenAI({ apiKey });

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

        // List of models to try in fallback order
        const candidateModels = [
            process.env.GEMINI_TEXT_MODEL,
            'gemini-3.5-flash-lite',
            'gemini-3.8-flash',
            'gemini-2.5-flash',
        ].filter(Boolean);

        const models = [...new Set(candidateModels)];
        let lastError = null;

        for (const model of models) {
            try {
                const response = await ai.models.generateContent({
                    model,
                    contents: userContent.trim(),
                    config: {
                        systemInstruction: systemInstruction.trim() || undefined
                    }
                });

                if (response && response.text) {
                    return response.text;
                }
            } catch (err) {
                lastError = err;
                console.warn(`⚠️ Text model "${model}" failed:`, err.message);
                const status = err?.status || err?.httpStatusCode || err?.code;
                if (status === 404 || /not.?found|does not exist/i.test(err.message || "")) {
                    continue; // try next model
                }
                // If it's another error, try fallback anyway
                continue;
            }
        }

        throw lastError || new Error("All Gemini text models failed or returned empty response.");
    } catch (error) {
        console.error("Gemini Error:", error.message);
        throw new Error(`Gemini API Error: ${error.message}`);
    }
};
