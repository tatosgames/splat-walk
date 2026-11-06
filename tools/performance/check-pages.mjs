import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base = new URL(option('url', 'https://tatosgames.github.io/splat-walk/'));
const output = path.resolve(option('output', '.performance/pages-check'));
await mkdir(output, { recursive:true });
const result = { url:base.href, at:new Date().toISOString(), errors:[], requests:[], cache:[] };
const browser = await chromium.launch({ channel:'chrome', headless:false });
try {
    const context = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true });
    const page = await context.newPage();
    page.on('pageerror', e => result.errors.push(e.message));
    page.on('response', r => {
        if (r.url().startsWith(base.href)) result.requests.push({ url:r.url(), status:r.status() });
    });
    const initialStarted = performance.now();
    await page.goto(new URL('?mute', base).href, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__aw?.state === 'ready', null, {timeout:60000});
    if (await page.locator('#pausebtn,#recenter,#quality-status,#paused').count()) throw new Error('Removed UI controls remain published');
    result.initialDemoReadyMs = performance.now() - initialStarted;
    await page.locator('#play').click(); await page.waitForTimeout(1000);
    await page.evaluate(()=>window.__aw.pause());
    await page.mouse.move(195,400); await page.mouse.down();
    await page.mouse.move(270,440,{steps:10}); await page.mouse.up(); await page.waitForTimeout(600);
    result.runtime = await page.evaluate(() => ({
        state:window.__aw.state, profile:window.__aw.config.profile, targetFps:window.__aw.config.fps,
        canvas:[window.__aw.device.width,window.__aw.device.height], backend:window.__aw.device.deviceType,
        yaw:window.__aw.cameraLook.yaw, burn:window.__aw.burn.active
    }));
    if (result.runtime.targetFps !== 50 || result.runtime.profile !== 'performance' || result.runtime.canvas[1] <= result.runtime.canvas[0] ||
        Math.abs(result.runtime.yaw) < 5 || result.runtime.burn) throw new Error('Published app failed portrait/drag verification');
    await page.screenshot({path:path.join(output,'pages-portrait.png')});
    await page.setViewportSize({width:844,height:390}); await page.waitForTimeout(300);
    await page.screenshot({path:path.join(output,'pages-landscape.png')});
    await page.evaluate(() => {
        window.__pagesFrames=0;
        window.__pagesFrameObserver=()=>window.__pagesFrames++;
        window.__aw.app.on('postrender',window.__pagesFrameObserver);
    });
    await page.locator('#canvas').click({position:{x:400,y:150}});
    const beforeBurn=await page.evaluate(()=>({frames:window.__pagesFrames,at:performance.now()}));
    await page.waitForTimeout(1200);
    const afterBurn=await page.evaluate(()=>({frames:window.__pagesFrames,at:performance.now()}));
    result.pausedBurnFps=(afterBurn.frames-beforeBurn.frames)*1000/(afterBurn.at-beforeBurn.at);
    await page.evaluate(()=>window.__aw.app.off('postrender',window.__pagesFrameObserver));
    if (result.pausedBurnFps < 37.5) throw new Error('Published paused burn has half-rate cadence');
    // Exercise production audio paths after the visual-only first frame.
    await page.locator('#mute').click(); await page.evaluate(()=>window.__aw.play());
    await page.waitForFunction(() => window.__aw.soundtrack.ready && window.__aw.soundtrack.healthy, null, {timeout:60000});
    await page.evaluate(()=>window.__aw.seek(window.__aw.walk.loopDuration-0.12));
    await page.waitForTimeout(800);
    result.loop = await page.evaluate(()=>({state:window.__aw.state,time:window.__aw.t,audioHealthy:window.__aw.soundtrack.healthy}));
    if (result.loop.state!=='playing'||result.loop.time>=2||!result.loop.audioHealthy) throw new Error('Published audio/video did not loop');
    await page.evaluate(()=>window.__aw.pause());
    result.audioReady = await page.evaluate(() => window.__aw.soundtrack.ready);
    result.withAudio = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource').map(r => ({url:r.name,transferBytes:r.transferSize,encodedBytes:r.encodedBodySize}));
        const nav = performance.getEntriesByType('navigation')[0];
        return {resources,transferBytes:resources.reduce((n,r)=>n+r.transferBytes,nav?.transferSize ?? 0),
            note:'After all scene and audio assets loaded; playback itself was not held for a full route.'};
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable'); await cdp.send('Network.clearBrowserCache');
    result.coldNote = 'Cold HTTP cache at 10 Mbit/s and 100 ms; GPU process and shader caches may already be warm from the initial demo check.';
    cdp.on('Network.responseReceived', e => {
        if (e.response.url.startsWith(base.href)) result.cache.push({url:e.response.url,status:e.response.status,
            diskCache:!!e.response.fromDiskCache, headers:e.response.headers});
    });
    await cdp.send('Network.emulateNetworkConditions', {offline:false,latency:100,downloadThroughput:1250000,uploadThroughput:1250000});
    for (const cache of ['cold','warm']) {
        const url = new URL('benchmark.html?fps=50&mute',base);
        await page.goto(url.href,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(() => !!window.__splatBenchmark);
        await page.evaluate(() => window.__splatBenchmark.ready());
        result[cache] = await page.evaluate(() => window.__splatBenchmark.loading());
    }
    result.benchmark = await page.evaluate(() => window.__splatBenchmark.run({seconds:6}));
    if (!result.benchmark.valid || result.errors.length || result.requests.some(r => r.status >= 400)) throw new Error('Published app reported runtime or resource errors');
    if (result.requests.some(r => /scene\/lod-meta\.json/.test(r.url))) throw new Error('Default profile downloaded the original scene');
    result.valid = true;
    console.log(JSON.stringify({valid:true,runtime:result.runtime,audioReady:result.audioReady,
        coldReadyMs:result.cold.readyMs,coldBytes:result.cold.transferBeforeReadyBytes,warmReadyMs:result.warm.readyMs}));
} catch (error) {
    result.valid = false; result.errors.push(String(error)); process.exitCode = 1;
    console.error(error);
} finally {
    await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));
    await browser.close();
}
