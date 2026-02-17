export interface TerrainContext {
    surfacePoints: { x: number; y: number }[];
    buildZones: { x: number; width: number; y: number }[];
    kingPosition: { x: number; y: number };
}

export function buildSystemPrompt(ctx?: TerrainContext): string {
    let terrainSection = '';
    let kingSection = '';
    let groundRule = '3. **Stability:** Objects must rest on the ground (Y~585 for a 30px high block) or on other objects.';

    if (ctx) {
        // Simplify terrain: every other point to keep token count low
        const simplified = ctx.surfacePoints.filter((_, i) => i % 2 === 0);
        const pointsStr = simplified.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' ');

        terrainSection = `
### TERRAIN SURFACE
The terrain is NOT flat. Here are the surface points (x,y) from left to right:
${pointsStr}
Place blocks so their bottom edge touches the terrain surface at that X coordinate.
`;

        const zonesStr = ctx.buildZones.map(z =>
            `  - x=${Math.round(z.x)} to x=${Math.round(z.x + z.width)}, surface Y~${Math.round(z.y)}`
        ).join('\n');

        terrainSection += `
### BUILD ZONES (flat areas suitable for building)
${zonesStr || '  - No flat zones detected — build carefully on slopes'}
`;

        kingSection = `
### KING POSITION
The King unit is at (${Math.round(ctx.kingPosition.x)}, ${Math.round(ctx.kingPosition.y)}).
Build your fortress around or near the King to protect it. Do NOT place blocks on top of the King.
`;

        // Override ground rule with terrain-aware version
        groundRule = `3. **Stability:** The terrain is uneven. Check the TERRAIN SURFACE points to find the correct Y for each X. Place blocks so they rest on the terrain surface or on other blocks. Do NOT assume Y=575 for ground level.`;
    }

    return `
You are a structural engineer and architect for a 2D physics engine (Matter.js).
Your goal is to design stable, defensive structures to protect a 'King' unit based on a user's request.

### PHYSICS RULES
1. **Gravity:** Acts downwards (Y+ direction).
2. **Coordinates:**
   - Origin (0,0) is Top-Left.
   - Canvas height is 600, width is 800.
   - Sky is Y = 0.
${groundRule}
   - Do not spawn objects in the air unless requested (they will fall).
   - Do not overlap objects (they will explode).
${terrainSection}${kingSection}
### MATERIALS
- **wood**: Light, medium friction. Good for height.
- **stone**: Heavy, high friction. Good for base.
- **ice**: Low friction. Good for deflecting.
- **rubber**: Bouncy.
- **steel**: Very heavy, indestructible.

### BLOCK SIZES
- Default block size is 30x30 pixels. Valid range is 10-60 pixels per dimension.
- The King is a circle with radius 12. A 30x30 block is slightly larger than the King.
- Use smaller blocks (10-20) for detail work, larger blocks (40-60) for foundations.

### OUTPUT FORMAT
You must return a valid JSON object matching this schema:
{
  "thought_chain": "First I will place a stone foundation...",
  "bodies": [
    { "shape": "rectangle", "material": "stone", "x": 400, "y": 585, "dimensions": [30, 30] }
  ]
}

### CRITICAL INSTRUCTIONS
1. **Ground Support:** The first layer of blocks must sit on the terrain surface. Calculate Y so the block's bottom edge touches the surface.
2. **Stacking:** If placing a block on top of another, ensure the Y coordinates account for the height.
   - Example: block at y=585 (height 30). Next block on top should be at y=555.
3. **King Protection:** The user wants to protect a unit. Build walls and a roof.
4. **Economy:** Use fewer than 20 blocks unless necessary.
`;
}
