# splat-walk

A web app that plays a first-person walk through a Gaussian splat scan of Artillery Passage
(Spitalfields, London), made to look like footage from a phone: a simulated walker and head,
a camera body with motion blur, rolling shutter and lens, a 30 fps clock, and a soundtrack of
footsteps and the city. Tap the picture and it burns down to its Gaussians, then reassembles.
Built with [PlayCanvas](https://playcanvas.com) (WebGPU, with a WebGL 2 fallback).

```bash
npm install
npm run dev        # http://localhost:5186
npm run build      # static site in dist/
```

Click play (or press Space). **Tap or click the picture to burn it down to its Gaussians.** Space
(or the corner button that appears when the pointer moves) pauses, R restarts, F toggles
fullscreen, M mutes.

## Burn to Gaussians (`src/burn.js`)

A tap casts a ray from the camera into the passage (against the floor and wall model) and lights a
fire front at that point. It spreads through the scan, slowing as it goes (about 24 m reach). As
it passes, each Gaussian flashes hot; the larger ones turn into thin glowing outlines of their own
elliptical footprint (the structure the scan is made of) while the small ones flare; then they all
collapse into small dots that drift up like embers and cool, about half of them kept so the cloud
stays crisp, as the world behind falls into darkness. Five seconds after the tap a cyan front
sweeps out from the same point: the dots fly home, flash through their outlines again and
re-inflate into the photoreal scene. Two taps can overlap. The walk carries on throughout, and
taps also work while paused.

It runs in the engine's per-splat hooks on the shared unified material: `gsplatModifyVS` moves,
reshapes and recolours each splat (in the GPU projector compute pass on WebGPU, so nothing has to
re-render the 5M-splat work buffer), and `gsplatModifyPS` draws each fragment as gaussian, outline
or dot. The per-splat state reaches the fragments as one 32-bit varying (four packed bytes). Both
WGSL and GLSL versions are included. On the integrated GPU a burn costs a few ms, which the
dynamic resolution absorbs at 30 fps.

## The scene

`scene.ply` from the download (1.18 GB, 5.0M splats, 3 SH bands) was compressed with
[splat-transform](https://github.com/playcanvas/splat-transform) into SOG (76 MB), split into six
spatial chunks so the engine re-evaluates view-dependent colour per chunk rather than for all
5M splats whenever the camera moves:

```bash
splat-transform -g 1 scene.ply -l 0 public/scene/lod-meta.json --lod-chunk-count 1024 --lod-chunk-extent 20
```

It is a single level of detail, so nothing ever pops between levels, and every splat is kept. A
plain single-file SOG (`splat-transform scene.ply scene.sog`, 65 MB) also works with
`?scene=./scene.sog` if it is copied into `public/`, but it costs ~20 ms more per frame.

## How it is made to look like footage

- **The walk** (`src/walk.js`, `src/route.js`) is a pure function of time. The route was measured
  from the splat: floor height along the passage, the walls, and the obstacles at walking height
  (bollards, lamp posts, bins, a parked bike), which the path weaves around. The gait model has
  cadence tied to speed, the double-hump vertical bob with a slightly uneven left/right step, side
  sway at stride frequency, a soft heel-strike shock, trunk counter-rotation, breathing and sway
  while standing, gait initiation and a two-step stop. The head is simulated: attention steps
  between goals - the path a few metres ahead with small irregular glances around it (and now and
  then down at the footing), or things a walker notices (shopfronts, signs, the graffiti down the
  side alley, the bollards underfoot), re-fixated once or twice while looking. The head chases each
  goal like a damped spring tuned per movement, so turns start softly, peak early, settle late and
  overshoot a little, with bigger turns taking longer, and the phone follows the head through a
  second, stiffer spring. Turns roll the head into the turn and dip it slightly, and a head held
  to one side stays a little tilted. The walker slows a little while looking. Hand shake is
  layered on as smooth noise.
- **The camera** (`src/post.js`) renders the splats with 10% overscan into an HDR target. A film pass
  then integrates each output pixel over a 1/80 s exposure and a 16 ms rolling-shutter readout,
  reprojecting from the exact camera pose at each instant (depth from an analytic proxy of floor
  and walls, so the near walls and paving blur correctly). It adds barrel distortion, lateral
  chromatic aberration, halation around the bright sky, phone-style sharpening, lens falloff and
  sensor noise on a 1080p grid.
- **The sound** (`src/audio.js`) is what the phone's microphone would pick up. A footstep lands
  at every heel strike of the gait model, chosen from 16 single steps of trainers on stone paving,
  alternating a slightly heavier and lighter foot, softer as the walker slows. Inside the passage
  the steps get flutter echo between the walls and a short stone tail, which fades as the walker
  comes out onto the street. Under that runs a continuous city bed: four long textures (distant
  traffic, a far murmur of people, birds, a low wash of the wider city), each looped seamlessly and
  drifting in level on its own slow cycle, so the mix never settles. Faint distant sounds rise out
  of it and sink back - cars, a van, a scooter, voices, passers-by, pigeons, a gull, a horn, a dog,
  a trolley, a siren - placed at random but the same on every play, overlapping, softened by
  distance. Between the buildings the whole city is quieter and duller. It all goes through a
  phone-mic chain (no low end, automatic gain, a limiter), landing around -22 LUFS.
- The sounds were generated with ElevenLabs by `node tools/build-audio.mjs` (raw takes are cached
  in `tools/raw/`, so re-runs are free) and are ~2 MB in `public/audio/`. The script trims each
  texture to its steady stretch. One take was rejected for a steady 200 Hz harmonic buzz, and its
  replacement had a 7 kHz whine notched out.
- **The clock** runs at a fixed 30 fps, like a phone video, and frames are only rendered on that
  cadence. While sound plays, the audio clock drives the pictures, as a video player syncs to its
  soundtrack. Before playback the app benchmarks the GPU on a stretch of the walk. During playback
  it trims the splat render resolution (never the output) to hold 30 fps, using GPU timer queries.

## URL parameters

| Parameter | Effect |
| --- | --- |
| `fps=60` | Video frame rate (default 30) |
| `shutter=0.0167` | Exposure time in seconds (default 1/80) |
| `readout=0.016` | Rolling-shutter readout time in seconds |
| `fov=50` | Vertical field of view in degrees |
| `maxh=1080` | Maximum output height in device pixels |
| `scale=1` | Fixed splat render scale (disables dynamic resolution) |
| `scene=./scene.sog` | Load a different splat file |
| `webgl` | Force WebGL 2 instead of WebGPU |
| `autoplay` | Start playing as soon as it's loaded (silent unless the browser allows audio) |
| `mute` | Start muted |
| `debug` | HUD, free camera (C toggles; WASD/QE + drag), `window.__aw` dev handle |

On a laptop with both an integrated and a discrete GPU, Chrome on Windows uses the integrated one
unless Windows' Graphics settings give the browser the "High performance" GPU. It plays at 30 fps
either way, but renders the splats sharper on the discrete one.

## Credits

- Scene: ["Artillery Passage"](https://superspl.at/scene/f4897475) by
  [David Fletcher](https://superspl.at/user/artfletch), licensed
  [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Changed: compressed from the original
  PLY to a chunked SOG (all splats kept). See `public/scene/LICENSE.txt`.
- Sounds generated with [ElevenLabs](https://elevenlabs.io).
- Engine: [PlayCanvas](https://github.com/playcanvas/engine) (MIT).
