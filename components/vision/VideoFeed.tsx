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
  isScanning?: boolean;
  useYolo?: boolean;
  scannedObjects?: { id: string; x: number; y: number; w: number; h: number }[];
  selectedForLock?: string | null;
  onScanObjectClick?: (id: string) => void;
  yoloDetections?: { id: string; label: string; confidence: number; x: number; y: number; w: number; h: number; color: string }[];
  yoloReady?: boolean;
  yoloFps?: number;
  yoloError?: string | null;
  fps: number;
  aiEnabled: boolean;
  aiThinking: boolean;
}

const FW = 640;
const FH = 480;

const MODE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  all: { label: "ALL", color: "text-white", bg: "bg-zinc-700" },
  color: { label: "COLOR", color: "text-green-300", bg: "bg-green-900/70" },
  motion: { label: "MOTION", color: "text-cyan-300", bg: "bg-cyan-900/70" },
  object: { label: "OBJECT", color: "text-white", bg: "bg-zinc-700" },
  scan: { label: "SCAN", color: "text-yellow-300", bg: "bg-yellow-900/70" },
  yolo: { label: "YOLO", color: "text-purple-300", bg: "bg-purple-900/70" },
};

export function VideoFeed({
  videoRef, canvasRef, overlayRef, containerRef,
  isRunning, mode, objects, pickingColor, crosshairPos, pickedColor,
  onColorConfirm, onColorCancel,
  dragSelectEnabled, onDragSelect, dragSelection,
  isScanning, useYolo, scannedObjects, selectedForLock, onScanObjectClick,
  yoloDetections, yoloReady, yoloFps: _yoloFps, yoloError,
  fps, aiEnabled, aiThinking,
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

    if (!isDragging.current || !dragStart.current) return;
    const coords = getFrameCoords(e.clientX, e.clientY);
    if (coords) {
      const x = Math.min(dragStart.current.x, coords.x);
      const y = Math.min(dragStart.current.y, coords.y);
      const w = Math.abs(coords.x - dragStart.current.x);
      const h = Math.abs(coords.y - dragStart.current.y);
      setLiveDrag({ x, y, w, h });
    }
  }, [getFrameCoords, pickingColor]);

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

  const badge = MODE_BADGE[mode] || MODE_BADGE.all;

  return (
    <div
      ref={containerRef}
      className={`relative bg-black rounded-xl overflow-hidden border-2 ${
        pickingColor ? 'border-yellow-400 shadow-lg shadow-yellow-400/20'
        : dragSelectEnabled ? 'border-blue-400 shadow-lg shadow-blue-400/20'
        : aiEnabled ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/10'
        : 'border-zinc-800'
      }`}
    >
      <div ref={videoWrapperRef} className="relative inline-block w-full" style={{ isolation: 'isolate' }}>
        <video ref={videoRef} className="block w-full h-auto" style={{ position: 'relative', zIndex: 1 }} playsInline />

        {/* Grid overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ zIndex: 3, backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '25% 25%' }} />

        {/* Scan line effect */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3, background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.03) 50%)', backgroundSize: '100% 4px' }} />

        {/* Canvas overlay for detections */}
        <canvas ref={overlayRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 4 }} />

        {/* HUD Top Bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2 pointer-events-none" style={{ zIndex: 10, background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${badge.bg} ${badge.color}`}>
              {badge.label}
            </span>
            {aiEnabled && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-cyan-900/70 text-cyan-300 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${aiThinking ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
                AI
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-zinc-400">
              {objects.length} object{objects.length !== 1 ? 's' : ''}
            </span>
            <span className={`text-[10px] font-mono ${fps > 20 ? 'text-green-400' : fps > 10 ? 'text-yellow-400' : 'text-red-400'}`}>
              {fps} FPS
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              {FW}x{FH}
            </span>
          </div>
        </div>

        {/* HUD Bottom Bar */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2 pointer-events-none" style={{ zIndex: 10, background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}>
          <div className="flex items-center gap-2">
            {pickingColor && (
              <span className="text-[10px] font-mono text-yellow-400 animate-pulse">
                PICK COLOR MODE
              </span>
            )}
            {dragSelectEnabled && (
              <span className="text-[10px] font-mono text-blue-400">
                DRAG TO SELECT
              </span>
            )}
          </div>
          {isRunning && (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-mono text-red-400">LIVE</span>
            </div>
          )}
        </div>

        {/* Corner accents */}
        <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-white/20 pointer-events-none" style={{ zIndex: 5 }} />
        <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-white/20 pointer-events-none" style={{ zIndex: 5 }} />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-white/20 pointer-events-none" style={{ zIndex: 5 }} />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-white/20 pointer-events-none" style={{ zIndex: 5 }} />

        {/* Crosshair for color picking */}
        {pickingColor && crosshairPercent && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${crosshairPercent.left}%`,
              top: `${crosshairPercent.top}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 12,
            }}
          >
            <div className="relative">
              <div className="w-8 h-8 border-2 border-yellow-400 rounded-full" style={{ boxShadow: '0 0 12px rgba(250,204,21,0.4), 0 0 0 1px rgba(0,0,0,0.5)' }} />
              <div className="absolute top-1/2 left-0 w-full h-px bg-yellow-400/60 -translate-y-1/2" />
              <div className="absolute left-1/2 top-0 h-full w-px bg-yellow-400/60 -translate-x-1/2" />
            </div>
          </div>
        )}

        {/* Color picker preview */}
        {pickingColor && pickedColor && (
          <div
            className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-yellow-400/30 flex items-center gap-3"
            style={{ zIndex: 13, pointerEvents: 'auto' }}
          >
            <div
              className="w-10 h-10 rounded-lg border-2 border-white/30 shadow-lg"
              style={{ backgroundColor: `rgb(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})` }}
            />
            <div className="text-xs font-mono text-white">
              <p className="font-bold">RGB({pickedColor.r}, {pickedColor.g}, {pickedColor.b})</p>
              <p className="text-zinc-400 text-[10px]">#{pickedColor.r.toString(16).padStart(2, "0")}{pickedColor.g.toString(16).padStart(2, "0")}{pickedColor.b.toString(16).padStart(2, "0")}</p>
            </div>
            <div className="flex gap-1.5 ml-2">
              <button
                onClick={onColorConfirm}
                className="px-3 py-1.5 bg-green-600 rounded-lg text-xs font-medium text-white hover:bg-green-500 transition-colors"
              >
                OK
              </button>
              <button
                onClick={onColorCancel}
                className="px-3 py-1.5 bg-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Selection rectangle */}
        {selPercent && (
          <div
            className="absolute border-2 border-blue-400 pointer-events-none"
            style={{
              left: `${selPercent.left}%`,
              top: `${selPercent.top}%`,
              width: `${selPercent.width}%`,
              height: `${selPercent.height}%`,
              zIndex: 8,
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              boxShadow: '0 0 12px rgba(59, 130, 246, 0.2), inset 0 0 12px rgba(59, 130, 246, 0.1)',
            }}
          />
        )}

        {/* YOLO live detections */}
        {useYolo && yoloDetections && yoloDetections.length > 0 && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 7 }}>
            {yoloDetections.map((det) => {
              const left = (det.x / FW) * 100;
              const top = (det.y / FH) * 100;
              const width = (det.w / FW) * 100;
              const height = (det.h / FH) * 100;
              return (
                <div
                  key={det.id}
                  className="absolute"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                    border: `2px solid ${det.color}`,
                    boxShadow: `0 0 8px ${det.color}40`,
                  }}
                >
                  <span
                    className="absolute -top-5 left-0 text-[10px] font-mono font-bold px-1 rounded"
                    style={{
                      backgroundColor: det.color,
                      color: "#000",
                    }}
                  >
                    {det.label} {Math.round(det.confidence * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* YOLO loading/error states */}
        {useYolo && !yoloReady && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/70 backdrop-blur-md rounded-lg border border-yellow-400/30" style={{ zIndex: 12 }}>
            <p className="text-xs font-mono text-yellow-400 animate-pulse">Loading YOLO model...</p>
          </div>
        )}
        {useYolo && yoloError && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/70 backdrop-blur-md rounded-lg border border-red-400/30" style={{ zIndex: 12 }}>
            <p className="text-xs font-mono text-red-400">YOLO Error: {yoloError}</p>
          </div>
        )}

        {/* Interaction layer */}
        {(pickingColor || dragSelectEnabled || isScanning || useYolo) && (
          <div
            className="absolute top-0 left-0 w-full h-full touch-none"
            style={{ zIndex: 11, cursor: pickingColor ? 'crosshair' : isScanning ? 'pointer' : useYolo ? 'default' : 'crosshair' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        )}

        {/* Scan mode clickable objects */}
        {isScanning && scannedObjects && scannedObjects.length > 0 && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 9 }}>
            {scannedObjects.map((obj) => {
              const left = (obj.x / FW) * 100;
              const top = (obj.y / FH) * 100;
              const width = (obj.w / FW) * 100;
              const height = (obj.h / FH) * 100;
              const isSelected = selectedForLock === obj.id;
              return (
                <button
                  key={obj.id}
                  onClick={() => onScanObjectClick?.(obj.id)}
                  className="absolute pointer-events-auto transition-all"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                    border: `2px ${isSelected ? 'solid' : 'dashed'} ${isSelected ? '#06b6d4' : '#eab308'}`,
                    backgroundColor: isSelected ? 'rgba(6, 182, 212, 0.15)' : 'rgba(234, 179, 8, 0.08)',
                    boxShadow: isSelected ? '0 0 16px rgba(6, 182, 212, 0.4)' : '0 0 8px rgba(234, 179, 8, 0.2)',
                  }}
                >
                  <span className="absolute -top-5 left-0 text-[10px] font-mono text-yellow-400 font-bold">
                    {obj.id}
                  </span>
                  {isSelected && (
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-cyan-400 animate-pulse whitespace-nowrap">
                      Click to lock
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Not running state */}
        {!isRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm" style={{ zIndex: 6 }}>
            <div className="w-16 h-16 rounded-full border-2 border-zinc-600 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-zinc-500 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p className="text-zinc-400 text-sm font-medium">Camera is off</p>
            <p className="text-zinc-600 text-xs mt-1">Click Start to activate</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
