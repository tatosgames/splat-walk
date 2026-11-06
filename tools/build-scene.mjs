import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const count = Number(option('count', '500000'));
const harmonics = Number(option('harmonics', '0'));
const name = option('name', 'mobile');
const gpu = option('gpu', 'cpu');
const reuse = option('reuse-ply', '');
if (gpu !== 'cpu' && !/^\d+$/.test(gpu)) throw new Error('gpu must be cpu or an adapter index');
if (reuse && !reuse.endsWith('.ply')) throw new Error('reuse-ply must name a PLY intermediate');
if (!Number.isInteger(count) || count < 1000 || count > 4999591) throw new Error('count must be an integer between 1000 and 4999591');
if (!Number.isInteger(harmonics) || harmonics < 0 || harmonics > 3) throw new Error('harmonics must be 0..3');
if (!/^[a-z0-9-]+$/.test(name)) throw new Error('name must contain lowercase letters, numbers or hyphens');
const source = option('source', 'public/scene/lod-meta.json');
const work = path.join('.performance', 'scene-work');
await mkdir(work, { recursive: true });
const ply = reuse || path.join(work, `${name}-${count}-source-sh.ply`);
const output = path.join(work, `${name}-v1.sog`);
const cli = path.join(root, 'node_modules/@playcanvas/splat-transform/bin/cli.mjs');
async function run(args) {
    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cli, ...args], { stdio: 'inherit', windowsHide: true });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`splat-transform exited ${code}`)));
    });
}
const decimate = ['--no-tty', source, '--filter-nan', '--decimate', String(count), ply];
const encode = ['--no-tty', '--gpu', gpu, ply, '--filter-harmonics', String(harmonics), output];
// Deliberately no overwrite flag: an existing candidate is not silently replaced.
if (!reuse) await run(decimate);
await run(encode);
const info = JSON.parse((await promisify(execFile)(process.execPath, [cli, '--quiet', output, '--info', 'json', 'null'])).stdout);
if (info.numGaussians !== count || info.shBands !== harmonics) throw new Error('Output metadata does not match the requested candidate');
const bytes = await readFile(output);
const version = JSON.parse(await readFile('node_modules/@playcanvas/splat-transform/package.json')).version;
const recipe = { name, source, sourceIsLossy: source.endsWith('.json') || source.endsWith('.sog') ? true : null,
    sourceManifestSha256: createHash('sha256').update(await readFile(source)).digest('hex'),
    tool: `@playcanvas/splat-transform@${version}`, commands: [decimate, encode],
    reusedIntermediate: reuse ? { path: reuse, sha256: createHash('sha256').update(await readFile(reuse)).digest('hex') } : null,
    gaussians: count, harmonics, output, bytes: (await stat(output)).size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    attribution: 'Artillery Passage by David Fletcher, CC BY 4.0',
    sourceUrl: 'https://superspl.at/scene/f4897475',
    changes: 'Decoded source, removed invalid entries, merge-decimated with source harmonics, then reduced harmonic bands and recompressed. Original PLY information is not recovered from SOG.' };
await writeFile(path.join(work, `${name}-recipe.json`), JSON.stringify(recipe, null, 2));
console.log(JSON.stringify(recipe, null, 2));
