import { useRef, useState, useCallback } from "react";
import type { DetectedObject } from "@/lib/vision/types";

interface VideoFeedProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isRunning: boolean;
  mode: string;
  objects: DetectedObject[];
  pickingColor: boolean;
  crosshairPos?: { x: number; y: number } | null;
  pickedColor?: { r: number; g: number; b: number } | null;
  onCrosshairMove?: (x: number, y: number) => void;
  onColorConfirm?: () => void;
  onColorCancel?: () => void;
  dragSelectEnabled?: boolean;
  onDragSelect?: (x: number, y: number, w: number, h: number) => void;
  dragSelection?: { x: number; y: number; w: number; h: number } | null;
}

const colorMap: Record<string, string> = {
  red: "#ff0000", green: "#00ff00", blue: "#0000ff",
  yellow: "#ffff00", orange: "#ff8800", custom: "#ff00ff",
  cyan: "#00ffff", white: "#ffffff",
};

const FW = 640;
const FH = 480;

export function VideoFeed({
  videoRef, canvasRef, overlayRef, containerRef,
  isRunning, mode, objects, pickingColor, crosshairPos, pickedColor,
  onCrosshairMove, onColorConfirm, onColorCancel,
  dragSelectEnabled, onDragSelect, dragSelection,
}: VideoFeedProps) {
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [liveDrag, setLiveDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const getFrameCoords = useCallback((clientX: number, clientY: number) => {
    const videoEl = videoRef.current;
    const wrapper = videoWrapperRef.current;
    if (!videoEl || !wrapper) return null;

    const videoRect = videoEl.getBoundingClientRect();
    const relX = clientX - videoRect.left;
    const relY = clientY - videoRect.top;

    if (relX < 0 || relX > videoRect.width || relY < 0 || relY > videoRect.height) return null;

    const frameX = (relX / videoRect.width) * FW;
    const frameY = (relY / videoRect.height) * FH;

    return { x: Math.round(Math.max(0, Math.min(FW - 1, frameX))), y: Math.round(Math.max(0, Math.min(FH - 1, frameY))) };
  }, [videoRef]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (pickingColor) return;
    if (!dragSelectEnabled || !onDragSelect) return;

    isDragging.current = true;
    const coords = getFrameCoords(e.clientX, e.clientY);
    if (coords) {
      dragStart.current = coords;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, [pickingColor, dragSelectEnabled, onDragSelect, getFrameCoords]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (pickingColor) return;

    if (pickingColor && isDragging.current && onCrosshairMove) {
      const coords = getFrameCoords(e.clientX, e.clientY);
      if (coords) onCrosshairMove(coords.x, coords.y);
      return;
    }

    if (!isDragging.current || !dragStart.current) return;
    const coords = getFrameCoords(e.clientX, e.clientY);
    if (coords) {
      const x = Math.min(dragStart.current.x, coords.x);
      const y = Math.min(dragStart.current.y, coords.y);
      const w = Math.abs(coords.x - dragStart.current.x);
      const h = Math.abs(coords.y - dragStart.current.y);
      setLiveDrag({ x, y, w, h });
    }
  }, [pickingColor, onCrosshairMove, getFrameCoords]);

  const handlePointerUp = useCallback(() => {
    if (liveDrag && liveDrag.w > 10 && liveDrag.h > 10 && onDragSelect) {
      onDragSelect(liveDrag.x, liveDrag.y, liveDrag.w, liveDrag.h);
    }
    isDragging.current = false;
    dragStart.current = null;
    setLiveDrag(null);
  }, [liveDrag, onDragSelect]);

  const crosshairPercent = crosshairPos ? {
    left: (crosshairPos.x / FW) * 100,
    top: (crosshairPos.y / FH) * 100,
  } : null;

  const sel = liveDrag || dragSelection;
  const selPercent = sel ? {
    left: (sel.x / FW) * 100,
    top: (sel.y / FH) * 100,
    width: (sel.w / FW) * 100,
    height: (sel.h / FH) * 100,
  } : null;

  return (
    <div
      ref={containerRef}
      className={`relative bg-zinc-900 rounded-lg overflow-hidden border ${pickingColor ? 'border-yellow-500' : dragSelectEnabled ? 'border-blue-500' : 'border-zinc-800'}`}
    >
      <div ref={videoWrapperRef} className="relative inline-block" style={{ isolation: 'isolate' }}>
        <video ref={videoRef} className="block max-w-[640px] h-auto" style={{ position: 'relative', zIndex: 1 }} playsInline />

        {objects.map((obj, i) => {
          const c = obj.color && colorMap[obj.color]
            ? colorMap[obj.color]
            : obj.label === "Motion" ? "#00ffff"
            : obj.label === "Object" ? "#ffffff"
            : "#00ff00";
          const left = (obj.x / FW) * 100;
          const top = (obj.y / FH) * 100;
          const width = (obj.w / FW) * 100;
          const height = (obj.h / FH) * 100;
          return (
            <div
              key={`det-${obj.id || 'none'}-${i}`}
              className="absolute pointer-events-none"
              style={{
                left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`,
                border: `3px solid ${c}`,
                boxShadow: `0 0 8px ${c}40, inset 0 0 8px ${c}20`,
                zIndex: 2,
              }}
            >
              <div className="absolute -top-5 left-0 text-xs font-mono font-bold whitespace-nowrap px-1" style={{ color: c, textShadow: '0 0 4px #000' }}>
                {obj.label}{obj.similarity !== undefined ? ` ${Math.round(obj.similarity)}%` : ''}
              </div>
            </div>
          );
        })}

        <canvas ref={overlayRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 2, opacity: 0 }} />

        {pickingColor && crosshairPercent && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${crosshairPercent.left}%`,
              top: `${crosshairPercent.top}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
            }}
          >
            <div className="relative">
              <div className="w-6 h-6 border-2 border-white rounded-full shadow-lg" style={{ boxShadow: '0 0 0 1px #000, 0 0 8px rgba(255,255,0,0.5)' }} />
              <div className="absolute top-1/2 left-0 w-full h-px bg-white/50 -translate-y-1/2" />
              <div className="absolute left-1/2 top-0 h-full w-px bg-white/50 -translate-x-1/2" />
            </div>
          </div>
        )}

        {pickingColor && pickedColor && (
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur px-4 py-2 rounded-lg border border-yellow-500/50 flex items-center gap-3"
            style={{ zIndex: 11, pointerEvents: 'auto' }}
          >
            <div
              className="w-8 h-8 rounded border border-white/30"
              style={{ backgroundColor: `rgb(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})` }}
            />
            <div className="text-xs font-mono text-white">
              RGB({pickedColor.r}, {pickedColor.g}, {pickedColor.b})
            </div>
            <div className="flex gap-1">
              <button
                onClick={onColorConfirm}
                className="px-3 py-1 bg-green-600 rounded text-xs text-white hover:bg-green-500"
              >
                OK
              </button>
              <button
                onClick={onColorCancel}
                className="px-3 py-1 bg-zinc-600 rounded text-xs text-white hover:bg-zinc-500"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {selPercent && (
          <div
            className="absolute border-2 border-blue-400 pointer-events-none"
            style={{
              left: `${selPercent.left}%`,
              top: `${selPercent.top}%`,
              width: `${selPercent.width}%`,
              height: `${selPercent.height}%`,
              zIndex: 8,
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
            }}
          />
        )}

        {(pickingColor || dragSelectEnabled) && (
          <div
            className="absolute top-0 left-0 w-full h-full touch-none"
            style={{ zIndex: 9, cursor: pickingColor ? 'crosshair' : dragSelectEnabled ? 'crosshair' : 'default' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        )}

        {!isRunning && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900" style={{ zIndex: 4 }}>
            <p className="text-zinc-500">Klik Start untuk mengaktifkan kamera</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
