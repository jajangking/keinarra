const fs = require("fs");
const path = require("path");

const WASM_SRC = path.join(__dirname, "..", "node_modules", "@mediapipe", "tasks-vision", "wasm");
const WASM_DEST = path.join(__dirname, "..", "public", "wasm");

fs.mkdirSync(WASM_DEST, { recursive: true });

if (!fs.existsSync(WASM_SRC)) {
  console.error("[copy-wasm] Source not found:", WASM_SRC);
  process.exit(0);
}

const files = fs.readdirSync(WASM_SRC);
let copied = 0;

for (const file of files) {
  const srcFile = path.join(WASM_SRC, file);
  const dstFile = path.join(WASM_DEST, file);
  if (!fs.existsSync(dstFile) || fs.statSync(srcFile).mtimeMs > fs.statSync(dstFile).mtimeMs) {
    fs.copyFileSync(srcFile, dstFile);
    copied++;
  }
}

console.log(`[copy-wasm] ${copied} file(s) copied to public/wasm/`);
