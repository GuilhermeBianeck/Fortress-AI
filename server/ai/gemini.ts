import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { FortressSchema, FortressPlan } from './schema';
import { buildSystemPrompt, TerrainContext } from './prompts';

const MAX_PROMPT_LENGTH = 500;

export const generateFortress = async (apiKey: string, userPrompt: string, terrainCtx?: TerrainContext): Promise<FortressPlan> => {
    // Sanitize user prompt: limit length, strip control chars
    const sanitizedPrompt = userPrompt.trim().slice(0, MAX_PROMPT_LENGTH).replace(/[\x00-\x1f]/g, '');
    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    thought_chain: { type: SchemaType.STRING },
                    bodies: {
                        type: SchemaType.ARRAY,
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                shape: { type: SchemaType.STRING, format: "enum", enum: ["rectangle", "circle", "triangle"] },
                                material: { type: SchemaType.STRING, format: "enum", enum: ["wood", "stone", "ice", "rubber", "steel"] },
                                x: { type: SchemaType.NUMBER },
                                y: { type: SchemaType.NUMBER },
                                dimensions: { type: SchemaType.ARRAY, items: { type: SchemaType.NUMBER } },
                                angle: { type: SchemaType.NUMBER },
                                description: { type: SchemaType.STRING }
                            },
                            required: ["shape", "material", "x", "y", "dimensions"]
                        }
                    }
                },
                required: ["thought_chain", "bodies"]
            }
        }
    });

    const systemPrompt = buildSystemPrompt(terrainCtx);

    const result = await model.generateContent({
        contents: [
            {
                role: 'user',
                parts: [
                    { text: systemPrompt },
                    { text: `User Request: "${sanitizedPrompt}"` }
                ]
            }
        ]
    });

    const responseText = result.response.text();

    try {
        const json = JSON.parse(responseText);
        return FortressSchema.parse(json);
    } catch (error) {
        console.error("Gemini Validation Error:", error);
        throw new Error("AI returned invalid structure format.");
    }
};
