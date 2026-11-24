// Tek dosya derleme: src/ + three + stil + insan modelleri → dist/index.html
// (App Store / Capacitor için; internet gerektirmez)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';

const minify = !process.argv.includes('--dev');
const res = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify, target: ['es2020', 'safari15'],
  write: false, legalComments: 'none', logLevel: 'warning',
});
const js = res.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const b64 = (f) => 'data:model/gltf-binary;base64,' + readFileSync(f).toString('base64');
const assets = `window.__ASSETS__=${JSON.stringify({ male: b64('assets/male.glb'), female: b64('assets/female.glb'), nature: b64('assets/nature.glb'), deer: 'data:model/gltf+json;base64,' + readFileSync('assets/deer.gltf').toString('base64') })};`;
// sesler: assets/sfx/*.m4a → window.__AUDIO__ (ad → data URL); oyun bunları ilk dokunuştan sonra sırayla çözer
const sfx = {};
if (existsSync('assets/sfx')) for (const f of readdirSync('assets/sfx')) if (f.endsWith('.m4a')) {
  const key = f.replace('.m4a', '').replace(/^music_(\w)/, (_, c) => 'm' + c.toUpperCase());
  sfx[key] = 'data:audio/mp4;base64,' + readFileSync('assets/sfx/' + f).toString('base64');
}
const audioJs = `window.__AUDIO__=${JSON.stringify(sfx)};`;
let html = readFileSync('index.html', 'utf8');
const css = readFileSync('style.css', 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`);
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*<script type="module" src="src\/main.js"><\/script>/, () => `<script>${assets}</script>\n<script>${audioJs}</script>\n<script>${js}</script>`);
if (html.includes('src/main.js')) { console.error('HATA: betik etiketi değiştirilemedi'); process.exit(1); }
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log('built dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
