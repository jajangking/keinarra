"use client";

import { useRef, useEffect } from "react";

interface Detection {
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Robot3DProps {
  leftSpeed: number;
  rightSpeed: number;
  buzzerOn: boolean;
  connected: boolean;
  searchState?: "idle" | "searching" | "locked" | "resting";
  detections?: Detection[];
}

export function Robot3D({ leftSpeed, rightSpeed, buzzerOn, connected, searchState = "idle", detections = [] }: Robot3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let anim = 0;
    const W = 200, H = 200;
    const s = 2;
    canvas.width = W * s;
    canvas.height = H * s;
    ctx.scale(s, s);

    const cx = W / 2, cy = H / 2;
    const maxR = 80;
    const FOV = 1.0;

    const draw = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, W, H);

      // — Dark background with radial gradient —
      const bg = ctx.createRadialGradient(cx, cy, 5, cx, cy, maxR + 20);
      bg.addColorStop(0, "#1a1a1a");
      bg.addColorStop(0.7, "#141414");
      bg.addColorStop(1, "#0a0a0a");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR + 20, 0, Math.PI * 2);
      ctx.fill();

      // — Radar rings —
      ctx.strokeStyle = "rgba(34, 211, 238, 0.06)";
      ctx.lineWidth = 0.5;
      [20, 40, 60, 80].forEach(r => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Crosshairs
      ctx.strokeStyle = "rgba(34, 211, 238, 0.04)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
      ctx.stroke();

      // — Angle labels —
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.font = "5px monospace";
      ctx.textAlign = "center";
      ctx.fillText("0°", cx, cy - maxR - 4);
      ctx.fillText("180°", cx, cy + maxR + 8);
      ctx.textAlign = "right";
      ctx.fillText("-90°", cx - maxR - 3, cy + 2);
      ctx.textAlign = "left";
      ctx.fillText("+90°", cx + maxR + 3, cy + 2);

      // — Sweeping scan line (always active, brighter when searching) —
      const scanAngle = now * 0.002;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(scanAngle);

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(-0.05) * maxR, Math.sin(-0.05) * maxR);
      ctx.strokeStyle = `rgba(34, 211, 238, ${searchState === "searching" ? 0.25 : 0.08})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(0.05) * maxR, Math.sin(0.05) * maxR);
      ctx.stroke();

      // Fill scan wedge
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, maxR, -0.05, 0.05);
      ctx.fillStyle = `rgba(34, 211, 238, ${searchState === "searching" ? 0.04 : 0.01})`;
      ctx.fill();

      ctx.restore();

      // — FOV cone (upward, robot facing up) —
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, maxR, -FOV / 2, FOV / 2);
      ctx.closePath();
      ctx.fillStyle = "rgba(34, 211, 238, 0.03)";
      ctx.fill();
      ctx.strokeStyle = "rgba(34, 211, 238, 0.1)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();

      // — Draw persons on radar —
      for (const d of detections) {
        if (d.label !== "person" || d.confidence < 0.5) continue;

        // Normalize pixel coords (640×480) → 0-1 fraction
        const cxNorm = (d.x + d.w / 2) / 640;
        const cyNorm = (d.y + d.h / 2) / 480;
        const hNorm = d.h / 480;

        // Angle: left/right in frame → radar angle (0 = forward/up)
        const angle = (cxNorm - 0.5) * FOV;

        // Distance: taller bbox = closer
        const dist = 10 / Math.max(hNorm, 0.05);
        const r = Math.min(dist, maxR - 5);

        // Position: forward is -PI/2 (up), angle offset is + to right, - to left
        const theta = -Math.PI / 2 + angle;
        const px2 = cx + r * Math.cos(theta);
        const py2 = cy + r * Math.sin(theta);

        // Clamp to radar bounds
        const dr = Math.sqrt((px2 - cx) ** 2 + (py2 - cy) ** 2);
        if (dr > maxR - 2) continue;

        // Pulse based on confidence + time
        const pulse = 0.8 + Math.sin(now * 0.005 + d.confidence * 3) * 0.2;

        // Direction line from center
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px2, py2);
        ctx.strokeStyle = `rgba(250, 204, 21, ${0.15 * d.confidence})`;
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Blip ring
        const ringR = 5 * pulse * d.confidence;
        ctx.beginPath();
        ctx.arc(px2, py2, ringR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(250, 204, 21, ${0.15 * d.confidence})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(250, 204, 21, ${0.3 * d.confidence})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Person icon (small)
        ctx.beginPath();
        ctx.arc(px2, py2 - 1, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(250, 204, 21, ${0.9 * d.confidence})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px2, py2 - 4, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(251, 191, 36, ${0.9 * d.confidence})`;
        ctx.fill();

        // Distance text
        ctx.font = "5px monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = `rgba(250, 204, 21, ${0.4 * d.confidence})`;
        const distM = (r / maxR * 8).toFixed(1);
        ctx.fillText(`${distM}m ${Math.round((1 - d.confidence) * 100)}%`, px2 + 6, py2 + 2);
      }

      // — Robot at center (top-down, facing up) —
      ctx.save();
      ctx.translate(cx, cy);

      // Shadow
      ctx.beginPath();
      ctx.ellipse(0, 3, 14, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fill();

      // Forward heading beam (upward)
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(0, -22);
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.3 + Math.sin(now * 0.003) * 0.1})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Wheels
      for (const side of [-1, 1]) {
        const wx = side * 12;
        ctx.beginPath();
        ctx.arc(wx, 4, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#18181b";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(wx, 4, 2, 0, Math.PI * 2);
        ctx.fillStyle = "#3f3f46";
        ctx.fill();
      }

      // Body
      ctx.shadowColor = "rgba(0,0,0,0.2)";
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
      ctx.beginPath();
      ctx.roundRect(-13, -10, 26, 18, 3);
      const grad = ctx.createLinearGradient(0, -10, 0, 8);
      grad.addColorStop(0, "#3f3f46");
      grad.addColorStop(0.5, "#27272a");
      grad.addColorStop(1, "#18181b");
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.roundRect(-11, -12, 22, 8, 2);
      const g2 = ctx.createLinearGradient(0, -12, 0, -4);
      g2.addColorStop(0, "#52525b");
      g2.addColorStop(1, "#3f3f46");
      ctx.fillStyle = g2;
      ctx.fill();

      // Sensor dome (top)
      ctx.shadowBlur = 1;
      ctx.shadowColor = searchState === "searching" ? "rgba(250,204,21,0.3)" : "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(0, -13, 5, 3, 0, 0, Math.PI * 2);
      const dg = ctx.createRadialGradient(-1, -14, 0.5, 0, -13, 5);
      dg.addColorStop(0, searchState === "searching" ? "#fbbf24" : "#818cf8");
      dg.addColorStop(0.4, "#818cf8");
      dg.addColorStop(1, "#4338ca");
      ctx.fillStyle = dg;
      ctx.fill();

      // Front LED
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, -9, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = connected ? (searchState === "locked" ? "#22c55e" : "#22d3ee") : "#ef4444";
      ctx.fill();

      // Buzzer LED
      if (buzzerOn) {
        ctx.beginPath();
        ctx.arc(0, 7, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(234, 179, 8, ${0.6 + Math.sin(now * 0.01) * 0.3})`;
        ctx.fill();
      }

      ctx.restore();

      // — Buzzer waves (world position from center) —
      if (buzzerOn) {
        const ringT = now * 0.004;
        for (let i = 0; i < 3; i++) {
          const phase = ((ringT + i * 0.4) % 1) * 20 + 3;
          ctx.beginPath();
          ctx.arc(cx + 20, cy - 15, phase, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(234, 179, 8, ${(1 - phase / 23) * 0.4})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // — HUD text —
      ctx.shadowBlur = 0;
      ctx.font = "6px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillText("▼", cx, cy + maxR + 14);

      if (searchState === "searching") {
        ctx.fillStyle = "rgba(250,204,21,0.35)";
        ctx.fillText("MENCARI", cx, 10);
      } else if (searchState === "locked") {
        ctx.fillStyle = "rgba(34,197,94,0.35)";
        ctx.fillText("MENGIKUTI", cx, 10);
      } else if (searchState === "resting") {
        ctx.fillStyle = "rgba(239,68,68,0.35)";
        ctx.fillText("ISTIRAHAT", cx, 10);
      }

      // Person count + closest
      const persons = detections.filter(d => d.label === "person" && d.confidence > 0.5);
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "5px monospace";
      ctx.fillText(`${persons.length}`, 4, H - 4);

      // Motor indicators
      ctx.textAlign = "left";
      ctx.fillStyle = leftSpeed > 0 ? "rgba(34,211,238,0.3)" : leftSpeed < 0 ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.08)";
      ctx.font = "5px monospace";
      ctx.fillText(`L:${leftSpeed}`, 4, 12);
      ctx.textAlign = "right";
      ctx.fillStyle = rightSpeed > 0 ? "rgba(34,211,238,0.3)" : rightSpeed < 0 ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.08)";
      ctx.fillText(`R:${rightSpeed}`, W - 4, 12);

      anim = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(anim);
  }, [leftSpeed, rightSpeed, buzzerOn, connected, searchState, detections]);

  return (
    <canvas
      ref={canvasRef}
      className="w-[200px] h-[200px] rounded-lg"
    />
  );
}
