# Last Bear / Останній ведмідь

A small 3D platformer in the browser. You play Sofiyka, a girl turned into a black bear with glowing red eyes, and
guide her from the yellow backrooms through a bear village and a sky of honeycombs to free a captive cub.
The game text is in Ukrainian.

## ▶ Play

**https://ylevytskyy.github.io/last-bear/**

Desktop browser recommended. Click the game to look around with the mouse (Esc releases it).

## Controls

| Action | Keys |
| --- | --- |
| Move relative to the camera | W / S or ↑ / ↓ forward and back, A / D sideways |
| Turn the camera without the mouse | ← / → |
| Jump (hold for higher), double jump in the air | Space |
| Blink (dash) in the move direction; Reflex when the time slows and a Shift sign appears | Shift |
| Strike | X or left mouse button |

## Run locally

Requires Node and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev      # http://localhost:5104
pnpm test     # rules and view tests
pnpm build    # type check + production build into dist/
```

## Tech

TypeScript, [Three.js](https://threejs.org) for rendering, [Rapier](https://rapier.rs) for physics. The game rules
run without a renderer (see `docs/adr/0001-rules-run-without-renderer.md`), so they are tested headless.
Animated models are glTF files in `public/models/`, built with the Blender scripts in `tools/`.
The game is deployed to GitHub Pages by `.github/workflows/pages.yml`.
