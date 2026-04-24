Original prompt: Implement the Royal Landing Page Immersion Upgrade Plan using P14-P18 generated assets.

Progress:
- Imported P14-P18 into deterministic runtime sprites and regenerated the manifest.
- Added royal landing layers, logo ornaments, UI-frame overlays, ambient sprites, and preview-loop icons.
- Build passed; first browser pass found title shimmer was hiding the title during load, then CSS was adjusted so the title remains visible while shimmering.
- Final desktop, mobile, tablet, and reduced-motion screenshots were captured with 30/30 landing sprites loaded and no sprite 404s.
- Interaction flow checked: name entry, Solo/PvP toggle, How to Play expansion, and solo battle transition.
- Follow-up alignment pass fixed clipped flag crops, tightened P16 UI-kit crop boxes, removed the bad duplicated ridge layer, and aligned the segmented/button overlays.
- Revalidated desktop/mobile/tablet screenshots after the correction pass with 29/29 landing sprites loaded and no sprite 404s.

TODO:
- Full-project lint still has pre-existing server/test lint errors unrelated to this landing work.
