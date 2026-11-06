# Historical measurements for the 60 fps target

The user accepted 50 fps for this version. This run was deliberately stopped after the full 24-pass matrix and part of the diagnostics; it is not a complete suite. The new target is checked separately at 50 fps.

Run: 2026-11-06T04:49:45.626Z. Suite: all, configured repetitions: 3. Reference commit: `8a140e75fb64043b9fa334eae2bc8230727cbdf8`. The manifest also retains local changes and source hashes: the commit alone does not identify the measured build.

Browser: 156.0.8078.80. CPU: Intel(R) Core(TM) i7-10710U CPU @ 1.10GHz. OS: Windows_NT 10.0.26300 x64. The graphics device actually used is recorded in each scenario's JSON files; the browser inventory includes Intel(R) UHD Graphics, NVIDIA GeForce GTX 1650 with Max-Q Design, Microsoft Basic Render Driver.

## Rendering

Rows show continuous segments after warm-up, with separate cycles in the thermal test. These are renders submitted by the engine, not physical display presentations. GPU samples are asynchronous and may repeat; CPU and GPU timings must not be added together. Data from each repetition remain separate.

| Scenario | Backend | Rendered FPS | Interval p95 ms | CPU render p95 ms | GPU p95 ms | Missed display ticks | Valid measurement |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| webgpu-30-landscape-1 | webgpu | 29.73 | 47.30 | 2.90 | 23.46 | 0.81% | yes |
| webgpu-30-landscape-2 | webgpu | 30.00 | 41.30 | 2.00 | 26.08 | 0.00% | yes |
| webgpu-30-landscape-3 | webgpu | 30.00 | 42.40 | 2.10 | 25.17 | 0.00% | yes |
| webgpu-30-portrait-1 | webgpu | 30.00 | 36.40 | 0.90 | 21.36 | 0.00% | yes |
| webgpu-30-portrait-2 | webgpu | 29.90 | 36.40 | 0.90 | 20.71 | 0.22% | yes |
| webgpu-30-portrait-3 | webgpu | 30.00 | 43.40 | 1.50 | 23.72 | 0.00% | yes |
| webgpu-60-landscape-1 | webgpu | 54.94 | 26.20 | 2.40 | 17.30 | 8.44% | yes |
| webgpu-60-landscape-2 | webgpu | 54.65 | 26.10 | 2.70 | 17.83 | 8.90% | yes |
| webgpu-60-landscape-3 | webgpu | 54.92 | 28.20 | 2.50 | 17.63 | 8.47% | yes |
| webgpu-60-portrait-1 | webgpu | 55.27 | 23.90 | 2.40 | 16.58 | 7.87% | yes |
| webgpu-60-portrait-2 | webgpu | 55.58 | 22.50 | 2.30 | 16.71 | 7.36% | yes |
| webgpu-60-portrait-3 | webgpu | 54.99 | 25.50 | 2.30 | 16.52 | 8.36% | yes |
| webgl-30-landscape-1 | webgl2 | 30.00 | 40.30 | 1.00 | 22.63 | 0.00% | yes |
| webgl-30-landscape-2 | webgl2 | 30.01 | 36.40 | 0.70 | 20.29 | 0.00% | yes |
| webgl-30-landscape-3 | webgl2 | 30.00 | 36.40 | 0.90 | 24.30 | 0.00% | yes |
| webgl-30-portrait-1 | webgl2 | 30.00 | 36.80 | 0.90 | 21.82 | 0.00% | yes |
| webgl-30-portrait-2 | webgl2 | 30.01 | 36.30 | 0.90 | 20.89 | 0.00% | yes |
| webgl-30-portrait-3 | webgl2 | 30.00 | 36.30 | 0.70 | 17.66 | 0.00% | yes |
| webgl-60-landscape-1 | webgl2 | 56.59 | 18.30 | 0.70 | 11.33 | 5.68% | yes |
| webgl-60-landscape-2 | webgl2 | 56.31 | 18.40 | 0.70 | 13.84 | 6.17% | yes |
| webgl-60-landscape-3 | webgl2 | 56.02 | 18.50 | 0.90 | 14.74 | 6.65% | yes |
| webgl-60-portrait-1 | webgl2 | 56.52 | 18.30 | 0.60 | 12.28 | 5.82% | yes |
| webgl-60-portrait-2 | webgl2 | 55.29 | 22.90 | 1.00 | 14.17 | 7.85% | yes |
| webgl-60-portrait-3 | webgl2 | 55.30 | 24.70 | 1.00 | 13.63 | 7.84% | yes |
| diagnostic-webgpu-1-10-1 | webgpu | 32.35 | 54.10 | 3.80 | 33.88 | 46.11% | yes |
| diagnostic-webgpu-1-10-2 | webgpu | 40.21 | 44.80 | 1.50 | 27.72 | 32.96% | yes |
| diagnostic-webgpu-1-10-3 | webgpu | 32.60 | 54.70 | 2.80 | 33.23 | 45.65% | yes |
| diagnostic-webgpu-1-6-1 | webgpu | 45.31 | 38.60 | 1.30 | 23.99 | 24.47% | yes |
| diagnostic-webgpu-1-6-2 | webgpu | 44.19 | 39.70 | 1.70 | 27.00 | 26.32% | yes |
| diagnostic-webgpu-1-6-3 | webgpu | 45.36 | 39.40 | 1.30 | 23.86 | 24.37% | yes |
| diagnostic-webgpu-1-4-1 | webgpu | 47.20 | 36.90 | 1.40 | 23.53 | 21.30% | yes |
| diagnostic-webgpu-1-4-2 | webgpu | 46.87 | 37.30 | 1.30 | 23.92 | 21.98% | yes |
| diagnostic-webgpu-1-4-3 | webgpu | 46.04 | 38.50 | 1.40 | 24.90 | 23.24% | yes |
| diagnostic-webgpu-0.5-10-1 | webgpu | 56.54 | 18.40 | 1.20 | 15.73 | 5.75% | yes |
| diagnostic-webgpu-0.5-10-2 | webgpu | 56.75 | 18.30 | 1.10 | 14.42 | 5.37% | yes |
| diagnostic-webgpu-0.5-10-3 | webgpu | 56.33 | 18.60 | 1.30 | 15.60 | 6.10% | yes |
| diagnostic-webgpu-0.5-6-1 | webgpu | 56.23 | 18.60 | 1.40 | 14.09 | 6.29% | yes |
| diagnostic-webgpu-0.5-6-2 | webgpu | 56.14 | 18.70 | 1.70 | 16.19 | 6.39% | yes |
| diagnostic-webgpu-0.5-6-3 | webgpu | 56.16 | 18.50 | 1.40 | 14.75 | 6.38% | yes |
| diagnostic-webgpu-0.5-4-1 | webgpu | 56.22 | 18.60 | 1.00 | 11.99 | 6.29% | yes |
| diagnostic-webgpu-0.5-4-2 | webgpu | 56.43 | 18.50 | 0.90 | 10.49 | 5.93% | yes |

## Loading

| Scenario | Ready in s | Transfer MB | Error |
| --- | ---: | ---: | --- |
| Not yet collected | — | — | — |

Decoding, upload, and shader compilation phases that have not been isolated remain aggregated. The local network does not represent GitHub Pages: simulated latency and bandwidth are explicit in the names. Cache control is confirmed by the CDP flags in the JSON files.

## Image repeatability

Not yet collected.

## Errors and limitations

No execution errors were recorded in the completed scenarios.

Physical phone results are pending device availability. Narrow viewports on the PC check layout and rendering cost at those dimensions; they do not certify mobile performance. GPU memory is the memory accounted for by the engine; PCM memory and the JavaScript heap are separate items. The original JSON files and images remain in the local run directory, which is excluded from Git.
