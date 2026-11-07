# Roadster Rush

A neon synthwave endless runner in the style of Subway Surfers. You drive a Roadster down a three-lane highway at night.
All 3D models, textures, the city, the sky, the sound effects and the music are generated in code. There are no external assets.

## Run

```bash
npm install
npm run dev      # opens http://localhost:5173
npm run build    # static build in dist/ (host anywhere)
```

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Switch lane | ← → / A D | swipe left / right |
| Jump | ↑ / W / Space | swipe up |
| Low-ride (duck) / slam down mid-air | ↓ / S | swipe down |
| Pause | P / Esc | pause button |
| Mute | M | |

## Gameplay

- **Concrete barriers**: jump over them.
- **Low-clearance gantries**: low-ride under them.
- **Traffic sedans**: dodge them or land on their roofs.
- **Semis and box trucks**: drive up the hazard ramp and ride on top.
- **Kicker ramps**: launch through arcs of energy cells.
- **Side-swipes**: clipping something while changing lanes bounces you back and puts the police on your tail. Do it again before they back off and you're **BUSTED**. Any head-on hit means you're **WRECKED**.
- **Power-ups**: Cell Magnet, Shield (absorbs one hit), Nitro Thrusters (boost and smash through everything), and Double Score.
- **Score**: the multiplier grows with distance. Collected cells go to your bank, which you spend in the **Garage** on paints and underglow colors. Your best score and bank are saved in `localStorage`.

## Code map

- `src/models.js`: the Roadster, traffic, trucks, police, ramps, barriers and pickups, built from extruded and primitive geometry
- `src/textures.js`: canvas-painted textures (asphalt, windows, signs, trailer liveries, icons)
- `src/world.js`: sky shader with the striped sun, wireframe mountains, road, city, lamps, palms and signs (instanced and recycled)
- `src/spawner.js`: procedural obstacle patterns, cells, power-ups and collision probing
- `src/audio.js`: Web Audio synth (motor whine, sound effects, siren, synthwave sequencer)
- `src/main.js`: game loop, physics, camera, HUD, menus and garage
