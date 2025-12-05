import { GoogleGenAI, Type, Modality } from "@google/genai";
import { WordCard } from "../types";
import { playPcmAudio } from "./audioUtils";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Audio Cache: Stores base64 audio strings keyed by the word/sentence text
const audioCache = new Map<string, string>();

// Prompt to get structured JSON vocabulary
const GENERATION_PROMPT = `
Generate 5 high-frequency English vocabulary words suitable for the 2025 Chinese Postgraduate Entrance Exam (Kaoyan) - English II difficulty.
Focus on words that are often confused or have abstract meanings.

For each word, provide:
1. The word itself.
2. IPA Phonetic symbol (US style preferred).
3. The correct Chinese meaning.
4. Three incorrect Chinese meanings (distractors) that look plausible.
5. A creative, vivid, and easy-to-remember mnemonic (memory aid) in Chinese.
6. An example sentence in English using the word.
7. The Chinese translation of the example sentence.

Return PURE JSON.
`;

export const fetchWordBatch = async (): Promise<WordCard[]> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: GENERATION_PROMPT,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              phonetic: { type: Type.STRING },
              meaning: { type: Type.STRING },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "Array containing 4 distinct Chinese meanings: 1 correct and 3 distractors. The correct meaning MUST be included."
              },
              mnemonic: { type: Type.STRING },
              sentence: { type: Type.STRING },
              sentenceTranslation: { type: Type.STRING },
            },
            required: ["word", "phonetic", "meaning", "options", "mnemonic", "sentence", "sentenceTranslation"],
          },
        },
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text) as WordCard[];
      // Shuffle options client-side to be safe
      return data.map(item => ({
        ...item,
        options: item.options.sort(() => Math.random() - 0.5)
      }));
    }
    return [];
  } catch (error) {
    console.error("Failed to fetch words:", error);
    throw error;
  }
};

/**
 * Pre-fetches audio for any text (word or sentence) and stores it in cache.
 */
export const preloadAudio = async (text: string) => {
  if (audioCache.has(text)) return;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, 
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      audioCache.set(text, base64Audio);
    }
  } catch (error) {
    console.error("Preload TTS Error:", error);
  }
};

// Kept for backward compatibility, aliases to preloadAudio
export const preloadPronunciation = preloadAudio;

export const playPronunciation = async (text: string) => {
  try {
    // Check cache first
    if (audioCache.has(text)) {
      const cachedAudio = audioCache.get(text);
      if (cachedAudio) {
        await playPcmAudio(cachedAudio, 24000);
        return;
      }
    }

    // Fallback to fetch if not cached
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      audioCache.set(text, base64Audio);
      await playPcmAudio(base64Audio, 24000);
    }
  } catch (error) {
    console.error("TTS Error:", error);
  }
};