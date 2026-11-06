# Validation on physical phones

Status: awaiting device measurements. The availability of the benchmark page does not mean mobile testing is complete.

Open [the benchmark page](https://tatosgames.github.io/splat-walk/benchmark.html) after deployment. Before each run, enter the model, browser, system version, and power/network conditions. Do not include personal data in the notes.

| Device | Model and OS | Browser | Portrait: three runs | Landscape: three runs | Burn and restore | Five minutes | JSON |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Android | To be specified | Chrome | To do | To do | To do | To do | To be collected |
| iPhone | To be specified | Safari | To do | To do | To do | To do | To be collected |

## Procedure

1. Set the screen to 60 Hz if the device allows it, disable power saving, and record the conditions. Do not test while other heavy workloads are running.
2. Select 50 fps and the automatic backend on the benchmark page. Apply and reload; choose Walk for three repetitions. Keep the page visible.
3. Export the JSON, rotate the phone, and repeat. Record the backend actually used: WebGPU may not be available.
4. Run the Burn and restore scenario, then the five-minute session. Note overheating, crashes, and visible degradation.
5. In the main demo, check dragging and tapping separately, two-finger input, gesture cancellation, automatic recentering after three seconds, and phone rotation. Check notches, browser bars, buttons, and credits.
6. For cold-cache tests, use browser tools when available; do not call a measurement cold simply because the page was reloaded. Record any limitations.

## Criteria

The current 50 fps target requires consistent measurements throughout the entire walk and interaction, not a favorable average over a few seconds. Compare p95/p99, missed ticks, actual dimensions, and backend. Missing GPU timing remains unavailable; an emulated mobile viewport on a PC does not replace this table.

If the benchmark records Auto falling back to 30 fps, the demo remains usable but the 50 fps requirement is not met on that phone. Any artifacts introduced by reducing the Gaussians must be described by pose and viewing angle, alongside speed.
