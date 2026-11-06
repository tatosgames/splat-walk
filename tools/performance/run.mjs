import { chromium } from 'playwright-core';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(import.meta.dirname, '../..');
process.chdir(root);
const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const suite = option('suite', 'all');
const targetFps = Number(option('target-fps', '50'));
if (!Number.isInteger(targetFps) || targetFps < 15 || targetFps > 120) throw new Error('target-fps must be an integer from 15 to 120');
let extraQuery = option('query', '');
const sceneFile = option('scene-file', '');
const repeats = Number(option('repeats', '3'));
if (!['all', 'matrix', 'release', 'diagnostic', 'loading', 'burn', 'thermal', 'captures', 'smoke', 'interaction', 'qa', 'interface', 'profiles'].includes(suite)) throw new Error(`Unknown suite: ${suite}`);
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error('repeats must be an integer from 1 to 10');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(option('output', `.performance/${stamp}`));
await mkdir(output, { recursive: true });
const vite = path.join(root, 'node_modules/vite/bin/vite.js');
const site = path.join(output, 'site');
if (spawnSync(process.execPath, [vite, 'build', '--outDir', site], { stdio: 'inherit' }).status !== 0) throw new Error('Build failed');
const hash = b => createHash('sha256').update(b).digest('hex');
let diagnosticAsset = null;
if (sceneFile) {
    if (!sceneFile.endsWith('.sog')) throw new Error('scene-file must be a SOG candidate');
    const data = await readFile(sceneFile);
    await copyFile(sceneFile, path.join(site, 'scene', 'diagnostic.sog'));
    diagnosticAsset = { source:sceneFile, bytes:data.length, sha256:hash(data) };
    extraQuery = `scene=./scene/diagnostic.sog&${extraQuery}`;
}
async function files(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    return (await Promise.all(entries.map(e => e.isDirectory() ? files(path.join(dir, e.name)) : path.join(dir, e.name)))).flat();
}
const scene = [];
for (const p of await files('public/scene')) { const b = await readFile(p); scene.push({ path: p.replaceAll('\\', '/'), bytes: b.length, sha256: hash(b) }); }
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const manifest = { createdAt: new Date().toISOString(), suite, repeats, targetFps, extraQuery, diagnosticAsset, commit: git('rev-parse', 'HEAD'), dirty: git('status', '--short'),
    node: process.version, os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model,
    package: JSON.parse(await readFile('package.json', 'utf8')), lockSha256: hash(await readFile('package-lock.json')), scene,
    source: await Promise.all([...(await files('src')), ...(await files('tools/performance')), 'index.html', 'benchmark.html', 'vite.config.js']
        .map(async p => ({ path: p, sha256: hash(await readFile(p)) }))), cases: [] };
