# Fortress AI: Cartoon Art Brief And First Prompts

Direction chosen by the user: bright cartoon artillery with expressive characters and playful effects. Create original Fortress AI designs; reference the genre's readability, not another game's characters, logos or assets.

These prompts can be used manually in the user's image-generation workflow. No API integration or paid API assumption is required for this plan. New assets have not been generated during the audit.

## First Batch Only

Approve C01 and C02 before producing C03-C07. A single strong gameplay mockup and character are more valuable than another broad sprite sheet. C01 is an art target only and must not become a flattened runtime background.

| File | Value | Approval test |
| --- | --- | --- |
| `C01-battle-style.png` | Establishes the game's whole visual language | Foreground, targets, terrain and character are immediately readable at phone size. |
| `C02-king-master.png` | Establishes an appealing, recognizable character | Complete silhouette, consistent side-view perspective, readable face at 64px height. |
| `C03-cannon-base.png` | Provides a stable weapon mount | Clean barrel-free mount, level contact points and compatible attachment. |
| `C04-cannon-barrel.png` | Allows aiming and recoil independently | Clean rear pivot and muzzle; aligned with C03 without scale distortion. |
| `C05-wood-surface.png` | Proves scalable structural materials | Tile test passes; no baked outside borders or perspective volume. |
| `C06-far-hills.png` | Establishes background depth independently | No sky/moon/foreground rectangle; sits naturally on a supplied horizon. |
| `C07-distant-fortress.png` | Provides a meaningful distant landmark | Complete grounded silhouette, visibly less contrast/detail than gameplay. |

Keep original source files. Suggested source dimensions below are production targets, not guarantees that generation will obey them. Check actual files, crop deliberately, and validate alpha before import.

## Shared Style Contract

- Bright, original 2D cartoon siege game; smooth illustration with crisp contours. No pixel-art filter.
- Orthographic side view for gameplay; consistent upper-left lighting.
- Broad forms, limited fine texture and friendly expressive shapes. Readability takes priority over tiny detail.
- Blue/red team accents, green scenery, warm masonry and tasteful gold. Avoid a navy-and-gold menu dominating the whole game.
- No text, labels, watermarks or baked UI.
- One asset per image except the intentionally illustrative C01 concept.
- Transparent assets require actual alpha, with clear padding around the complete silhouette. No black, white or checkerboard pixels baked behind the art.
- No isolated asset includes scene fog, ground shadows extending unpredictably, unrelated props or another requested layer.

Use the approved C01 as a style reference and C02 as the character identity reference in subsequent requests. Ask for variation only after the master passes its runtime test.

## C01: Battle Style Reference

```text
Create one original art-direction reference for Fortress AI, a bright 2D cartoon artillery game about building clever forts and protecting an expressive little king.

Show a side-on playable battlefield, not a web page or menu. A cheerful compact king stands inside a small fortress made from a few readable wood and stone structural pieces. A chunky cartoon cannon stands on visible ground nearby. On the opposing side, one projectile impact breaks a support and causes a small readable collapse with stone chips and wood splinters. The cause and result must be understandable immediately.

Style: premium smooth 2D cartoon game illustration, clean silhouettes, appealing expressive character, confident contours, broad color groups and restrained texture. Bright blue sky, green turf, warm stone, red and blue team accents, upper-left sunlight. Friendly and energetic, with satisfying physical weight. Use original designs, not characters or assets from an existing game. No pixel-art effect, photorealism or ornate dark-fantasy UI.

Composition: the battlefield occupies the important central and lower area. Avoid a huge empty sky. Leave a clean narrow region along the top and bottom for future HUD controls but do not draw any HUD. Foreground, playable terrain and distant scenery must have clearly different contrast and detail levels. Kings and cannons must remain recognizable when the image is viewed small on a phone.

Landscape composition, ideally 1536 by 864. Opaque scene reference. No words, labels, numbers, logos, buttons, borders or presentation panels. This is an art target, not a sprite sheet.
```

