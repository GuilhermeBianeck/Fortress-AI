import { z } from 'zod';

export const BodySchema = z.object({
    shape: z.enum(['rectangle', 'circle', 'triangle']),
    material: z.enum(['wood', 'stone', 'ice', 'rubber', 'steel']),
    x: z.number().min(-200).max(2600),       // World is 2400px wide + buffer
    y: z.number().min(-200).max(700),         // Canvas is 600px + buffer
    dimensions: z.array(z.number().min(5).max(120)).min(1).max(2), // Sane block sizes
    angle: z.number().min(-Math.PI).max(Math.PI).optional().default(0),
    description: z.string().max(200).optional()
});

export const FortressSchema = z.object({
    thought_chain: z.string().describe("Explain your reasoning for the structure design."),
    bodies: z.array(BodySchema).max(50)
});

export type FortressPlan = z.infer<typeof FortressSchema>;
export type BodyPlan = z.infer<typeof BodySchema>;
