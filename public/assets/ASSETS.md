# Assets & credits

See `manifest.json` for the full machine-readable list (source, licence, format, textures, animations, triangle counts, intended use).

**Imported, realistic**
- Characters: Microsoft Rocketbox avatars `Business_Female_01` (Amara) and `Male_Adult_12` (Kofi) with Rocketbox animations — MIT licence.
- Car: "Ferrari 458 Italia" by vicent091036, via the three.js examples — **CC-BY 4.0** (attribution required; shown in game Settings).
- Sky HDRI and surface textures: Poly Haven — CC0.

**Procedural (generated in code, not realistic imports)**
- Train, private jet, airliner, all buildings, roads, railway, stations, vegetation, streetlights.

## Adding better models

Characters: `node scripts/assets/convert-rocketbox.mjs avatar <in.fbx> <out.glb>` and
`node scripts/assets/convert-rocketbox.mjs anim <in.fbx> <out.json> [--in-place] [--max=8] [--fps=15]`,
then register the model in `src/game/actors/Avatar.tsx` (`MODELS`). Any Rocketbox avatar works with the existing animations.

Vehicles: any GLB whose wheels are separate nodes named `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` (and optionally `steering_wheel`) can replace `vehicles/ferrari.glb` in `src/game/actors/Car.tsx`.

Train / aircraft: replace the procedural model inside `Train.tsx` / `Aircraft.tsx` (`AircraftModel`) with a `useGLTF` model; the movement code doesn't change.

Always check the licence before adding a file, and record it in `manifest.json`.
