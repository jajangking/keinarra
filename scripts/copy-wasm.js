const fs = require("fs");
const path = require("path");

function copyDir(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.error(`[${label}] Source not found:`, src);
    return 0;
  }
  fs.mkdirSync(dest, { recursive: true });
  const files = fs.readdirSync(src);
  let copied = 0;
  for (const file of files) {
    if (!file.endsWith(".wasm") && !file.endsWith(".mjs")) continue;
    const srcFile = path.join(src, file);
    const dstFile = path.join(dest, file);
    if (!fs.existsSync(dstFile) || fs.statSync(srcFile).mtimeMs > fs.statSync(dstFile).mtimeMs) {
      fs.copyFileSync(srcFile, dstFile);
      copied++;
    }
  }
  return copied;
}

const mediapipeSrc = path.join(__dirname, "..", "node_modules", "@mediapipe", "tasks-vision", "wasm");
const mediapipeDest = path.join(__dirname, "..", "public", "wasm");
const mpCount = copyDir(mediapipeSrc, mediapipeDest, "mediapipe");
console.log(`[copy-wasm] MediaPipe: ${mpCount} file(s) copied to public/wasm/`);

const onnxSrc = path.join(__dirname, "..", "node_modules", "onnxruntime-web", "dist");
const onnxDest = path.join(__dirname, "..", "public", "ort-wasm");
const onnxCount = copyDir(onnxSrc, onnxDest, "onnx");
console.log(`[copy-wasm] ONNX: ${onnxCount} file(s) copied to public/ort-wasm/`);
