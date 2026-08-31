# 3D Billiards — v0.1

Interactive Graphics project starter.

## v0.1 scope

- Three.js scene
- Perspective camera + OrbitControls
- Parametric pool table
- Six visual pockets
- Four legs
- Overhead lighting
- Soft shadows
- Development axes helper
- No balls / cue / physics yet

## Coordinate convention

- X: table width
- Y: up
- Z: table length
- 1 Three.js unit = 1 meter
- Cloth surface is at `TABLE.CLOTH_Y`

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Build

```bash
npm run build
```

## Next milestone

v0.2:
- cue ball
- hierarchical CueRig
- yaw
- pitch
- stroke animation skeleton
