const fs = require("fs");
const path = require("path");
const https = require("https");

const MODELS = [
  {
    name: "face_detection.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/face_detection.tflite",
  },
  {
    name: "hand_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
  },
  {
    name: "pose_landmarker_lite.task",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  },
  {
    name: "selfie_segmenter.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
  },
];

const destDir = path.join(__dirname, "..", "public", "models");

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    console.log(`  Downloading...`);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      file.close();
      fs.unlinkSync(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  fs.mkdirSync(destDir, { recursive: true });

  for (const model of MODELS) {
    const dest = path.join(destDir, model.name);
    if (fs.existsSync(dest)) {
      console.log(`[SKIP] ${model.name} already exists`);
      continue;
    }
    console.log(`[DOWNLOAD] ${model.name}`);
    console.log(`  From: ${model.url}`);
    try {
      await download(model.url, dest);
      const stats = fs.statSync(dest);
      console.log(`  Done: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      console.error("  The app will use CDN at runtime as fallback.");
    }
  }

  console.log("\nDone! Models are in public/models/");
}

main();