Reject if the characters are tiny, the scene is mostly empty sky, fortress geometry is impossible to parse, or the image only looks impressive when enlarged.

## C02: King Master

Attach the approved C01 reference.

```text
Create ONE isolated gameplay character for Fortress AI matching the attached approved style reference: a charming compact king who is brave but visibly a little nervous about incoming cannonballs.

Original character design: expressive face, clear eyes and eyebrows, a simple recognizable gold crown, short red cape, sturdy boots and a blue tunic. Friendly proportions with a large head and readable hands. Clean smooth 2D cartoon illustration, broad color shapes, very limited tiny texture, soft upper-left lighting.

Pose: calm neutral standing pose, facing right in a readable side view with a slight view of the face. Feet on one level baseline. Arms and cape separated enough to allow later cutout animation. Keep the full crown, cape, hands and feet visible. No props, cannon, shield, scenery, ground plane or cast shadow.

One character only. True transparent background. Center on a square image, ideally 1024 by 1024, with at least 12 percent clear padding on every side. No pixel-art filter. No words, labels, extra poses or sprite grid. Design the silhouette and face to read at 64 pixels tall.
```

Validate at 48px, 64px and the proposed gameplay zoom. Approve silhouette and personality before asking for animation poses. Do not export this master to a 24px file.

## C03: Cannon Base

Attach the approved C01 reference.

```text
Create ONE isolated cannon carriage/base for Fortress AI in the exact bright cartoon style of the attached reference.

Orthographic side view facing right, level horizontal ground contact. Two readable chunky wooden wheels, a sturdy warm wood carriage and simple blue-painted metal brackets. Broad shapes, clean contours, little fine texture, soft upper-left light. It should feel playful and heavy rather than realistic or ornate.

IMPORTANT: do not include a barrel. Leave a clear U-shaped barrel mount near the upper center, designed to accept a separate rotating barrel. Do not include a cannonball, flame, smoke, king, grass, ground plane or shadow.

One complete carriage only on a true transparent background, centered on an ideally 1024 by 1024 square image with generous clear padding. Keep every wheel and bracket visible. No text, numbers, labels, extra views or sprite sheet.
```

The importer will set a base pivot and barrel attachment from measured pixels. Treat these as explicit metadata; never rely on the image being visually centered.

## C04: Cannon Barrel

Attach C03 and the approved C01 reference. The base is an alignment reference and must not be included in the output.

```text
Create ONE isolated cannon barrel compatible with the attached approved Fortress AI cannon carriage. Match its side-view perspective, line weight, material rendering and upper-left lighting exactly.

The barrel points horizontally right. Use a chunky blue-gray metal tube with a clear dark muzzle and a small tasteful gold accent. A circular rear pivot collar must be easy to identify near the left end. Show the complete rear, pivot, tube and muzzle. Use broad readable cartoon forms, not photorealistic metal or pixel art.

Output only the barrel. Do not include the reference carriage, wheels, mounting structure, fire, smoke, projectile, scene or cast shadow. True transparent background. Ideally a 1024 by 512 image with clear padding around the complete barrel. One asset only, no text, labels or grid.
```

Validate by overlaying C04 on C03, rotating through the full approved firing range and applying recoil. If the pivot, perspective or mount cannot work after reasonable crop/cleanup, reject rather than stretching the art into place.

## C05: Wood Structural Surface

Attach C01 for color/style reference only.

```text
Create one seamless, flat wood surface texture for structural blocks in Fortress AI, matching the attached bright cartoon game style.

Front-facing flat surface, warm honey-colored wood, a few broad grain shapes, subtle low-contrast material variation. No outside outline, bevel, shadow or volume. No frame, metal corners, rivets, nails, end caps, perspective or separate wooden object. Avoid strong directional highlights at the image edges. This surface will be clipped inside separately drawn structural shapes.

The left and right edges must tile seamlessly, and the top and bottom edges must tile seamlessly. Texture scale should remain readable on small beams and blocks. Clean smooth cartoon illustration, not photorealism or pixel art.

Square opaque texture, ideally 1024 by 1024. Fill the entire image. No transparency, text, labels, grid, sample panel or decorative border.
```

