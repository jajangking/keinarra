const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const MODELS = [
  {
    url: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite",
    dest: "public/models/efficientdet_lite0.tflite",
    label: "EfficientDet-Lite0",
  },
  {
    url: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/int8/latest/efficientdet_lite2.tflite",
    dest: "public/models/efficientdet_lite2.tflite",
    label: "EfficientDet-Lite2",
  },
  {
    url: "https://huggingface.co/onnx-community/yolov8n/resolve/main/onnx/model.onnx",
    dest: "public/models/yolov8n.onnx",
    label: "YOLOv8n ONNX",
  },
  {
    url: "https://raw.githubusercontent.com/keinarra/yolo-models/refs/heads/main/yolo12n.onnx",
    dest: "public/models/yolo12n.onnx",
    label: "YOLOv12n ONNX",
  },
];

function downloadFile(url, dest, label) {
  return new Promise((resolve, reject) => {
    const absDest = path.join(__dirname, "..", dest);
    if (fs.existsSync(absDest)) {
      const stat = fs.statSync(absDest);
      if (stat.size > 100000) {
        console.log(`[${label}] Already exists (${(stat.size / 1024 / 1024).toFixed(1)}MB), skipping`);
        return resolve();
      }
      console.log(`[${label}] Partial file found, re-downloading...`);
    }

    fs.mkdirSync(path.dirname(absDest), { recursive: true });

    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(absDest);
    file.on("error", (err) => {
      console.error(`[${label}] Write error: ${err.message}`);
      try { fs.unlinkSync(absDest); } catch {}
      resolve(); // don't fail the whole chain
    });

    const doGet = (currentUrl, redirects = 0) => {
      if (redirects > 10) {
        console.error(`[${label}] Too many redirects`);
        file.close();
        try { fs.unlinkSync(absDest); } catch {}
        return resolve();
      }

      const p = currentUrl.startsWith("https") ? https : http;
      p.get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect
          file.write(""); // reset
          console.log(`[${label}] Redirecting to ${res.headers.location}`);
          doGet(res.headers.location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          console.error(`[${label}] Failed: HTTP ${res.statusCode}`);
          file.close();
          try { fs.unlinkSync(absDest); } catch {}
          return resolve();
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let downloaded = 0;
        let lastPct = -1;
        res.on("data", (chunk) => {
          downloaded += chunk.length;
          if (total) {
            const pct = Math.floor((downloaded / total) * 100);
            if (pct !== lastPct && pct % 10 === 0) {
              lastPct = pct;
              process.stdout.write(`\r[${label}] ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`);
            }
          }
        });
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          const stat = fs.statSync(absDest);
          console.log(`\r[${label}] Done (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
          resolve();
        });
      }).on("error", (err) => {
        file.close();
        try { fs.unlinkSync(absDest); } catch {}
        console.error(`[${label}] Error: ${err.message}`);
        resolve();
      });
    };

    doGet(url);
  });
}

async function main() {
  console.log("=== Downloading models ===\n");
  for (const model of MODELS) {
    await downloadFile(model.url, model.dest, model.label);
  }
  console.log("\n=== All done ===");
}

main().catch(console.error);
