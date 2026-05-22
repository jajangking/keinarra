"use client";

import { useRef, useEffect, useCallback } from "react";

interface Note {
  freq: number;
  dur: number;
  delay: number;
  slide?: number;
}

type BuzzerPattern = "found" | "search" | "lost" | "excited" | "chirp" | "tired";

const PATTERNS: Record<BuzzerPattern, Note[]> = {
  // Wall-E happy found: rising triple beep ^ ^ ^!
  found: [
    { freq: 700,  dur: 0.07, delay: 0 },
    { freq: 1100, dur: 0.07, delay: 0.15 },
    { freq: 1600, dur: 0.18, delay: 0.3, slide: 2200 },
  ],
  // Wall-E searching: questioning chirp beep? ...
  search: [
    { freq: 900,  dur: 0.08, delay: 0 },
    { freq: 1300, dur: 0.05, delay: 0.1 },
  ],
  // Wall-E lost: descending sad beep beeooow...
  lost: [
    { freq: 1400, dur: 0.25, delay: 0, slide: 500 },
    { freq: 400,  dur: 0.3,  delay: 0.35 },
  ],
  // Wall-E excited: rapid happy beeps
  excited: [
    { freq: 900,  dur: 0.04, delay: 0 },
    { freq: 1400, dur: 0.04, delay: 0.08 },
    { freq: 2000, dur: 0.04, delay: 0.16 },
    { freq: 2500, dur: 0.06, delay: 0.24 },
    { freq: 2000, dur: 0.04, delay: 0.34 },
    { freq: 1400, dur: 0.04, delay: 0.42 },
    { freq: 900,  dur: 0.06, delay: 0.5 },
  ],
  // Single curiosity chirp
  chirp: [
    { freq: 1000, dur: 0.04, delay: 0 },
    { freq: 1500, dur: 0.03, delay: 0.06 },
  ],
  // Tired: slow descending groan -- uuuggghhh...
  tired: [
    { freq: 600,  dur: 0.3,  delay: 0,    slide: 300 },
    { freq: 300,  dur: 0.4,  delay: 0.35, slide: 150 },
    { freq: 150,  dur: 0.5,  delay: 0.8,  slide: 80  },
  ],
};

export function useBuzzerSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<OscillatorNode[]>([]);
  const patternRef = useRef<BuzzerPattern | null>(null);
  const timerRef = useRef(0);
  const canPlayRef = useRef<() => boolean>(() => true);

  const setCanPlay = useCallback((fn: () => boolean) => {
    canPlayRef.current = fn;
  }, []);

  const stop = useCallback(() => {
    clearTimeout(timerRef.current);
    patternRef.current = null;
    for (const n of nodesRef.current) {
      try { n.stop(); } catch {}
      try { n.disconnect(); } catch {}
    }
    nodesRef.current = [];
  }, []);

  const playNotes = useCallback((notes: Note[]) => {
    const ctx = ctxRef.current!;
    for (const n of notes) {
      const t = ctx.currentTime + n.delay;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(n.freq, t);
      if (n.slide !== undefined) {
        osc.frequency.linearRampToValueAtTime(n.slide, t + n.dur);
      }
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + n.dur + 0.01);
      nodesRef.current.push(osc);
    }
  }, []);

  const playPattern = useCallback((pattern: BuzzerPattern, repeat = false) => {
    stop();
    if (!canPlayRef.current()) return;
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    patternRef.current = pattern;
    const notes = PATTERNS[pattern];
    if (!notes) return;

    playNotes(notes);

    if (repeat) {
      const totalDur = Math.max(...notes.map(n => n.delay + n.dur)) + 0.1;
      timerRef.current = window.setTimeout(() => playPattern(pattern, true), totalDur * 1000);
    }
  }, [stop, playNotes]);

  const buzzerStart = useCallback((pattern: BuzzerPattern | "default") => {
    if (pattern === "default") playPattern("found", false);
    else playPattern(pattern, pattern === "search");
  }, [playPattern]);

  const buzzerStop = useCallback(() => {
    stop();
  }, [stop]);

  useEffect(() => {
    return () => {
      stop();
      ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, [stop]);

  return { buzzerStart, buzzerStop, setCanPlay };
}
