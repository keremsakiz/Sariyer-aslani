// Tek dosya derleme: src/ + three + stil + insan modelleri → dist/index.html
// (App Store / Capacitor için; internet gerektirmez)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const minify = !process.argv.includes('--dev');
const res = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify, target: ['es2020', 'safari15'],
  write: false, legalComments: 'none', logLevel: 'warning',
});
const js = res.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const b64 = (f) => 'data:model/gltf-binary;base64,' + readFileSync(f).toString('base64');
const assets = `window.__ASSETS__=${JSON.stringify({ male: b64('assets/male.glb'), female: b64('assets/female.glb') })};`;
let html = readFileSync('index.html', 'utf8');
const css = readFileSync('style.css', 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`);
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*<script type="module" src="src\/main.js"><\/script>/, () => `<script>${assets}</script>\n<script>${js}</script>`);
if (html.includes('src/main.js')) { console.error('HATA: betik etiketi değiştirilemedi'); process.exit(1); }
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log('built dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
