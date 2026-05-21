import { useRef, useState, useCallback, useEffect } from "react";

interface UseCameraOptions {
  width?: number;
  height?: number;
  onFrame?: (frame: ImageData) => void;
}

export function useCamera({ width = 640, height = 480, onFrame }: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const animFrameRef = useRef<number>(0);
  const onFrameRef = useRef(onFrame);
  const [isRunning, setIsRunning] = useState(false);
  const [fps, setFps] = useState(0);
  const fpsFramesRef = useRef(0);
  const fpsLastTimeRef = useRef(0);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!isRunning || !onFrameRef.current) return;

    let cancelled = false;

    const loop = () => {
      if (cancelled) return;
      if (!videoRef.current || !canvasRef.current || !onFrameRef.current) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!ctxRef.current) {
        ctxRef.current = canvas.getContext("2d", { willReadFrequently: true });
      }
      const ctx = ctxRef.current;
      if (!ctx || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.drawImage(video, 0, 0, width, height);
      const frame = ctx.getImageData(0, 0, width, height);

      onFrameRef.current(frame);

      fpsFramesRef.current++;
      const now = performance.now();
      if (now - fpsLastTimeRef.current >= 500) {
        setFps(Math.round(fpsFramesRef.current * 1000 / (now - fpsLastTimeRef.current)));
        fpsFramesRef.current = 0;
        fpsLastTimeRef.current = now;
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    fpsFramesRef.current = 0;
    fpsLastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isRunning, width, height]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width, height, facingMode: "environment" },
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
  }, [width, height]);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setIsRunning(false);
    setFps(0);
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { videoRef, canvasRef, isRunning, fps, start, stop };
}
