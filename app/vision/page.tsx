"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type DetectionMode = "color" | "motion" | "object" | "all";
type RobotMode = "follow" | "interact" | "play";

interface DetectedObject {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color?: string;
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

export default function VisionPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
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

  const findContours = (mask: Uint8Array, w: number, h: number, minArea: number): { x: number; y: number; w: number; h: number }[] => {
    const visited = new Uint8Array(w * h);
    const regions: { x: number; y: number; w: number; h: number }[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx] === 0 || visited[idx]) continue;

        let minX = x, minY = y, maxX = x, maxY = y;
        let area = 0;
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

          for (const n of neighbors) {
            if (n >= 0 && mask[n] > 0 && !visited[n]) {
              visited[n] = 1;
              stack.push(n);
            }
          }
        }

        if (area >= minArea) {
          regions.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
        }
      }
    }
    return regions;
  };

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
          if (obj.color) {
            const msg = `Mendeteksi warna: ${obj.color} di (${Math.round(tx)}, ${Math.round(ty)})`;
            setInteractionLog(prev => [msg, ...prev].slice(0, 10));
          }
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

    const colorMap: Record<string, string> = {
      red: "#ff0000",
      green: "#00ff00",
      blue: "#0000ff",
      yellow: "#ffff00",
      orange: "#ff8800",
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
      octx.fillText(`${obj.w}x${obj.h}`, ox, oy + oh + 14);

      const cx = ox + ow / 2;
      const cy = oy + oh / 2;
      octx.beginPath();
      octx.arc(cx, cy, 4, 0, Math.PI * 2);
      octx.fillStyle = c;
      octx.fill();
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
  }, [mode, targetColor, colorThreshold, motionThreshold, minMotionArea, robotMode, playTargets, updateRobot, robot]);

  useEffect(() => {
    if (isRunning) {
      animFrameRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isRunning, processFrame]);

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <h1 className="text-3xl font-bold mb-6">Robot Vision Simulator</h1>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <div className="relative bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
            <video ref={videoRef} className="w-full max-w-[640px] h-auto block" playsInline />
            <canvas ref={canvasRef} className="hidden" />
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            {!isRunning && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                <p className="text-zinc-500">Klik Start untuk mengaktifkan kamera</p>
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

        <div className="w-full lg:w-80 space-y-4">
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
              {(["all", "color", "motion", "object"] as DetectionMode[]).map((m) => (
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
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
