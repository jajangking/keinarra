"use client";

import { useRef, useEffect, useCallback } from "react";

export function useBuzzerSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const stop = useCallback(() => {
    try { oscRef.current?.stop(); } catch {}
    oscRef.current = null;
    gainRef.current = null;
  }, []);

  const start = useCallback((freq = 1000) => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    stop();

    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 2);

    oscRef.current = osc;
    gainRef.current = gain;
  }, [stop]);

  useEffect(() => {
    return () => {
      stop();
      ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, [stop]);

  return { buzzerStart: start, buzzerStop: stop };
}
