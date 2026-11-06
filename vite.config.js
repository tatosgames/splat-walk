import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The dev server would otherwise pick the debug engine (3x the CPU cost); use the release build
// unless PC_DEBUG is set.
const engine = process.env.PC_DEBUG ? 'playcanvas.dbg.mjs' : 'playcanvas.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));

// dev only: POST /__frame?name=foo writes the request body to captures/foo.png (frame grabs)
const frameSink = {
    name: 'frame-sink',
    configureServer(server) {
        server.middlewares.use('/__frame', (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
            const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'frame').replace(/[^\w.-]/g, '_');
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                const dir = path.join(here, 'captures');
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.concat(chunks));
                res.end('ok');
            });
        });
    }
};

export default defineConfig({
    // relative asset paths, so the build works from any folder (GitHub Pages serves it from /splat-walk/)
    base: './',
    plugins: [frameSink],
    resolve: {
        alias: {
            playcanvas: fileURLToPath(new URL(`./node_modules/playcanvas/build/${engine}`, import.meta.url))
        }
    },
    server: { port: 5186, strictPort: true, watch: { ignored: ['**/captures/**'] } },
    preview: { port: 5187, strictPort: true },
    build: {
        target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000,
        rolldownOptions: { input: { main: path.join(here, 'index.html'), benchmark: path.join(here, 'benchmark.html') } }
    }
});
