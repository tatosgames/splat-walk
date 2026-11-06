# Splat Walk

A first-person walk through David Fletcher's Gaussian splat scan of Artillery Passage,
London, built with PlayCanvas and Vite. This fork adds portrait rendering, touch camera
rotation, compact scene variants and reproducible performance measurements.

[Open the demo](https://tatosgames.github.io/splat-walk/) ·
[Run a device benchmark](https://tatosgames.github.io/splat-walk/benchmark.html) ·
[Original project](https://github.com/willeastcott/splat-walk)

## Run locally

```sh
npm ci
npm run dev       # http://localhost:5186
npm run build     # static site in dist/
npm run preview   # http://localhost:5187
npm run perf:test
```

Node 24 was used for development. GitHub Pages builds and deploys `main` through
`.github/workflows/pages.yml`. Asset URLs are relative so the `/splat-walk/` prefix works.

## Controls

Press Play to start; the walk then repeats automatically without pause/resume controls.
At the end of the passage the camera eases through a U-turn and retraces the same spline
in the opposite direction; it turns back the same way at the entrance and keeps looping.
Drag the picture with one finger or the mouse to look around. Three seconds after release,
the viewing offset eases back to the route's center. A new gesture interrupts that return.
A short tap reveals the Gaussians with a burn and restoration effect; dragging, cancelled
gestures and multitouch do not trigger a burn.

The speaker icon toggles sound and exposes its state to assistive technology. M also toggles
sound; F requests fullscreen where supported. Playback suspends while the page is hidden
and continues automatically when it becomes visible. No FPS/device-limit badge appears.
The initial Play gesture is retained to enable browser audio.

Touch controls remain visible. Portrait uses the actual viewport and preserves the vertical
field of view; wide touch landscape preserves the horizontal composition. Desktop retains
16:9 presentation. Rotation changes orientation only, never the walk's position.
Yaw is limited to ±60 degrees and pitch to ±30 degrees.

## Quality and download size

| Profile | Scene | SH bands | Scene bytes | Film samples | Maximum output long edge |
| --- | ---: | ---: | ---: | ---: | ---: |
| Auto / Performance | 250,000 Gaussians | 0 | 3,124,504 | 4 | 896 px |
| Balanced | 1,000,000 Gaussians | 1 | 14,490,298 | 6 | 1,600 px |
| Original | 4,999,591 Gaussians, five chunks | 3 | 79,577,556 | 10 | 1,920 px |

These are scene sizes, not complete page transfer sizes. Only the selected scene downloads.
Auto starts with Performance; it does not download larger profiles to test the hardware.
The output has both pixel and DPR caps, and the scene target has dynamic resolution.
Performance shares one RGB ray per temporal sample, omitting lateral chromatic aberration;
Balanced and Original retain separate colour rays. All profiles retain the film treatment.

Auto targets up to 60 fps so it can recover resolution above 55 fps. It lowers scene resolution
by small steps only after measured output stays below 25 fps for over five seconds, and restores
resolution gradually after 2.5 seconds above 55 fps. At minimum resolution, Auto falls back to
30 fps only if the low frame rate persists for another five seconds. Fixed profiles default to
50 fps; Auto periodically probes at 60 fps again after its 30 fps fallback so it can recover.
`fps=50` also keeps Auto capped at 50. Targets are not guarantees of a stable frame rate.
The compact scan loses fine sign lettering and close wall detail. Use Balanced or Original
for comparison. Real Android and iPhone validation remains pending; PC viewport emulation
cannot certify mobile GPU performance. See [measurements](docs/performance/README.md).

Audio loads after a playback gesture and joins at the current walk time. Muted playback does
not download audio. Optional sound failures do not block the visual experience. Backgrounding
the page suspends playback, with automatic continuation on return. Scene failures expose a retry control.

## Asset pipeline

`@playcanvas/splat-transform` is pinned to 3.10.3 as a local development dependency.
The existing compressed SOG was the available source; decoding it to PLY does not recover
information lost during the original compression. The original five chunks remain unchanged.
Generated variants use SOG v2 and have been loaded with PlayCanvas 2.23.3 on both backends.

```sh
npm run splat -- --help
npm run splat:info
npm run splat:build -- --name=example --count=500000 --harmonics=0 --gpu=cpu
```

The build script writes intermediate PLY, SOG and recipe JSON into ignored
`.performance/scene-work/`. It refuses to overwrite an existing candidate. Decimation
retains the source harmonics; a separate encoding step reduces SH bands. `--source=...`
accepts another source and `--gpu=1` can select an adapter listed by the installed CLI.
The selected 250K variant was decimated through a 500K intermediate; its exact commands,
hashes and provenance are in [scene-recipes.json](docs/performance/scene-recipes.json).
Only promote reviewed candidates into `public/scene/`; do not recompress its data textures
with a photographic image optimizer. More LOD levels were unnecessary for the selected
single-file loading strategy and have not been invented by changing a runtime budget.

## Rendering structure

- `src/main.js`: loading, PlayCanvas cameras, render scheduling, audio clock and resolution scaler.
- `src/settings.js`: quality presets, validated URL settings and projection/pixel budgets.
- `src/camera-look.js`: tap/drag classification, pointer cancellation and smoothed quaternion offsets.
- `src/walk.js`, `src/route.js`: time-based route, gait and automatic gaze.
- `src/post.js`: matching WGSL/GLSL film shaders, exposure, rolling shutter, lens and grain.
- `src/burn.js`: matching Gaussian hooks for two overlapping burn/restoration fronts.
- `src/audio.js`: footsteps, city beds and event sounds synchronized with the route.
- `benchmark.html`, `tools/performance/`: separate diagnostics; not imported by the demo.

## URL parameters

| Parameter | Effect |
| --- | --- |
| `profile=performance`, `balanced`, `quality`, `auto` | Select scene and rendering preset; default Auto |
| `fps=50` | Explicit target (Auto defaults to 60; fixed profiles to 50), clamped to 15–120; disables Auto's 30 fps fallback |
| `taps=4` | Film temporal samples, clamped to 1–24 |
| `shutter=0.008333` | Exposure seconds; default 1/120, clamped positive |
| `readout=0.008` | Rolling shutter seconds, 0–0.05 |
| `fov=50` | Base vertical field of view, 25–90 degrees |
| `maxh=1080` | Additional output height cap; preset pixel/long-edge limits still apply |
| `scale=0.5` | Fixed scene target scale, 0.35–1; disables dynamic resolution |
| `scene=./scene/lod-meta.json` | Override the selected scene URL |
| `film=full` | Restore separate colour rays in Performance for comparison |
| `alpha=0.02` | Forward opacity cutoff; default 0.02 in Performance, 1/255 otherwise |
| `sort=cpu` | Diagnostic CPU sorting override; default follows the engine/backend |
| `webgl` | Force WebGL 2; otherwise try WebGPU first |
| `mute`, `autoplay` | Start muted / start when ready; browser audio rules still apply |
| `debug` | HUD and free camera: C, WASD/QE and drag; `window.__aw` developer handle |

## Credits and licensing

- Original application by [Will Eastcott](https://github.com/willeastcott/splat-walk).
  The upstream snapshot contains no application-code license file; public source availability
  alone does not establish an open-source license for that code.
- [Artillery Passage](https://superspl.at/scene/f4897475) by
  [David Fletcher](https://superspl.at/user/artfletch), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  This fork decimates the existing SOG, reduces harmonics and recompresses derived variants.
  Attribution and transformation details are in `public/scene/LICENSE.txt`.
- Engine: [PlayCanvas](https://github.com/playcanvas/engine), MIT.
- Original sounds generated with ElevenLabs; `tools/build-audio.mjs` prepares the audio assets.
