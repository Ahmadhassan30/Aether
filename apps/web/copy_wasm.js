const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'pkg/aether_wasm_bg.wasm');
const destDir = path.join(__dirname, 'public');
const dest = path.join(destDir, 'aether_wasm_bg.wasm');

if (!fs.existsSync(src)) {
  console.error('WASM source binary not found at:', src);
  process.exit(1);
}

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(src, dest);
console.log('WASM binary copied successfully to static public path:', dest);
