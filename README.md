# 🎱 MarziusKill — A Haunted 8-Ball Story

Final project for the **Interactive Graphics** course, Sapienza University of Rome

---

## 🎮 Play the Game

Go to the [**GitHub Page**](https://sapienzainteractivegraphicscourse.github.io/final-project-marziuskill/).

---

## 📝 Game Description

**MarziusKill** is a first-person 3D billiards game set inside a haunted pub. The player takes the role of **MARZIUS**, entering an apparently abandoned bar where a supernatural opponent, **KILL**, is waiting for one last game of 8-ball.

The project combines a custom billiards simulation with full player interaction, 8-ball rules, a shot-planning CPU opponent, a physically navigable pub environment, cinematic sequences, procedural visual effects, and spatial audio.

Two game modes are available:

- **SOLO RUNOUT** — clear the table and legally pocket the 8-ball within a difficulty-dependent move budget.
- **VS KILL** — play a complete 8-ball match against KILL, whose planning depth and execution accuracy depend on the selected difficulty.

No external physics engine is used: ball dynamics, spin, cue impact, rail response, pocket capture, ball return, and shot prediction are implemented in JavaScript.

---

## 📁 Project Structure

```text
src/
├── assets/         # GLB asset loading and billiards-object mapping
├── audio/          # Centralized Web Audio system
├── bot/            # KILL planning, simulation and difficulty profiles
├── config/         # Physics, gameplay and presentation constants
├── events/         # Shot/gameplay event definitions
├── game/           # Match state, 8-ball rules, ball-in-hand and Solo mode
├── graphics/       # Scene, pub, lighting, cinematics, VFX and controllers
├── input/          # Keyboard and pointer input handling
├── objects/        # Cue rig and ball scene objects
├── physics/        # Custom rigid-ball, rail, pocket and return physics
├── systems/        # Shot, trajectory, cue-clearance and table systems
├── ui/             # Main menu, pause menu, rules and gameplay HUD
├── main.js         # Application bootstrap and game orchestration
└── style.css       # UI styling

public/
├── models/         # Billiards and pub GLB assets
├── textures/       # Pool-table and pub PBR textures
└── audio/          # Runtime sound effects, ambience and jukebox music
```

---

## 🕹️ Game Modes

### Solo Runout

KILL remains a spectator while the player clears the table.

| Difficulty | Move Limit |
|---|---:|
| Easy | 42 |
| Medium | 32 |
| Hard | 24 |

Every shot costs **1 move**. A foul adds **2 extra moves**, and each pocketed ball belonging to the wrong assigned group adds **1 extra move**. Reaching the move limit before legally pocketing the 8-ball results in defeat.

### Vs KILL

A complete two-player 8-ball match against the CPU.

KILL uses the same table geometry and physics systems as the player-facing simulation. Difficulty changes how many shot routes are explored and how accurately the selected shot is executed:

- **Easy** — reduced search, chooses among several good candidates, and introduces aim/power error.
- **Medium** — deeper search with small execution error.
- **Hard** — widest search profile with no artificial aim or power error.

---

## 📜 Core 8-Ball Rules

The rules enforced by the game include:

- The cue ball starts in the **kitchen** for the opening break.
- A break is legal if at least one object ball is pocketed **or** at least four distinct object balls contact rails.
- An illegal break reracks the table and gives the incoming player ball-in-hand in the kitchen.
- A legal-break scratch keeps the layout and gives the incoming player ball-in-hand in the kitchen.
- Pocketing the 8-ball on the break respots it and leaves the table open.
- Solids are **1–7** and stripes are **9–15**.
- The first legally pocketed solid or stripe after the break assigns groups.
- Normal shots enforce a legal first contact followed by a rail contact or pocket.
- Pocketed balls remain down even when the shot is a foul.
- Normal fouls give the incoming player ball-in-hand anywhere on valid cloth.
- The pocket is called only for the final 8-ball shot.
- Pocketing the 8-ball early, off the table, while scratching/fouling, or in the wrong called pocket results in defeat.

The complete in-game summary is also available from **RULES** in both the main menu and pause menu.

---

## 🚦 Controls

### Menus

| Key / Input | Action |
|---|---|
| Mouse | Select menu entries |
| `W / S` or `↑ / ↓` | Move selection |
| `A / D` or `← / →` | Navigate supported menu choices |
| `Enter` / `Space` | Confirm |
| `Esc` | Back / Pause / Resume |

### Gameplay

| State | Key / Input | Action |
|---|---|---|
| Free view | `Q / E` | Walk around the table |
| Free view | `W A S D` | Look around |
| Free view | `Enter` | Move into aiming position |
| Aim | Left mouse drag | Rotate/elevate the cue |
| Aim | `W A S D` | Move the cue-ball contact point and apply spin |
| Aim / Power | Hold `V` | Show predicted trajectory |
| Aim / Power | Hold `J` | Top-down table view |
| Aim / Power | Hold `K` | High three-quarter table view |
| Aim | `Enter` | Start the power meter |
| Aim | `Space` | Return to free view |
| Power | `Enter` | Shoot at the currently displayed power |
| Power | `Space` | Return to aim |
| Ball in hand | Mouse drag | Place the cue ball on valid cloth |
| Ball in hand | `Enter` | Confirm placement |
| Called 8-ball pocket | `W A S D` | Select the target pocket |
| Called 8-ball pocket | `Enter` | Confirm the called pocket |

---

## 🛠️ Technical Features

### Hierarchical Models

The project uses runtime transformation hierarchies rather than imported animation clips.

- **Cue rig** — `aimPivot → elevationPivot → contactOffsetPivot → rollPivot → strokePivot → cue`. Each layer controls a separate component of cue orientation, contact offset, spin alignment, and stroke.
- **Doors and windows** — imported static meshes are attached to JavaScript-controlled pivots so opening and closing animations propagate through the hierarchy.
- **Cue rack / cinematic cues** — individual cue anchors support pickup, return, floating, aiming, and attack sequences while preserving the rack hierarchy.
- **Triangle/prism VFX** — grouped procedural meshes, edge geometry, light sources, and transforms are animated as coordinated structures.

### Custom Billiards Physics

The physics simulation runs with a fixed **240 Hz** timestep and is implemented without an external physics engine.

- Sphere-sphere collision detection and impulse response.
- Cue-ball strike from cue direction, elevation, contact point, and shot power.
- Linear and angular velocity with off-center hits and side/top/back spin.
- Sliding-to-rolling behaviour and rolling resistance.
- Rail collision against the real table layout.
- Six independent pocket mouths derived from the authored pocket geometry.
- Gravity-driven pocket drop and capture.
- Internal ball-return transport using the hidden `BallReturn` asset rather than teleporting pocketed balls.
- Ball-in-hand validation against cushions, pocket mouths, table bounds, and other balls.

### Cue Interaction and Shot Preview

The player can independently control:

- horizontal cue direction;
- cue elevation;
- exact contact point on the cue ball;
- shot power.

A custom trajectory system predicts the cue-ball path on demand and uses the current table state, spin parameters, cushions, balls, and pockets without changing the live simulation.

### KILL — CPU Shot Planning

KILL does not use scripted shots. The planner:

1. finds currently legal target balls;
2. generates pocket routes and ghost-ball contact geometry;
3. rejects blocked cue-ball and object-ball paths;
4. checks cue clearance;
5. simulates candidate shots with the same core physics systems used by the game;
6. scores legality, pots, scratches, 8-ball outcomes, break quality, and cue-ball position;
7. selects and executes a shot according to the chosen difficulty profile.

The bot also handles legal ball-in-hand placement automatically.

### Lighting and Textures

- PBR materials use combinations of **base color, normal, roughness, metallic, and height-derived source maps** where applicable.
- The pool table is lit by three `THREE.SpotLight` sources aligned with the imported three-shade fixture.
- Additional warm and violet pub lighting separates the table from the surrounding haunted environment.
- Imported pub assets retain their authored PBR materials where available.
- Dynamic lights and emissive effects are used during supernatural VFX and cinematics.

### User Interaction

The game combines keyboard and pointer input across several interaction states:

- free first-person movement around the table;
- independent head movement;
- cue aiming and elevation;
- spin/contact-point selection;
- oscillating shot-power selection;
- trajectory and alternate camera views;
- ball-in-hand drag placement;
- called-pocket selection for the 8-ball;
- main menu, rules, pause, restart, and rematch flows.

### Animations

All gameplay and cinematic animations are implemented in JavaScript; **no imported animation clips are used**.

Examples include:

- cue backswing, strike, recovery, pickup, return and fall;
- player/KILL camera movement and walking;
- KILL cue materialization and dematerialization;
- door and window opening/closing;
- triangle apparition/disappearance and rack reset;
- prism growth, pulse and fade;
- pocket flames and called-pocket beacons;
- cue-ball placement transitions;
- scoreboard chalk writing;
- victory and defeat cinematics;
- floating rack cues and final cue attack sequence.

### Procedural and Runtime Graphics

Several visible elements are generated or updated at runtime:

- trajectory lines and collision preview;
- shot-power HUD;
- KILL thinking/progress UI;
- pocket and beacon VFX;
- triangular prism geometry and edges;
- scoreboard text rendered to a `CanvasTexture`;
- final cinematic scoreboard messages.

### Audio

A centralized `AudioManager` built on the **Web Audio API** handles:

- separate game, music, cinematic, and UI buses;
- browser-safe audio unlocking after user interaction;
- positional/attenuated sound sources;
- impact-scaled ball and rail volumes;
- collision cooldowns and subtle playback-rate variation;
- synchronized cue, ball, rail, window, door, footsteps, chalk, triangle, prism, KILL and cinematic effects;
- a positional jukebox that starts after the opening cinematic;
- an abrupt vinyl-stop transition before either ending cinematic;
- separate spectral ambience for the opening and ending sequences.

---

## 📚 Libraries and APIs Used

- [Three.js](https://threejs.org/) — WebGL rendering, scene graph, cameras, lights, materials, textures and 3D math.
- [GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader) — loading the billiards and pub GLB assets.
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — runtime audio graph, spatialization and synchronized sound playback.
- [Vite](https://vite.dev/) — development server and production build tooling.

No external physics engine or imported animation library is used.

---

## 💻 Running Locally

Requirements:

- a recent Node.js installation;
- a modern browser with WebGL and Web Audio support.

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

Preview the production build locally with:

```bash
npm run preview
```

---

## 👥 Authors

| Name | Student ID | Email |
|---|---|---|
| `Livio Marzio della Penna` | `2041721` | `dellapenna.2041721@studenti.uniroma1.it` |

---

## 📃 Assets and Credits

Third-party 3D models, textures, music, and sound effects are documented in [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

All imported 3D models are used as static source assets; game and cinematic animation is implemented in JavaScript.
