# Mobile version decisions and limitations

## Data and quality

The original dataset remains available: 4,999,591 Gaussians, three SH bands, five chunks,
79,577,556 bytes. These are not five LOD levels. The default variant contains 250,000
Gaussians, zero SH bands, and takes up 3,124,504 bytes: a 96.1% reduction in scene bytes.
Balanced contains one million Gaussians, one SH band, and takes up 14,490,298 bytes.

The original PLY was not in the repository. Conversion starts from the already compressed SOG;
no reconstruction recovers the lost precision. Downloading from SuperSplat required
a separate account. The complete recipes, including intermediates and hashes, are in
[scene-recipes.json](scene-recipes.json). The public manifest contains only the selected
variants, while candidates and working PLY files remain outside the bundle.

500K SH0 (6,155,509 bytes), 500K SH1 (7,571,208 bytes), and 2M SH1
(28,258,740 bytes) variants were also generated. The 500K pair isolates the loss caused by harmonics
on the same geometry. Comparing the archives confirms identical bytes for positions, rotations, scales, and SH0; only shN changes in the manifest, and the two SH1 textures are added. The data are in [harmonic-comparison-data.json](harmonic-comparison-data.json). Generating a candidate does not certify its quality.
Distant volumes were not removed based on statistics alone: they might appear
in sideways camera views.

## Rendering

Performance separately limits output (896 px on the long side, 451,584 pixels, DPR 1.5) and
the scene render target (dynamic scale 0.5–1). Four temporal samples share
the RGB read: the lightweight profile drops lateral chromatic aberration while retaining
exposure, rolling shutter, halos, sharpening, vignetting, and grain. The forward cutoff of
0.02 avoids nearly transparent tails. Balanced and Original retain the three color rays.
The GLSL and WGSL shaders implement the same changes.

Default sorting remains the engine's own: GPU on WebGPU, CPU on WebGL. On the Intel PC,
the WebGPU smoke test with CPU sorting produced about 45 fps versus about 52 with GPU sorting
at the previous 1024 px output size. It was not adopted as an optimization. Reducing output
to 768 px produced about 56 fps, close to the 55–56 at 896 px, while losing detail:
896 px is the retained compromise. These six-second smoke tests guide the choice;
they do not demonstrate stable 60 fps.

The lightweight profile's initial benchmark uses 32 frames instead of 60 and starts at scale 0.7.
The single SOG requires three frames of stable readiness instead of the twenty used by the original
streaming setup. The minimum detail level is already the profile's complete scene: no hidden upgrade
downloads the original dataset. Sounds load after the gesture and do not block Play.

## Visual and functional checks

Chrome checks covered 320x568, 390x844, 412x915, 844x390, 768x1024, and 1280x720,
including the start and pause screens. Portrait renders at the actual aspect ratio. Controls
are at least 44 px tall and fit within the viewport; at 320 px, quality occupies a second row.
Views at yaw -60/+60 and pitch -30/+30 were inspected at t=16. Nearby walls and
signs lose detail in the lightweight preset: this is a visible reduction, not equivalence
to the original scene. No obvious new gaps appeared in the four inspected views;
this observation does not cover every combination of time and angle.

Mouse and CDP touch tests checked dragging while paused, recentering, multitouch without a burn,
tapping with a burn, and viewport changes. Other checks verified actual browser audio,
pause/resume, ending and replay, scene errors, and retry. The visibilitychange test is synthetic:
automation kept both windows visible. Actual background behavior, notches, dynamic browser bars,
and physical gestures on Android/iPhone remain part of the
[device procedure](mobile-validation.md).

The original duplicate captures are not byte-identical despite the pose, noise, and
effect time being frozen. At t=16, 34,828 out of 921,600 pixels differ, mostly by
one level; the observed maximum is 24. The byte-identity gate has not passed. Lossy changes
therefore use side-by-side comparisons; no quality threshold is invented.

## Release criteria

On November 6, the target was updated to 50 fps at the user's request. 60 fps remains a future goal. The current budget is GPU/CPU p95 within 17 ms, missed ticks below 1%, and p99 interval
within 40 ms. A valid run means the measurement is complete and visible, not that
these budgets have been met. Auto reports 30 fps after sustained overload;
the fallback keeps the experience usable but does not meet the 50 fps target.
The matrix with explicit FPS keeps the requested target to make failures visible.

PC results do not certify a mobile GPU. No reference phones have been
provided, so Android/iPhone validation is not claimed to be complete.
