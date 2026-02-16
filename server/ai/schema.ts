import { z } from 'zod';

export const BodySchema = z.object({
    shape: z.enum(['rectangle', 'circle', 'triangle']),
    material: z.enum(['wood', 'stone', 'ice', 'rubber', 'steel']),
    x: z.number(),
    y: z.number(),
    dimensions: z.array(z.number()), // [width, height] or [radius]
    angle: z.number().optional().default(0),
    description: z.string().optional() // for thought chain or label
});

export const FortressSchema = z.object({
    thought_chain: z.string().describe("Explain your reasoning for the structure design."),
    bodies: z.array(BodySchema).max(50)
});

export type FortressPlan = z.infer<typeof FortressSchema>;
export type BodyPlan = z.infer<typeof BodySchema>;
