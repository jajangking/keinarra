const https = require("https");
const fs = require("fs");
const path = require("path");

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite";
const DEST = path.join(__dirname, "..", "public", "models", "efficientdet_lite0.tflite");

if (fs.existsSync(DEST)) {
  const stat = fs.statSync(DEST);
  console.log(`[download-yolo] Model already exists (${(stat.size / 1024 / 1024).toFixed(1)}MB), skipping`);
  process.exit(0);
}

console.log(`[download-yolo] Downloading YOLO model from ${MODEL_URL}...`);

const file = fs.createWriteStream(DEST);
https.get(MODEL_URL, (res) => {
  if (res.statusCode !== 200) {
    console.error(`[download-yolo] Failed: HTTP ${res.statusCode}`);
    fs.unlinkSync(DEST);
    process.exit(1);
  }
  const total = parseInt(res.headers["content-length"] || "0", 10);
  let downloaded = 0;
  res.on("data", (chunk) => {
    downloaded += chunk.length;
    if (total) {
      const pct = ((downloaded / total) * 100).toFixed(1);
      process.stdout.write(`\r[download-yolo] ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`);
    }
  });
  res.pipe(file);
  file.on("finish", () => {
    file.close();
    console.log("\n[download-yolo] Done!");
  });
}).on("error", (err) => {
  fs.unlinkSync(DEST);
  console.error(`[download-yolo] Error: ${err.message}`);
  process.exit(1);
});
