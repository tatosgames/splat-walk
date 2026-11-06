# Splat Walk benchmarks

`npm run perf:baseline` builds an immutable copy of the build in `.performance/<data>/site`, uses the installed Chrome with hardware GPU acceleration, and saves samples and results in the same run directory. It does not close browsers or servers that are already running. Port 5187 must be free. Do not run other GPU workloads during measurements.

## Commands

```powershell
npm run perf:test
npm run perf:baseline -- --suite=smoke
npm run perf:baseline -- --suite=all --output=.performance/baseline-original
node tools/performance/report.mjs .performance/baseline-original docs/performance/baseline.md
```

Available suites: `matrix`, `release`, `diagnostic`, `loading`, `burn`, `thermal`, `captures`, `smoke`, `interaction`, `qa`, and `all`. `interaction` tests mouse and CDP touch input; `qa` and `interface` check four viewports, automatic recentering after three seconds, the audio icon control, and continuous looping playback. The thermal test includes camera orientation changes and a burn every ten seconds. `--repeats=3` is the default for the matrix and diagnostics. A full suite takes tens of minutes. Keep Chrome visible and the computer connected to power; do not change the GPU or refresh rate during the comparison.

Samples are retained in the JSON files, with asset and source hashes in the manifest. `postrender` identifies renders; `frameend` is used only to read statistics after the frame. GPU queries may arrive late: GPU timings are not artificially assigned to the concurrent CPU sample. Missing values remain null. To confirm a bottleneck, compare the same sections at a fixed resolution and sample count.

## Physical phones

Open `/benchmark.html` on your GitHub Pages site, enter the model and conditions, select FPS/backend, and press Apply before starting. Run three walks in portrait and three in landscape, followed by a burn and a five-minute session. Keep the tab visible: an interruption invalidates the measurement. Export JSON files separately for each device and orientation. Use Stop to end a session: the result remains available but is marked invalid for a full run.

The page sends no telemetry: results stay in memory and are downloaded only on request. URLs in the JSON files identify the loaded assets. Do not publish personal conditions or notes that you do not wish to share. The automatic backend may fall back to WebGL: check the backend actually recorded.

## Captures

The `captures` suite uses a fixed scene scale of 1 (rather than the runtime's dynamic scale), freezes the camera, noise, and effects, waits for the renderer to stabilize, and captures two PNGs per pose. It hides overlays only during these captures. Checking for identical PNGs is an initial determinism check; if it fails, quantify the pixel differences and do not claim that the image is preserved. Lossy scene changes require a side-by-side comparison rather than pixel identity.

Loading measurements separate cold/warm caches and unrestricted/10 Mbit/s networks with a 100 ms RTT. Scene decoding, GPU upload, and shader compilation may overlap: they are aggregated when reliable separate measurements are unavailable. HTTP 200 responses and a successful build do not establish visual correctness.

## Results

The [full baseline](baseline.md) includes 74 scenarios on the PC's Intel UHD GPU. Data from individual repetitions remain separate. Do not describe these results using the name of the NVIDIA GPU installed in the computer: the browser context used Intel. Phone validation is described in [mobile-validation.md](mobile-validation.md).

`--query=profile=quality&shutter=0.0125&readout=0.016` allows comparison with the original dataset and optical timings. Additional query parameters follow the scenario parameters: the first occurrence of a parameter takes precedence. Do not override FPS, scales, or taps in a matrix; create a dedicated run. `--output` should always point to a new directory.

The thermal test repeats the route for five minutes, alternates yaw/pitch offsets, and triggers scheduled burns. This exercises the renderer but does not replace human gestures or physical testing of touch sensors. GPU timings are asynchronous. The benchmark also separates segments when Auto changes the target FPS, so ticks are not attributed to the wrong cadence.

To compare a candidate without publishing it, use `--scene-file=.performance/scene-work/mobile-v1.sog` with `--suite=captures` and `--query=profile=quality&shutter=0.0125&readout=0.016&taps=10`. The runner copies the SOG only into the run's isolated build and records its hash and size. Repeat with the same geometry and different SH bands to isolate color changes from decimation.

After deployment, `node tools/performance/check-pages.mjs --output=.performance/pages-check` checks the published demo in Chrome: portrait rendering, dragging, audio, HTTP resources, a short benchmark, and cold/warm caches at 10 Mbit/s. JSON files and screenshots remain local. This check of the published site still uses the PC's GPU.

Cold means the HTTP cache has been cleared via CDP; it does not clear the driver's shader caches. In the Pages check, the browser has already opened the demo before the network test. Cold-cache timings therefore do not guarantee a measurement of the first compilation on a previously unused device.

The current target is 50 fps. `npm run perf:baseline -- --suite=release --target-fps=50` runs three passes per backend and orientation, a burn, five minutes of testing, network tests, and captures. Avoid repeating the full diagnostics when the current budget is already sufficient. Historical 30/60 data remain separate.