Test a 3x3 repeat and several rectangle/beam/pillar shapes. Generation may fail exact edge continuity; validate and repair before use. Outer contours, contact shadows, joints and damage overlays are separate renderer features.

## C06: Independent Distant Hills

Attach the approved C01 reference.

```text
Create ONE wide distant-hills layer for Fortress AI in the attached bright smooth cartoon style.

Rolling rounded blue-green hills with a few simple distant tree shapes. Low contrast, broad shapes, little fine detail, gentle upper-left daylight. Side-view landscape layer, not a foreground platform. The upper edge must be a complete natural hill silhouette. The bottom can form a continuous lower band that will sit behind the playable terrain. The hills should span the full width.

Output only the hills layer on true transparency above the silhouette. No sky, sun, moon, clouds, castle, buildings, playable ground, characters, objects or rectangular painted backdrop. No fog rectangle or detached islands.

Ideally 1536 by 512. No text, labels, border, grid or UI. One layer only.
```

Validate the horizon in landscape and portrait crops and pan it across the intended camera range. Do not repeat it horizontally unless a separate seam test passes.

## C07: Independent Distant Fortress

Attach the approved C01 reference.

```text
Create ONE distant fortress landmark for Fortress AI, matching the attached bright cartoon game style.

A small welcoming stone castle with two clear towers, simple red pennants and a few broad roof shapes. Orthographic side-view landscape silhouette. Its base must sit flat on a visible shared horizon when composited. Muted blue-gray masonry, restrained warm windows, less saturation and contrast than a playable foreground character. Upper-left daylight. Keep shapes simple enough to read at 120 to 180 pixels wide.

One complete fortress with transparent padding around the full silhouette. True transparent background. No sky, sun, moon, mountains, clouds, fog, ground island, scenery rectangle, characters or UI. No words, labels, extra castles, grid or framing ornament. Ideally 1024 by 1024.
```

Reject any fortress that includes a floating island or its own painted sky. Place it on the same horizon as C06; it must not be centered behind the menu merely to fill space.

## Animation And Later Batches

After the masters work in the actual game, create a compact animation set: king idle/anticipation/hit/celebration/defeat, cannon recoil/recovery, projectile trail, smoke, material fracture and victory reaction.

Use rigged parts and authored transforms where appropriate. If generating a pose variation, attach the approved master and preserve costume, camera, scale and lighting. Process frames onto a shared untrimmed canvas with fixed foot/pivot anchors. Do not independently auto-trim each frame and assume the result is stable.

Start with one complete shot sequence. Build 3-5 variations of material impact sounds and an appropriate small music/ambience set separately; image generation does not provide that audio production.

Expand stone/ice/rubber/steel surfaces, shape ends/caps, crack masks and debris only after wood establishes the material approach. Add a second biome only after the first passes real-device tests.

## Runtime Delivery Checklist

1. Preserve high-resolution masters; create runtime variants from intended on-screen sizes and capped DPR, not arbitrary 24px/32px defaults.
2. Record source dimensions, trimmed rectangle, original untrimmed size, pivot, attachments and intended scale.
3. Keep source art separate from physics bounds; trim cannot move the character's feet or cannon pivot.
4. Validate alpha against white, blue, dark gray and the actual scene; reject matte halos and accidentally baked checkerboards.
5. Inspect complete silhouettes and every animation frame at runtime resolution and slow playback.
6. For repeating textures, check a 3x3 tile; for UI art use nine-slice or clean vector/CSS controls with preserved corners.
7. Atlas only validated files and preserve padding/extruded edges to avoid texture bleeding.
8. Bundle by menu/gameplay/optional cosmetics; fail visibly in development and provide a recoverable loading state in production.
9. Approve art inside the real phone and desktop battlefield before declaring it ready.
