"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { DetectedObject, HandData, PoseData } from "@/lib/vision/types";

const W = 640;
const H = 480;

const MODEL_URLS = {
  face: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/face_detection.tflite",
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  segment: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
};

const LOCAL_MODEL_PATHS = {
  face: "/models/face_detection.tflite",
  hand: "/models/hand_landmarker.task",
  pose: "/models/pose_landmarker_lite.task",
  segment: "/models/selfie_segmenter.tflite",
};

interface UseMediaPipeAdvancedOptions {
  mode: string;
  enabled: boolean;
}

interface FaceResult {
  faces: DetectedObject[];
}

interface HandResult {
  hands: HandData[];
}

interface PoseResult {
  poses: PoseData[];
}

interface SegmentResult {
  segmentation: ImageData | null;
}

export interface MediaPipeAdvancedState {
  faces: DetectedObject[];
  hands: HandData[];
  poses: PoseData[];
  segmentation: ImageData | null;
  isReady: boolean;
  error: string | null;
}

async function fetchModel(modelUrl: string, localPath: string): Promise<Uint8Array> {
  try {
    const local = await fetch(localPath);
    if (local.ok) return new Uint8Array(await local.arrayBuffer());
  } catch {}
  const res = await fetch(modelUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading model`);
  return new Uint8Array(await res.arrayBuffer());
}

export function useMediaPipeAdvanced({
  mode, enabled,
}: UseMediaPipeAdvancedOptions): MediaPipeAdvancedState & {
  detectFrame: (frame: ImageData) => void;
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
} {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [faces, setFaces] = useState<DetectedObject[]>([]);
  const [hands, setHands] = useState<HandData[]>([]);
  const [poses, setPoses] = useState<PoseData[]>([]);
  const [segmentation, setSegmentation] = useState<ImageData | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const faceDetectorRef = useRef<any>(null);
  const handLandmarkerRef = useRef<any>(null);
  const poseLandmarkerRef = useRef<any>(null);
  const segmenterRef = useRef<any>(null);
  const wasmFilesetRef = useRef<any>(null);
  const nextIdRef = useRef(1);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const init = async () => {
      try {
        const { FilesetResolver, FaceDetector, HandLandmarker, PoseLandmarker, ImageSegmenter } =
          await import("@mediapipe/tasks-vision");

        const vision = await FilesetResolver.forVisionTasks("/wasm");
        if (cancelled) return;
        wasmFilesetRef.current = vision;

        const isFace = mode === "face" || mode === "all";
        const isHand = mode === "hand" || mode === "all";
        const isPose = mode === "pose" || mode === "all";
        const isSegment = mode === "segment" || mode === "all";

        if (isFace) {
          try {
            const modelBuf = await fetchModel(MODEL_URLS.face, LOCAL_MODEL_PATHS.face);
            if (cancelled) return;
            faceDetectorRef.current = await FaceDetector.createFromOptions(vision, {
              baseOptions: { modelAssetBuffer: modelBuf },
              minDetectionConfidence: 0.5,
            });
          } catch (e) {
            console.warn("[MPFace] Init failed:", e);
          }
        }

        if (isHand) {
          try {
            const modelBuf = await fetchModel(MODEL_URLS.hand, LOCAL_MODEL_PATHS.hand);
            if (cancelled) return;
            handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetBuffer: modelBuf },
              numHands: 2,
              minHandDetectionConfidence: 0.5,
            });
          } catch (e) {
            console.warn("[MPHand] Init failed:", e);
          }
        }

        if (isPose) {
          try {
            const modelBuf = await fetchModel(MODEL_URLS.pose, LOCAL_MODEL_PATHS.pose);
            if (cancelled) return;
            poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetBuffer: modelBuf },
              numPoses: 1,
              minPoseDetectionConfidence: 0.5,
            });
          } catch (e) {
            console.warn("[MPPose] Init failed:", e);
          }
        }

        if (isSegment) {
          try {
            const modelBuf = await fetchModel(MODEL_URLS.segment, LOCAL_MODEL_PATHS.segment);
            if (cancelled) return;
            segmenterRef.current = await ImageSegmenter.createFromOptions(vision, {
              baseOptions: { modelAssetBuffer: modelBuf },
              outputCategoryMask: true,
              outputConfidenceMasks: false,
            });
          } catch (e) {
            console.warn("[MPSegment] Init failed:", e);
          }
        }

        if (!cancelled) {
          setIsReady(true);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setIsReady(false);
          setError(e instanceof Error ? e.message : "Init failed");
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, [enabled, mode]);

  const detectFrame = useCallback(async (frame: ImageData) => {
    if (!enabled) return;
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(frame, 0, 0);

    const currentMode = modeRef.current;

    if (currentMode === "face" || currentMode === "all") {
      if (faceDetectorRef.current) {
        try {
          const result = faceDetectorRef.current.detect(canvas);
          const dets = (result.detections || []).map((d: any) => {
            const box = d.boundingBox;
            const cat = d.categories?.[0];
            const kps = (d.keypoints || []).map((kp: any) => ({
              x: kp.x * frame.width,
              y: kp.y * frame.height,
              name: kp.label,
            }));
            return {
              id: `face-${nextIdRef.current++}`,
              x: box.originX,
              y: box.originY,
              w: box.width,
              h: box.height,
              label: cat?.categoryName || "Face",
              confidence: cat?.score || 1,
              color: "#00ff88",
              landmarks: kps,
            };
          });
          setFaces(dets);
        } catch (e) {
          console.warn("[MPFace] detect error:", e);
        }
      }
    }

    if (currentMode === "hand" || currentMode === "all") {
      if (handLandmarkerRef.current) {
        try {
          const result = handLandmarkerRef.current.detect(canvas);
          const handList: HandData[] = [];
          if (result.landmarks) {
            for (let h = 0; h < result.landmarks.length; h++) {
              const lm = result.landmarks[h];
              const handedness = result.handedness?.[h]?.[0]?.categoryName || "Unknown";
              const pts = lm.map((p: any) => ({
                x: p.x * frame.width,
                y: p.y * frame.height,
                z: p.z,
              }));
              handList.push({ landmarks: pts, handedness, gestures: [] });
            }
          }
          setHands(handList);
        } catch (e) {
          console.warn("[MPHand] detect error:", e);
        }
      }
    }

    if (currentMode === "pose" || currentMode === "all") {
      if (poseLandmarkerRef.current) {
        try {
          const result = poseLandmarkerRef.current.detect(canvas);
          const poseList: PoseData[] = [];
          if (result.landmarks) {
            for (let p = 0; p < result.landmarks.length; p++) {
              const lm = result.landmarks[p];
              const pts = lm.map((pt: any) => ({
                x: pt.x * frame.width,
                y: pt.y * frame.height,
                z: pt.z,
                visibility: pt.visibility,
              }));
              poseList.push({ landmarks: pts });
            }
          }
          setPoses(poseList);
        } catch (e) {
          console.warn("[MPPose] detect error:", e);
        }
      }
    }

    if (currentMode === "segment" || currentMode === "all") {
      if (segmenterRef.current) {
        try {
          const result = segmenterRef.current.detect(canvas);
          if (result.categoryMask) {
            const mask = result.categoryMask;
            if (mask.hasUint8Array()) {
              const raw = mask.getUint8Array();
              const segData = new Uint8ClampedArray(frame.width * frame.height * 4);
              for (let i = 0; i < raw.length; i++) {
                const val = raw[i];
                if (val > 0) {
                  segData[i * 4] = frame.data[i * 4];
                  segData[i * 4 + 1] = frame.data[i * 4 + 1];
                  segData[i * 4 + 2] = frame.data[i * 4 + 2];
                  segData[i * 4 + 3] = 255;
                } else {
                  segData[i * 4] = 0;
                  segData[i * 4 + 1] = 0;
                  segData[i * 4 + 2] = 0;
                  segData[i * 4 + 3] = 0;
                }
              }
              setSegmentation(new ImageData(segData, frame.width, frame.height));
            }
          } else if (result.confidenceMasks?.length > 0) {
            const mask = result.confidenceMasks[0];
            if (mask.hasFloat32Array()) {
              const raw = mask.getFloat32Array();
              const segData = new Uint8ClampedArray(frame.width * frame.height * 4);
              for (let i = 0; i < raw.length; i++) {
                const val = raw[i] > 0.5 ? 1 : 0;
                if (val > 0) {
                  segData[i * 4] = frame.data[i * 4];
                  segData[i * 4 + 1] = frame.data[i * 4 + 1];
                  segData[i * 4 + 2] = frame.data[i * 4 + 2];
                  segData[i * 4 + 3] = 255;
                } else {
                  segData[i * 4] = 0;
                  segData[i * 4 + 1] = 0;
                  segData[i * 4 + 2] = 0;
                  segData[i * 4 + 3] = 0;
                }
              }
              setSegmentation(new ImageData(segData, frame.width, frame.height));
            }
          }
        } catch (e) {
          console.warn("[MPSegment] detect error:", e);
        }
      }
    }

    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.width = frame.width;
    overlay.height = frame.height;
    const octx = overlay.getContext("2d");
    if (!octx) return;
    octx.clearRect(0, 0, overlay.width, overlay.height);

    if (currentMode === "segment" || currentMode === "all") {
      if (segmentation) {
        octx.drawImage(await createImageBitmap(segmentation), 0, 0);
        return;
      }
    }

    if (currentMode === "face" || currentMode === "all") {
      const dets = faces;
      for (const f of dets) {
        octx.strokeStyle = "#00ff88";
        octx.lineWidth = 3;
        octx.strokeRect(f.x, f.y, f.w, f.h);
        octx.fillStyle = "#00ff88";
        octx.font = "bold 12px monospace";
        octx.fillText("Face", f.x + 4, f.y - 4);

        if (f.landmarks) {
          for (const kp of f.landmarks) {
            octx.fillStyle = "#ffcc00";
            octx.beginPath();
            octx.arc(kp.x, kp.y, 4, 0, Math.PI * 2);
            octx.fill();
          }
        }
      }
    }

    if (currentMode === "hand" || currentMode === "all") {
      const handList = hands;
      const handConns = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [0,9],[9,10],[10,11],[11,12],
        [0,13],[13,14],[14,15],[15,16],
        [0,17],[17,18],[18,19],[19,20],
      ];
      for (const h of handList) {
        for (const [i, j] of handConns) {
          if (h.landmarks[i] && h.landmarks[j]) {
            octx.strokeStyle = "#ff6688";
            octx.lineWidth = 2;
            octx.beginPath();
            octx.moveTo(h.landmarks[i].x, h.landmarks[i].y);
            octx.lineTo(h.landmarks[j].x, h.landmarks[j].y);
            octx.stroke();
          }
        }
        for (const pt of h.landmarks) {
          octx.fillStyle = "#ff3366";
          octx.beginPath();
          octx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          octx.fill();
        }
        if (h.landmarks.length > 0) {
          const first = h.landmarks[0];
          octx.fillStyle = "#ff6688";
          octx.font = "bold 11px monospace";
          octx.fillText(h.handedness, first.x, first.y - 10);
        }
      }
    }

    if (currentMode === "pose" || currentMode === "all") {
      const poseList = poses;
      const poseConns = [
        [0,1],[1,2],[2,3],[3,7],
        [0,4],[4,5],[5,6],[6,8],
        [9,10],[11,12],[11,23],[12,24],[23,24],
        [23,25],[25,27],[27,29],[29,31],
        [24,26],[26,28],[28,30],[30,32],
        [11,13],[13,15],[15,17],[15,19],[17,19],
        [12,14],[14,16],[16,18],[16,20],[18,20],
      ];
      for (const p of poseList) {
        for (const [i, j] of poseConns) {
          if (p.landmarks[i] && p.landmarks[j]) {
            octx.strokeStyle = "#66ffcc";
            octx.lineWidth = 2;
            octx.beginPath();
            octx.moveTo(p.landmarks[i].x, p.landmarks[i].y);
            octx.lineTo(p.landmarks[j].x, p.landmarks[j].y);
            octx.stroke();
          }
        }
        for (const pt of p.landmarks) {
          const alpha = pt.visibility !== undefined ? pt.visibility : 1;
          octx.fillStyle = `rgba(102, 255, 204, ${alpha})`;
          octx.beginPath();
          octx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
          octx.fill();
        }
      }
    }
  }, [enabled, faces, hands, poses, segmentation]);

  return {
    faces, hands, poses, segmentation,
    isReady, error,
    detectFrame, overlayRef,
  };
}
