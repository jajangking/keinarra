"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type DetectionMode = "color" | "motion" | "object" | "custom" | "all";
type RobotMode = "follow" | "interact" | "play";

interface DetectedObject {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color?: string;
  similarity?: number;
}

interface RobotState {
  x: number;
  y: number;
  angle: number;
  speed: number;
  targetX: number;
  targetY: number;
  state: "idle" | "moving" | "interacting" | "playing";
  battery: number;
}

interface PlayTarget {
  x: number;
  y: number;
  radius: number;
  color: string;
  active: boolean;
}

interface CustomProfile {
  id: string;
  name: string;
  avgH: number;
  avgS: number;
  avgV: number;
  hRange: number;
  sRange: number;
  vRange: number;
  aspectRatio: number;
  compactness: number;
  dominantColors: [number, number, number][];
  thumbnail: string;
  createdAt: number;
}

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  active: boolean;
}

export default function VisionPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  const W = 640;
  const H = 480;

  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<DetectionMode>("all");
  const [robotMode, setRobotMode] = useState<RobotMode>("follow");
  const [fps, setFps] = useState(0);
  const [objects, setObjects] = useState<DetectedObject[]>([]);
  const [robot, setRobot] = useState<RobotState>({
    x: W / 2,
    y: H / 2,
    angle: 0,
    speed: 0,
    targetX: W / 2,
    targetY: H / 2,
    state: "idle",
    battery: 100,
  });
  const [playTargets, setPlayTargets] = useState<PlayTarget[]>([]);
  const [score, setScore] = useState(0);
  const [interactionLog, setInteractionLog] = useState<string[]>([]);

  const [targetColor, setTargetColor] = useState("red");
  const [colorThreshold, setColorThreshold] = useState(100);
  const [motionThreshold, setMotionThreshold] = useState(30);
  const [minMotionArea, setMinMotionArea] = useState(500);

  const [customProfiles, setCustomProfiles] = useState<CustomProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [customThreshold, setCustomThreshold] = useState(60);
  const [selection, setSelection] = useState<SelectionBox>({ startX: 0, startY: 0, endX: 0, endY: 0, active: false });
  const [isSelecting, setIsSelecting] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [capturedData, setCapturedData] = useState<CustomProfile | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: W, height: H, facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      streamRef.current = stream;
      setIsRunning(true);
    } catch (err) {
      console.error("Camera error:", err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setIsRunning(false);
    setFps(0);
    setObjects([]);
    prevFrameRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const rgbToHsv = (r: number, g: number, b: number): [number, number, number] => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max !== min) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h * 360, s * 100, v * 100];
  };

  const isInColorRange = (r: number, g: number, b: number): boolean => {
    const [h, s, v] = rgbToHsv(r, g, b);
    const ranges: Record<string, [number, number, number, number, number, number]> = {
      red:    [0, 15, 50, 100, 50, 100],
      green:  [60, 170, 30, 100, 30, 100],
      blue:   [180, 270, 30, 100, 30, 100],
      yellow: [25, 60, 50, 100, 50, 100],
      orange: [15, 35, 50, 100, 50, 100],
    };
    const [hMin, hMax, sMin, sMax, vMin, vMax] = ranges[targetColor] || [0, 360, 0, 100, 0, 100];
    const hInRange = h >= hMin && h <= hMax;
    return hInRange && s >= sMin && s <= sMax && v >= vMin && v <= vMax;
  };

  const isInCustomRange = (r: number, g: number, b: number, profile: CustomProfile): boolean => {
    const [h, s, v] = rgbToHsv(r, g, b);
    const hDiff = Math.abs(h - profile.avgH);
    const hCheck = hDiff <= profile.hRange || (360 - hDiff) <= profile.hRange;
    const sCheck = Math.abs(s - profile.avgS) <= profile.sRange;
    const vCheck = Math.abs(v - profile.avgV) <= profile.vRange;
    return hCheck && sCheck && vCheck;
  };

  const colorSimilarity = (r: number, g: number, b: number, profile: CustomProfile): number => {
    const [h, s, v] = rgbToHsv(r, g, b);
    let hDiff = Math.abs(h - profile.avgH);
    if (hDiff > 180) hDiff = 360 - hDiff;
    const sDiff = Math.abs(s - profile.avgS);
    const vDiff = Math.abs(v - profile.avgV);
    const maxH = profile.hRange * 2 || 1;
    const maxS = profile.sRange * 2 || 1;
    const maxV = profile.vRange * 2 || 1;
    const hScore = Math.max(0, 1 - hDiff / maxH);
    const sScore = Math.max(0, 1 - sDiff / maxS);
    const vScore = Math.max(0, 1 - vDiff / maxV);
    return (hScore * 0.5 + sScore * 0.3 + vScore * 0.2) * 100;
  };

  const findContours = (mask: Uint8Array, w: number, h: number, minArea: number): { x: number; y: number; w: number; h: number; area: number; perimeter: number }[] => {
    const visited = new Uint8Array(w * h);
    const regions: { x: number; y: number; w: number; h: number; area: number; perimeter: number }[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx] === 0 || visited[idx]) continue;

        let minX = x, minY = y, maxX = x, maxY = y;
        let area = 0;
        let perimeter = 0;
        const stack = [idx];
        visited[idx] = 1;

        while (stack.length > 0) {
          const cur = stack.pop()!;
          const cx = cur % w;
          const cy = Math.floor(cur / w);
          area++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          const neighbors = [
            cy > 0 ? cur - w : -1,
            cy < h - 1 ? cur + w : -1,
            cx > 0 ? cur - 1 : -1,
            cx < w - 1 ? cur + 1 : -1,
          ];

          let edgeCount = 0;
          for (const n of neighbors) {
            if (n < 0 || mask[n] === 0) {
              edgeCount++;
            } else if (!visited[n]) {
              visited[n] = 1;
              stack.push(n);
            }
          }
          perimeter += edgeCount;
        }

        if (area >= minArea) {
          regions.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY, area, perimeter });
        }
      }
    }
    return regions;
  };

  const extractProfileFromRegion = useCallback((x: number, y: number, w: number, h: number): CustomProfile | null => {
    if (!canvasRef.current || !videoRef.current) return null;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(videoRef.current, 0, 0, W, H);
    const frame = ctx.getImageData(x, y, w, h);
    const data = frame.data;

    let totalH = 0, totalS = 0, totalV = 0;
    let minH = 360, maxH = 0, minS = 100, maxS = 0, minV = 100, maxV = 0;
    const colorBins: Map<string, number> = new Map();
    let pixelCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const [h, s, v] = rgbToHsv(r, g, b);
      if (s < 10 || v < 10) continue;

      totalH += h; totalS += s; totalV += v;
      if (h < minH) minH = h; if (h > maxH) maxH = h;
      if (s < minS) minS = s; if (s > maxS) maxS = s;
      if (v < minV) minV = v; if (v > maxV) maxV = v;

      const binKey = `${Math.round(h / 10) * 10},${Math.round(s / 10) * 10},${Math.round(v / 10) * 10}`;
      colorBins.set(binKey, (colorBins.get(binKey) || 0) + 1);
      pixelCount++;
    }

    if (pixelCount < 10) return null;

    const sortedBins = Array.from(colorBins.entries()).sort((a, b) => b[1] - a[1]);
    const dominantColors = sortedBins.slice(0, 5).map(([key]) => {
      const [h, s, v] = key.split(",").map(Number);
      return [h, s, v] as [number, number, number];
    });

    const avgH = totalH / pixelCount;
    const avgS = totalS / pixelCount;
    const avgV = totalV / pixelCount;

    const aspectRatio = w / h;
    const compactness = (4 * Math.PI * pixelCount) / ((2 * (w + h)) ** 2);

    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = 64;
    thumbCanvas.height = 48;
    const thumbCtx = thumbCanvas.getContext("2d")!;
    thumbCtx.drawImage(canvas, x, y, w, h, 0, 0, 64, 48);
    const thumbnail = thumbCanvas.toDataURL("image/jpeg", 0.5);

    return {
      id: Date.now().toString(),
      name: "",
      avgH, avgS, avgV,
      hRange: (maxH - minH) / 2 + 15,
      sRange: (maxS - minS) / 2 + 15,
      vRange: (maxV - minV) / 2 + 15,
      aspectRatio,
      compactness,
      dominantColors,
      thumbnail,
      createdAt: Date.now(),
    };
  }, []);

  const updateRobot = useCallback((detected: DetectedObject[], currentRobot: RobotState): RobotState => {
    let next = { ...currentRobot };
    const maxSpeed = 5;
    const deadZone = 30;

    if (robotMode === "follow") {
      if (detected.length > 0) {
        const target = detected[0];
        const tx = target.x + target.w / 2;
        const ty = target.y + target.h / 2;
        const dx = tx - next.x;
        const dy = ty - next.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > deadZone) {
          next.targetX = tx;
          next.targetY = ty;
          next.angle = Math.atan2(dy, dx);
          next.speed = Math.min(maxSpeed, dist * 0.05);
          next.state = "moving";
        } else {
          next.speed = 0;
          next.state = "interacting";
        }
      } else {
        next.speed = 0;
        next.state = "idle";
      }
    } else if (robotMode === "interact") {
      if (detected.length > 0) {
        const target = detected[0];
        const tx = target.x + target.w / 2;
        const ty = target.y + target.h / 2;
        const dx = tx - next.x;
        const dy = ty - next.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > deadZone * 2) {
          next.angle = Math.atan2(dy, dx);
          next.speed = Math.min(maxSpeed * 0.8, dist * 0.04);
          next.state = "moving";
        } else if (dist > deadZone) {
          next.speed = 0;
          next.state = "interacting";
          const obj = detected[0];
          const msg = `Mendeteksi: ${obj.label}${obj.similarity !== undefined ? ` (${Math.round(obj.similarity)}%)` : ""} di (${Math.round(tx)}, ${Math.round(ty)})`;
          setInteractionLog(prev => [msg, ...prev].slice(0, 10));
        } else {
          next.speed = 0;
          next.state = "interacting";
        }
      } else {
        next.speed = 0;
        next.state = "idle";
      }
    } else if (robotMode === "play") {
      const activeTarget = playTargets.find(t => t.active);
      if (activeTarget) {
        const dx = activeTarget.x - next.x;
        const dy = activeTarget.y - next.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < activeTarget.radius + 20) {
          activeTarget.active = false;
          setScore(prev => prev + 100);
          setInteractionLog(prev => ["Target tercapai! +100", ...prev].slice(0, 10));
          setPlayTargets(prev => prev.map(t => t === activeTarget ? { ...t, active: false } : t));
          next.state = "playing";
        } else {
          next.angle = Math.atan2(dy, dx);
          next.speed = Math.min(maxSpeed, dist * 0.06);
          next.state = "moving";
        }
      } else {
        next.speed = 0;
        next.state = "idle";
      }
    }

    next.x += Math.cos(next.angle) * next.speed;
    next.y += Math.sin(next.angle) * next.speed;
    next.x = Math.max(20, Math.min(W - 20, next.x));
    next.y = Math.max(20, Math.min(H - 20, next.y));
    next.battery = Math.max(0, next.battery - 0.01);

    return next;
  }, [robotMode, playTargets]);

  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !overlayRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const octx = overlay.getContext("2d");
    if (!ctx || !octx) return;

    const startTime = performance.now();

    canvas.width = W;
    canvas.height = H;

    const displayW = video.clientWidth;
    const displayH = video.clientHeight;
    overlay.width = displayW;
    overlay.height = displayH;

    const scaleX = displayW / W;
    const scaleY = displayH / H;

    ctx.drawImage(video, 0, 0, W, H);
    octx.clearRect(0, 0, displayW, displayH);

    const frame = ctx.getImageData(0, 0, W, H);
    const detected: DetectedObject[] = [];

    if (mode === "color" || mode === "all") {
      const mask = new Uint8Array(W * H);
      for (let i = 0; i < frame.data.length; i += 4) {
        const r = frame.data[i];
        const g = frame.data[i + 1];
        const b = frame.data[i + 2];
        if (isInColorRange(r, g, b)) {
          mask[i / 4] = 255;
        }
      }
      const regions = findContours(mask, W, H, colorThreshold);
      for (const r of regions) {
        detected.push({ ...r, label: `Color: ${targetColor}`, color: targetColor });
      }
    }

    if (mode === "motion" || mode === "all") {
      const current = frame.data;
      if (prevFrameRef.current) {
        const mask = new Uint8Array(W * H);
        const prev = prevFrameRef.current.data;
        for (let i = 0; i < current.length; i += 4) {
          const dr = Math.abs(current[i] - prev[i]);
          const dg = Math.abs(current[i + 1] - prev[i + 1]);
          const db = Math.abs(current[i + 2] - prev[i + 2]);
          if ((dr + dg + db) / 3 > motionThreshold) {
            mask[i / 4] = 255;
          }
        }
        const regions = findContours(mask, W, H, minMotionArea);
        for (const r of regions) {
          detected.push({ ...r, label: "Motion" });
        }
      }
      prevFrameRef.current = ctx.getImageData(0, 0, W, H);
    }

    if (mode === "object" || mode === "all") {
      const gray = new Uint8Array(W * H);
      for (let i = 0; i < frame.data.length; i += 4) {
        gray[i / 4] = Math.round(0.299 * frame.data[i] + 0.587 * frame.data[i + 1] + 0.114 * frame.data[i + 2]);
      }
      const edgeMask = new Uint8Array(W * H);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const idx = y * W + x;
          const gx = -gray[idx - W - 1] + gray[idx - W + 1] - 2 * gray[idx - 1] + 2 * gray[idx + 1] - gray[idx + W - 1] + gray[idx + W + 1];
          const gy = -gray[idx - W - 1] - 2 * gray[idx - W] - gray[idx - W + 1] + gray[idx + W - 1] + 2 * gray[idx + W] + gray[idx + W + 1];
          const mag = Math.sqrt(gx * gx + gy * gy);
          if (mag > 80) edgeMask[idx] = 255;
        }
      }
      const regions = findContours(edgeMask, W, H, 1000);
      for (const r of regions) {
        detected.push({ ...r, label: "Object" });
      }
    }

    if (mode === "custom" && activeProfileId) {
      const profile = customProfiles.find(p => p.id === activeProfileId);
      if (profile) {
        const mask = new Uint8Array(W * H);
        for (let i = 0; i < frame.data.length; i += 4) {
          const r = frame.data[i];
          const g = frame.data[i + 1];
          const b = frame.data[i + 2];
          if (isInCustomRange(r, g, b, profile)) {
            mask[i / 4] = 255;
          }
        }
        const regions = findContours(mask, W, H, 50);
        for (const r of regions) {
          const sim = colorSimilarity(
            frame.data[(r.y * W + r.x) * 4],
            frame.data[(r.y * W + r.x) * 4 + 1],
            frame.data[(r.y * W + r.x) * 4 + 2],
            profile
          );
          if (sim >= (100 - customThreshold)) {
            detected.push({ ...r, label: `${profile.name}`, color: "custom", similarity: sim });
          }
        }
      }
    }

    const colorMap: Record<string, string> = {
      red: "#ff0000",
      green: "#00ff00",
      blue: "#0000ff",
      yellow: "#ffff00",
      orange: "#ff8800",
      custom: "#ff00ff",
    };

    for (const obj of detected) {
      const c = obj.color ? colorMap[obj.color] || "#00ff00" : "#00ff00";
      const ox = obj.x * scaleX;
      const oy = obj.y * scaleY;
      const ow = obj.w * scaleX;
      const oh = obj.h * scaleY;
      octx.strokeStyle = c;
      octx.lineWidth = 2;
      octx.strokeRect(ox, oy, ow, oh);

      octx.fillStyle = c;
      octx.font = "14px monospace";
      octx.fillText(obj.label, ox, oy - 5);
      const extraText = obj.similarity !== undefined ? `${Math.round(obj.similarity)}%` : `${obj.w}x${obj.h}`;
      octx.fillText(extraText, ox, oy + oh + 14);

      const cx = ox + ow / 2;
      const cy = oy + oh / 2;
      octx.beginPath();
      octx.arc(cx, cy, 4, 0, Math.PI * 2);
      octx.fillStyle = c;
      octx.fill();
    }

    if (selection.active) {
      const sx = Math.min(selection.startX, selection.endX) * scaleX;
      const sy = Math.min(selection.startY, selection.endY) * scaleY;
      const sw = Math.abs(selection.endX - selection.startX) * scaleX;
      const sh = Math.abs(selection.endY - selection.startY) * scaleY;

      octx.strokeStyle = "#ffff00";
      octx.lineWidth = 2;
      octx.setLineDash([6, 3]);
      octx.strokeRect(sx, sy, sw, sh);
      octx.setLineDash([]);

      octx.fillStyle = "#ffff00cc";
      octx.font = "12px monospace";
      octx.fillText(`Seleksi: ${Math.round(sw)}x${Math.round(sh)}`, sx, sy - 8);
    }

    const updatedRobot = updateRobot(detected, robot);
    setRobot(updatedRobot);

    const rx = updatedRobot.x * scaleX;
    const ry = updatedRobot.y * scaleY;
    const rSize = 20 * scaleX;

    octx.save();
    octx.translate(rx, ry);
    octx.rotate(updatedRobot.angle);

    octx.fillStyle = "#00aaff";
    octx.beginPath();
    octx.moveTo(rSize, 0);
    octx.lineTo(-rSize * 0.7, -rSize * 0.6);
    octx.lineTo(-rSize * 0.4, 0);
    octx.lineTo(-rSize * 0.7, rSize * 0.6);
    octx.closePath();
    octx.fill();
    octx.strokeStyle = "#0088dd";
    octx.lineWidth = 2;
    octx.stroke();

    octx.fillStyle = "#ffffff";
    octx.beginPath();
    octx.arc(rSize * 0.3, -rSize * 0.2, 3, 0, Math.PI * 2);
    octx.arc(rSize * 0.3, rSize * 0.2, 3, 0, Math.PI * 2);
    octx.fill();

    octx.restore();

    if (updatedRobot.state === "moving") {
      octx.strokeStyle = "#00aaff44";
      octx.lineWidth = 1;
      octx.setLineDash([4, 4]);
      octx.beginPath();
      octx.moveTo(rx, ry);
      octx.lineTo(updatedRobot.targetX * scaleX, updatedRobot.targetY * scaleY);
      octx.stroke();
      octx.setLineDash([]);
    }

    if (robotMode === "play") {
      for (const target of playTargets) {
        if (target.active) {
          octx.strokeStyle = target.color;
          octx.lineWidth = 3;
          octx.beginPath();
          octx.arc(target.x * scaleX, target.y * scaleY, target.radius * scaleX, 0, Math.PI * 2);
          octx.stroke();

          octx.fillStyle = target.color + "33";
          octx.fill();

          octx.fillStyle = target.color;
          octx.font = "bold 16px monospace";
          octx.textAlign = "center";
          octx.fillText("TARGET", target.x * scaleX, target.y * scaleY + 5);
          octx.textAlign = "left";
        }
      }
    }

    const elapsed = performance.now() - startTime;
    setFps(Math.round(1000 / Math.max(elapsed, 1)));
    setObjects(detected);

    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [mode, targetColor, colorThreshold, motionThreshold, minMotionArea, robotMode, playTargets, updateRobot, robot, customProfiles, activeProfileId, customThreshold, selection]);

  useEffect(() => {
    if (isRunning) {
      animFrameRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isRunning, processFrame]);

  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>, rect: DOMRect) => {
    const touch = e.touches[0];
    return {
      x: ((touch.clientX - rect.left) / rect.width) * W,
      y: ((touch.clientY - rect.top) / rect.height) * H,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== "custom") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    setSelection({ startX: x, startY: y, endX: x, endY: y, active: true });
    setIsSelecting(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    setSelection(prev => ({ ...prev, endX: x, endY: y }));
  };

  const handleMouseUp = () => {
    if (!isSelecting) return;
    setIsSelecting(false);
    finalizeSelection();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (mode !== "custom") return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = getTouchPos(e, rect);
    setSelection({ startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y, active: true });
    setIsSelecting(true);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isSelecting) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = getTouchPos(e, rect);
    setSelection(prev => ({ ...prev, endX: pos.x, endY: pos.y }));
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isSelecting) return;
    setIsSelecting(false);
    finalizeSelection();
  };

  const finalizeSelection = () => {
    const x = Math.max(0, Math.round(Math.min(selection.startX, selection.endX)));
    const y = Math.max(0, Math.round(Math.min(selection.startY, selection.endY)));
    const w = Math.min(W - x, Math.abs(Math.round(selection.endX - selection.startX)));
    const h = Math.min(H - y, Math.abs(Math.round(selection.endY - selection.startY)));

    if (w < 10 || h < 10) {
      setSelection(prev => ({ ...prev, active: false }));
      return;
    }

    const profile = extractProfileFromRegion(x, y, w, h);
    if (profile) {
      setCapturedData(profile);
      setNewProfileName("");
      setShowProfileModal(true);
    }
    setSelection(prev => ({ ...prev, active: false }));
  };

  const saveProfile = () => {
    if (!capturedData || !newProfileName.trim()) return;
    const profile = { ...capturedData, name: newProfileName.trim() };
    setCustomProfiles(prev => [...prev, profile]);
    setActiveProfileId(profile.id);
    setShowProfileModal(false);
    setCapturedData(null);
  };

  const deleteProfile = (id: string) => {
    setCustomProfiles(prev => prev.filter(p => p.id !== id));
    if (activeProfileId === id) setActiveProfileId(null);
  };

  const handleStart = async () => {
    await startCamera();
  };

  const handleStop = () => {
    stopCamera();
  };

  const spawnPlayTarget = () => {
    const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff8800"];
    const newTarget: PlayTarget = {
      x: 50 + Math.random() * (W - 100),
      y: 50 + Math.random() * (H - 100),
      radius: 30 + Math.random() * 20,
      color: colors[Math.floor(Math.random() * colors.length)],
      active: true,
    };
    setPlayTargets(prev => [...prev, newTarget]);
  };

  const clearPlayTargets = () => {
    setPlayTargets([]);
    setScore(0);
  };

  const resetRobot = () => {
    setRobot({
      x: W / 2,
      y: H / 2,
      angle: 0,
      speed: 0,
      targetX: W / 2,
      targetY: H / 2,
      state: "idle",
      battery: 100,
    });
    setScore(0);
    setInteractionLog([]);
    setPlayTargets([]);
  };

  const stateLabels: Record<string, string> = {
    idle: "Idle",
    moving: "Moving",
    interacting: "Interacting",
    playing: "Playing",
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-3 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Robot Vision Simulator</h1>

      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        <div className="flex-1">
          <div className="relative bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
            <video ref={videoRef} className="w-full max-w-[640px] h-auto block" playsInline />
            <canvas ref={canvasRef} className="hidden" />
            <canvas
              ref={overlayRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
            {mode === "custom" && isRunning && (
              <canvas
                ref={selectionCanvasRef}
                className="absolute inset-0 w-full h-full touch-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />
            )}
            {!isRunning && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                <p className="text-zinc-500">Klik Start untuk mengaktifkan kamera</p>
              </div>
            )}
            {mode === "custom" && isRunning && (
              <div className="absolute top-2 left-2 bg-black/70 px-3 py-1 rounded text-xs text-yellow-400">
                Drag untuk seleksi objek
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleStart}
              disabled={isRunning}
              className="px-4 py-2 bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start
            </button>
            <button
              onClick={handleStop}
              disabled={!isRunning}
              className="px-4 py-2 bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Stop
            </button>
            <button
              onClick={resetRobot}
              className="px-4 py-2 bg-zinc-700 rounded-md hover:bg-zinc-600"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="w-full lg:w-80 space-y-3 sm:space-y-4">
          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <h2 className="text-lg font-semibold mb-3">Stats</h2>
            <div className="space-y-1 text-sm font-mono">
              <p>FPS: <span className="text-green-400">{fps}</span></p>
              <p>Objects: <span className="text-yellow-400">{objects.length}</span></p>
              <p>Mode: <span className="text-blue-400">{mode}</span></p>
              <p>Robot: <span className="text-cyan-400">{stateLabels[robot.state]}</span></p>
              <p>Battery: <span className={robot.battery > 20 ? "text-green-400" : "text-red-400"}>{Math.round(robot.battery)}%</span></p>
              <p>Speed: <span className="text-purple-400">{robot.speed.toFixed(1)}</span></p>
            </div>
          </div>

          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <h2 className="text-lg font-semibold mb-3">Robot Mode</h2>
            <div className="grid grid-cols-3 gap-2">
              {(["follow", "interact", "play"] as RobotMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setRobotMode(m)}
                  className={`px-3 py-2 rounded-md text-sm capitalize ${
                    robotMode === m
                      ? "bg-cyan-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <h2 className="text-lg font-semibold mb-3">Detection Mode</h2>
            <div className="grid grid-cols-2 gap-2">
              {(["all", "color", "motion", "object", "custom"] as DetectionMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-2 rounded-md text-sm capitalize ${
                    mode === m
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {mode === "custom" && (
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <h2 className="text-lg font-semibold mb-3">Custom Detection</h2>
              <div className="space-y-3">
                <p className="text-xs text-zinc-400">
                  Drag pada video untuk menyeleksi objek. Data warna, shape, dan karakteristik akan diekstrak.
                </p>
                <div>
                  <label className="text-sm text-zinc-400 block mb-1">
                    Threshold: {customThreshold}%
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="95"
                    value={customThreshold}
                    onChange={(e) => setCustomThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                {customProfiles.length > 0 && (
                  <div>
                    <label className="text-sm text-zinc-400 block mb-2">Active Profile</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {customProfiles.map(p => (
                        <div
                          key={p.id}
                          className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                            activeProfileId === p.id ? "bg-blue-900/50 border border-blue-500" : "bg-zinc-800"
                          }`}
                          onClick={() => setActiveProfileId(p.id === activeProfileId ? null : p.id)}
                        >
                          <img src={p.thumbnail} alt={p.name} className="w-10 h-8 rounded object-cover" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="text-xs text-zinc-500">
                              H:{Math.round(p.avgH)} S:{Math.round(p.avgS)} V:{Math.round(p.avgV)}
                            </p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteProfile(p.id); }}
                            className="text-red-400 hover:text-red-300 text-xs px-2"
                          >
                            X
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {robotMode === "play" && (
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <h2 className="text-lg font-semibold mb-3">Play Mode</h2>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-zinc-400">Score</span>
                  <span className="text-xl font-bold text-yellow-400">{score}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={spawnPlayTarget}
                    className="flex-1 px-3 py-2 bg-yellow-600 rounded-md hover:bg-yellow-700 text-sm"
                  >
                    + Target
                  </button>
                  <button
                    onClick={clearPlayTargets}
                    className="flex-1 px-3 py-2 bg-zinc-700 rounded-md hover:bg-zinc-600 text-sm"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {(mode === "color" || mode === "all") && (
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <h2 className="text-lg font-semibold mb-3">Color Detection</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-zinc-400 block mb-1">Target Color</label>
                  <div className="flex gap-2">
                    {["red", "green", "blue", "yellow", "orange"].map((c) => (
                      <button
                        key={c}
                        onClick={() => setTargetColor(c)}
                        className={`w-8 h-8 rounded-full border-2 ${
                          targetColor === c ? "border-white scale-110" : "border-zinc-600"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-zinc-400 block mb-1">
                    Min Area: {colorThreshold}
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="500"
                    value={colorThreshold}
                    onChange={(e) => setColorThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}

          {(mode === "motion" || mode === "all") && (
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <h2 className="text-lg font-semibold mb-3">Motion Detection</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-zinc-400 block mb-1">
                    Sensitivity: {motionThreshold}
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={motionThreshold}
                    onChange={(e) => setMotionThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 block mb-1">
                    Min Area: {minMotionArea}
                  </label>
                  <input
                    type="range"
                    min="100"
                    max="5000"
                    value={minMotionArea}
                    onChange={(e) => setMinMotionArea(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}

          {interactionLog.length > 0 && (
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <h2 className="text-lg font-semibold mb-3">Interaction Log</h2>
              <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-xs text-zinc-400">
                {interactionLog.map((log, i) => (
                  <p key={i} className="text-green-400">{log}</p>
                ))}
              </div>
            </div>
          )}

          {objects.length > 0 && (
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <h2 className="text-lg font-semibold mb-3">Detected Objects</h2>
              <div className="space-y-2 max-h-48 overflow-y-auto font-mono text-sm">
                {objects.map((obj, i) => (
                  <div key={i} className="bg-zinc-800 rounded p-2">
                    <span className="text-green-400">{obj.label}</span>
                    <span className="text-zinc-500 ml-2">
                      ({obj.x}, {obj.y}) {obj.w}x{obj.h}
                      {obj.similarity !== undefined && ` (${Math.round(obj.similarity)}%)`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showProfileModal && capturedData && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-lg p-6 max-w-md w-full border border-zinc-700">
            <h2 className="text-xl font-bold mb-4">Simpan Profil Custom</h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <img src={capturedData.thumbnail} alt="Preview" className="w-24 h-16 rounded object-cover border border-zinc-600" />
                <div className="text-xs font-mono text-zinc-400 space-y-1">
                  <p>Avg HSV: ({Math.round(capturedData.avgH)}, {Math.round(capturedData.avgS)}, {Math.round(capturedData.avgV)})</p>
                  <p>H Range: +/-{Math.round(capturedData.hRange)}</p>
                  <p>S Range: +/-{Math.round(capturedData.sRange)}</p>
                  <p>V Range: +/-{Math.round(capturedData.vRange)}</p>
                  <p>Aspect Ratio: {capturedData.aspectRatio.toFixed(2)}</p>
                  <p>Compactness: {capturedData.compactness.toFixed(3)}</p>
                  <p>Dominant Colors: {capturedData.dominantColors.length}</p>
                </div>
              </div>
              <div>
                <label className="text-sm text-zinc-400 block mb-1">Nama Profil</label>
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="contoh: kunci, botol, dll"
                  className="w-full px-3 py-2 bg-zinc-800 rounded border border-zinc-600 text-white placeholder-zinc-500"
                  onKeyDown={(e) => e.key === "Enter" && saveProfile()}
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveProfile}
                  disabled={!newProfileName.trim()}
                  className="flex-1 px-4 py-2 bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Simpan
                </button>
                <button
                  onClick={() => { setShowProfileModal(false); setCapturedData(null); }}
                  className="flex-1 px-4 py-2 bg-zinc-700 rounded-md hover:bg-zinc-600"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