let server, browser;
const base = 'http://127.0.0.1:5187/';
async function save() { await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2)); }
try {
    // Never attach to or terminate an existing preview server.
    try { await fetch(base); throw new Error('Port 5187 already occupied; stop your preview or choose a different session'); }
    catch (e) { if (!e.message.includes('fetch failed')) throw e; }
    server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--outDir', site], { stdio: 'pipe', windowsHide: true });
    server.stderr.on('data', b => process.stderr.write(b));
    for (let i = 0; ; i++) {
        try { if ((await fetch(base)).ok) break; } catch { /* waiting for own server */ }
        if (i > 100 || server.exitCode != null) throw new Error('Preview server failed');
        await new Promise(r => setTimeout(r, 100));
    }
    browser = await chromium.launch({ channel: 'chrome', headless: false,
        args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
    manifest.browser = browser.version();
    const bcdp = await browser.newBrowserCDPSession();
    manifest.systemInfo = (await bcdp.send('SystemInfo.getInfo')).gpu;
    await save();
    async function open(viewport, query = '', context) {
        const ownContext = context ?? await browser.newContext({ viewport, deviceScaleFactor: 1 });
        try {
        const page = await ownContext.newPage();
        const cdp = await ownContext.newCDPSession(page);
        await cdp.send('Network.enable');
        const network = [];
        cdp.on('Network.responseReceived', e => network.push({ url: e.response.url, status: e.response.status,
            diskCache: e.response.fromDiskCache ?? false, serviceWorker: e.response.fromServiceWorker ?? false,
            headers: e.response.headers }));
        page.on('pageerror', e => console.error('PAGE:', e.message));
        await page.goto(`${base}benchmark.html?${query}&${extraQuery}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
        await page.bringToFront();
        await page.waitForFunction(() => !!window.__splatBenchmark, null, { timeout: 240000 });
        await page.evaluate(() => window.__splatBenchmark.ready());
        return { page, cdp, context: ownContext, network };
        } catch (error) { await ownContext.close(); throw error; }
    }
    async function record(name, viewport, query, options = {}) {
        console.log(`RUN ${name}`);
        let session;
        try {
            session = await open(viewport, query);
            if (options.gpuTimers === false) await session.page.evaluate(() => { if (window.__aw.device.gpuProfiler) window.__aw.device.gpuProfiler.enabled = false; });
            if (options.userGesture) {
                await session.page.locator('#performance-panel details').evaluate(el => {el.open=false;});
                await session.page.locator('#play').click();
                await session.page.evaluate(() => window.__aw.pause());
            }
            const pending = session.page.evaluate(o => window.__splatBenchmark.run(o), options);
            let audioDuringRun = null;
            if (options.userGesture) {
                await session.page.waitForTimeout(4000);
                audioDuringRun = await session.page.evaluate(() => ({healthy:window.__aw.soundtrack.healthy,
                    audioTime:window.__aw.soundtrack.time,walkTime:window.__aw.t}));
            }
            const result = await pending;
            if (options.userGesture && !audioDuringRun?.healthy) throw new Error('Audio clock did not start after the playback gesture');
            const info = { name, valid: result.valid, backend: result.metadata.backend, summary: result.segments };
            await writeFile(path.join(output, `${name}.json`), JSON.stringify({ ...result, audioDuringRun, network: session.network }, null, 2));
            if (Number.isFinite(options.captureAt)) {
                await session.page.evaluate(t => window.__splatBenchmark.capture(t), options.captureAt);
                await session.page.locator('#canvas').screenshot({path:path.join(output, `${name}.png`)});
            }
            manifest.cases.push(info); console.log(`DONE ${name}: ${result.segments[0]?.renderedFps?.toFixed(1)} rendered fps`);
        } catch (e) { manifest.cases.push({ name, error: String(e) }); console.error(`FAIL ${name}: ${e}`); }
        finally { await session?.context.close(); await save(); }
    }
    const landscape = { width: 1280, height: 720 }, portrait = { width: 390, height: 844 };
    if (suite === 'smoke') await record('smoke', landscape, `fps=${targetFps}&mute`, { seconds: 6 });
    if (suite === 'profiles') {
        await record('auto', landscape, 'mute', { seconds:12, burn:true });
        for (const backend of ['webgpu','webgl']) await record(`audio-${backend}`,landscape,`fps=${targetFps}&${backend === 'webgl' ? 'webgl' : ''}`,{userGesture:true});
        for (const profile of ['balanced','quality']) for (const backend of ['webgpu','webgl']) {
            await record(`${profile}-${backend}`, landscape, `profile=${profile}&fps=${targetFps}&mute&${backend === 'webgl' ? 'webgl' : ''}`, {seconds:6,captureAt:16});
        }
    }
    if (['all', 'matrix', 'release'].includes(suite)) {
        for (const backend of ['webgpu', 'webgl']) for (const fps of (suite === 'release' ? [targetFps] : [30, 60])) for (const orientation of ['landscape', 'portrait']) {
            for (let r = 1; r <= repeats; r++) await record(`${backend}-${fps}-${orientation}-${r}`,
                orientation === 'landscape' ? landscape : portrait, `fps=${fps}&${backend === 'webgl' ? 'webgl&' : ''}mute`);
        }
    }
    if (['all', 'diagnostic'].includes(suite)) {
        for (const backend of ['webgpu', 'webgl']) for (const scale of [1, 0.5]) for (const taps of [10, 6, 4]) {
            for (let r = 1; r <= repeats; r++) await record(`diagnostic-${backend}-${scale}-${taps}-${r}`,
                landscape, `fps=60&scale=${scale}&taps=${taps}&mute&${backend === 'webgl' ? 'webgl' : ''}`, { seconds: 20, startTime: 16 });
        }
    }
    if (['all', 'burn', 'release'].includes(suite)) for (const backend of ['webgpu', 'webgl']) {
        await record(`burn-${backend}`, landscape, `fps=${targetFps}&mute&${backend === 'webgl' ? 'webgl' : ''}`, { seconds: 20, startTime: 16, burn: true });
    }
    if (['all', 'thermal', 'release'].includes(suite)) await record(`thermal-${targetFps}`, landscape, `fps=${targetFps}&mute`, { seconds: 300, exercise: true });
    if (['all', 'loading', 'release'].includes(suite)) {
        for (const throttled of [false, true]) {
            const context = await browser.newContext({ viewport: landscape });
            const page = await context.newPage(), cdp = await context.newCDPSession(page);
            await cdp.send('Network.enable');
            if (throttled) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 1250000, uploadThroughput: 1250000 });
            for (const cache of ['cold', 'warm']) {
                const name = `loading-${throttled ? '10mbps' : 'native'}-${cache}`;
                console.log(`RUN ${name}`);
                try {
                    if (cache === 'cold') await cdp.send('Network.clearBrowserCache');
                    const network = [];
                    const listener = e => network.push({ url: e.response.url, status: e.response.status, diskCache: !!e.response.fromDiskCache, serviceWorker: !!e.response.fromServiceWorker });
                    cdp.on('Network.responseReceived', listener);
                    await page.goto(`${base}benchmark.html?mute&${extraQuery}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
                    await page.bringToFront();
                    await page.waitForFunction(() => !!window.__splatBenchmark);
                    await page.evaluate(() => window.__splatBenchmark.ready());
                    const loading = await page.evaluate(() => window.__splatBenchmark.loading());
                    cdp.off('Network.responseReceived', listener);
                    await writeFile(path.join(output, `${name}.json`), JSON.stringify({ loading, network }, null, 2));
                    manifest.cases.push({ name, readyMs: loading.readyMs, transferBytes: loading.transferBytes });
                } catch (e) { manifest.cases.push({ name, error: String(e) }); }
                await save();
            }
            await context.close();
        }
    }
    if (['all', 'captures', 'release'].includes(suite)) {
        const s = await open(landscape, `fps=${targetFps}&scale=1&mute`);
        try {
            const exitTime = await s.page.evaluate(() => Math.max(0, window.__aw.walk.duration - 3));
            for (const [name, t, effect] of [['start', 0, -1], ['narrow', 8, -1], ['middle', 16, -1], ['turn', 28, -1], ['exit', exitTime, -1], ['burn', 16, 2], ['restore', 16, 6]]) {
                const buffers = [];
                for (let i = 0; i < 2; i++) {
                    await s.page.evaluate(({ t, effect }) => window.__splatBenchmark.capture(t, effect), { t, effect });
                    await s.page.waitForTimeout(500);
                    buffers.push(await s.page.locator('#canvas').screenshot({ path: path.join(output, `${name}-${i}.png`) }));
                }
                manifest.cases.push({ name: `capture-${name}`, t, effect, pngIdentical: buffers[0].equals(buffers[1]) });
            }
            await s.page.evaluate(() => document.body.classList.remove('benchmark-capture'));
            await s.page.screenshot({ path: path.join(output, 'benchmark-ui-desktop.png') });
            await s.page.setViewportSize(portrait);
            await s.page.waitForTimeout(1000);
            await s.page.screenshot({ path: path.join(output, 'benchmark-ui-mobile.png') });
        } finally { await s.context.close(); await save(); }
    }
    if (['qa','interface'].includes(suite)) {
        const context = await browser.newContext({viewport:portrait,hasTouch:true});
        const page = await context.newPage();
        const errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        const assert=(value,message)=>{if(!value)throw new Error(message);};
        try {
            await page.goto(`${base}?mute`);
            await page.waitForFunction(()=>window.__aw?.state==='ready',null,{timeout:60000});
            assert(await page.locator('#pausebtn,#recenter,#quality-status,#paused').count()===0,'Removed controls still exist');
            await page.locator('#play').click(); await page.waitForTimeout(300);
            await page.keyboard.press('Space');
            assert(await page.evaluate(()=>window.__aw.state==='playing'),'Space paused the walk');
            await page.mouse.move(195,400); await page.mouse.down();
            await page.mouse.move(280,440,{steps:12}); await page.mouse.up();
            await page.waitForTimeout(600);
            const held=await page.evaluate(()=>({yaw:window.__aw.cameraLook.yaw,target:window.__aw.cameraLook.targetYaw,returnAt:window.__aw.cameraLook.returnAt}));
            assert(Math.abs(held.yaw)>5,'Drag failed');
            await page.waitForTimeout(1900);
            assert(await page.evaluate(target=>window.__aw.cameraLook.targetYaw===target,held.target),'Recenter started before three seconds');
            await page.waitForTimeout(1000);
            const returning=await page.evaluate(()=>window.__aw.cameraLook.yaw);
            assert(Math.abs(returning)>0.1 && Math.abs(returning)<Math.abs(held.yaw),'Recenter jumped or did not start');
            await page.waitForTimeout(2000);
            assert(await page.evaluate(()=>Math.abs(window.__aw.cameraLook.yaw)<0.2),'Camera did not return to center');
            await page.locator('#mute').click();
            assert(await page.locator('#mute').getAttribute('aria-pressed')==='true','Sound-on state failed');
            await page.waitForFunction(()=>window.__aw.soundtrack.healthy,null,{timeout:30000});
            await page.locator('#mute').click();
            assert(await page.locator('#mute').getAttribute('aria-pressed')==='false','Muted state failed');
            assert(await page.locator('#mute svg').count()===1,'Audio icon was replaced with text');
            const outAndBack=await page.evaluate(()=>{
                const w=window.__aw.walk, p=window.__aw.app.root.findByName('camera').getPosition().clone();
                const q=new (window.__aw.app.root.findByName('camera').getRotation().constructor)();
                const t=w.loopLegDuration*1.5, mapped=w.playbackPose(t);
                const returned=w.samplePlayback(t,p,q);
                return {mapped,returned:{x:p.x,z:p.z,yaw:returned.yaw,facingOffset:returned.facingOffset},loopDuration:w.loopDuration};
            });
            assert(outAndBack.mapped.returning&&outAndBack.returned.facingOffset===180,'Return leg did not reverse the route heading');
            await page.evaluate(()=>window.__aw.seek(window.__aw.walk.loopDuration-0.12));
            await page.waitForTimeout(800);
            const loop=await page.evaluate(()=>({state:window.__aw.state,time:window.__aw.t,overlayHidden:document.getElementById('overlay').inert}));
            assert(loop.state==='playing'&&loop.time<2&&loop.overlayHidden,'Walk did not loop automatically');
            assert(await page.evaluate(()=>{
                Object.defineProperty(document,'hidden',{configurable:true,value:true});
                document.dispatchEvent(new Event('visibilitychange'));
                document.dispatchEvent(new Event('visibilitychange'));
                const suspended=window.__aw.state==='paused';
                delete document.hidden;
                document.dispatchEvent(new Event('visibilitychange'));
                return suspended&&window.__aw.state==='playing';
            }),'Visibility changes did not continue playback automatically');
            for(const [w,h] of [[320,568],[390,844],[844,390],[1280,720]]) {
                await page.setViewportSize({width:w,height:h});await page.waitForTimeout(300);
                const controls=await page.locator('#view-controls').boundingBox();
                assert(controls.x>=0&&controls.x+controls.width<=w+1,'Controls overflow');
                await page.screenshot({path:path.join(output,`interface-${w}x${h}.png`)});
            }
            assert(!errors.length,errors.join(';'));
            manifest.cases.push({name:'out-and-back-loop',valid:true,outAndBack,held,returning,loop,errors});
        } finally {await context.close();await save();}
    }
    // Smoke assertions: idle update callbacks must not turn into rendered samples.
    if (suite === 'smoke') {
        const s = await open(portrait, 'mute');
        try {
            await s.page.evaluate(() => window.__splatBenchmark.capture(16));
            const before = await s.page.evaluate(() => window.__aw.film.timing[2]);
            await s.page.waitForTimeout(300);
            const after = await s.page.evaluate(() => window.__aw.film.timing[2]);
            if (before !== after) throw new Error('Frozen capture advanced noise');
            await s.page.screenshot({ path: path.join(output, 'smoke-mobile.png') });
            manifest.cases.push({ name: 'freeze-smoke', valid: before === after });
        } finally { await s.context.close(); await save(); }
    }
    if (suite === 'interaction') {
        const touchContext = await browser.newContext({ viewport: portrait, deviceScaleFactor: 1, hasTouch: true });
        const s = await open(portrait, 'mute', touchContext);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        try {
            await s.page.locator('#performance-panel details').evaluate(el => { el.open = false; });
            await s.page.locator('#play').click();
            await s.page.waitForTimeout(500);
            await s.page.evaluate(() => window.__aw.pause());
            await s.page.waitForTimeout(500);
            const idle1 = await s.page.evaluate(() => ({ ...window.__splatBenchmark.counters }));
            await s.page.waitForTimeout(500);
            const idle2 = await s.page.evaluate(() => ({ ...window.__splatBenchmark.counters }));
            assert(idle2.updates > idle1.updates && idle2.renders === idle1.renders, 'Idle callbacks counted as renders');
            await s.page.mouse.move(195, 400); await s.page.mouse.down();
            await s.page.mouse.move(280, 440, { steps: 12 }); await s.page.mouse.up();
            await s.page.waitForTimeout(600);
            const drag = await s.page.evaluate(() => ({ yaw: window.__aw.cameraLook.yaw, pitch: window.__aw.cameraLook.pitch,
                targetYaw: window.__aw.cameraLook.targetYaw, targetPitch: window.__aw.cameraLook.targetPitch,
                state: window.__aw.state, inert: document.getElementById('stage').inert,
                hit: document.elementFromPoint(195, 400)?.id,
                burn: window.__aw.burn.active, canvas: [window.__aw.device.width, window.__aw.device.height] }));
            if (!(Math.abs(drag.yaw) > 5 && Math.abs(drag.pitch) > 1 && !drag.burn)) await s.page.screenshot({ path: path.join(output, 'drag-failure.png') });
            assert(Math.abs(drag.yaw) > 5 && Math.abs(drag.pitch) > 1 && !drag.burn, `Drag did not rotate or triggered burn: ${JSON.stringify(drag)}`);
            assert(drag.canvas[1] > drag.canvas[0], 'Portrait canvas still letterboxed');
            await s.page.waitForTimeout(4800);
            assert(await s.page.evaluate(() => Math.abs(window.__aw.cameraLook.yaw) < 0.1), 'Automatic recenter failed');
            await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x:195, y:400, id:1 }] });
            await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x:110, y:350, id:1 }] });
            await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await s.page.waitForTimeout(600);
            assert(await s.page.evaluate(() => Math.abs(window.__aw.cameraLook.yaw) > 5 && !window.__aw.burn.active), 'Touch drag failed');
            await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x:195, y:400, id:1 }] });
            await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x:195, y:400, id:1 }, { x:230, y:400, id:2 }] });
            await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            assert(await s.page.evaluate(() => !window.__aw.burn.active), 'Multitouch triggered burn');
            await s.page.mouse.click(195, 400); await s.page.waitForTimeout(100);
            assert(await s.page.evaluate(() => window.__aw.burn.active), 'Tap did not ignite');
            const burnBefore = await s.page.evaluate(() => ({frames:window.__splatBenchmark.counters.renders,at:performance.now()}));
            await s.page.waitForTimeout(1200);
            const burnAfter = await s.page.evaluate(() => ({frames:window.__splatBenchmark.counters.renders,at:performance.now()}));
            const pausedBurnFps = (burnAfter.frames-burnBefore.frames)*1000/(burnAfter.at-burnBefore.at);
            assert(pausedBurnFps > 37.5, 'Paused burn fell to half cadence at the 50 fps target');
            await s.page.screenshot({ path: path.join(output, 'interaction-portrait.png') });
            await s.page.setViewportSize(landscape); await s.page.waitForTimeout(500);
            await s.page.screenshot({ path: path.join(output, 'interaction-landscape.png') });
            manifest.cases.push({ name: 'interaction', valid: true, drag, idle1, idle2, pausedBurnFps });
        } finally { await s.context.close(); await save(); }
    }
    console.log(`RESULTS ${output}`);
    if (manifest.cases.some(c => c.error || c.valid === false)) process.exitCode = 1;
} finally { await save(); await browser?.close(); server?.kill(); }
