import { useRef, useState, useCallback, useEffect } from "react";

export type SearchState = "idle" | "searching" | "locked" | "resting";

interface UseRobotSearchOptions {
  detections: { label: string; confidence: number; x: number; y: number; w: number; h: number }[];
  onMotors: (left: number, right: number) => void;
  onBuzzer?: (pattern: string) => void;
  enabled?: boolean;
}

export function useRobotSearch({ detections, onMotors, onBuzzer, enabled = false }: UseRobotSearchOptions) {
  const [state, setState] = useState<SearchState>("idle");
  const targetRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const timerRef = useRef(0);
  const cycleCountRef = useRef(0);

  const spinCycle = useCallback(() => {
    let step = 0;
    const run = () => {
      if (!enabled) return;

      const person = detections.find(d => d.label === "person" && d.confidence > 0.5);
      if (person) {
        targetRef.current = person;
        setState("locked");
        onMotors(0, 0);
        onBuzzer?.("found");
        return;
      }

      cycleCountRef.current++;

      // Rest every 3 full cycles (12 phases)
      if (cycleCountRef.current > 0 && cycleCountRef.current % 12 === 0) {
        setState("resting");
        onMotors(0, 0);
        onBuzzer?.("tired");

        const restDur = Math.min(2000 + Math.floor(cycleCountRef.current / 12) * 500, 5000);
        timerRef.current = window.setTimeout(() => {
          setState("searching");
          step = 0;
          run();
        }, restDur);
        return;
      }

      // Walking animation: vary speed per step for natural look
      if (step % 4 === 0) onBuzzer?.("chirp");

      const t = step % 8;
      const walk = t < 4
        ? { left: -200 + Math.sin(t * 1.2) * 40, right: 200 + Math.cos(t * 1.2) * 40, dur: 700 + Math.sin(t * 0.8) * 100 }
        : t < 6
        ? { left: 200 + Math.cos(t * 0.7) * 30, right: -200 + Math.sin(t * 0.7) * 30, dur: 800 + Math.sin(t * 1.1) * 80 }
        : { left: Math.sin(t * 0.5) * 150, right: Math.cos(t * 0.5) * 150, dur: 500 };

      // Slower, more sluggish movement as attempts increase
      const fatigue = Math.min(cycleCountRef.current / 30, 0.5);
      const speedMul = 1 - fatigue;
      onMotors(
        Math.round(walk.left * speedMul),
        Math.round(walk.right * speedMul),
      );
      step++;
      timerRef.current = window.setTimeout(run, walk.dur);
    };
    run();
  }, [enabled, detections, onMotors, onBuzzer]);

  useEffect(() => {
    if (!enabled) {
      clearTimeout(timerRef.current);
      setState("idle");
      targetRef.current = null;
      cycleCountRef.current = 0;
      return;
    }
    setState("searching");
    cycleCountRef.current = 0;
    spinCycle();
    return () => clearTimeout(timerRef.current);
  }, [enabled, spinCycle]);

  useEffect(() => {
    if (state !== "locked" || !enabled) return;

    const person = detections.find(d => d.label === "person" && d.confidence > 0.5);
    if (!person) {
      const t = setTimeout(() => {
        const stillLost = !detections.find(d => d.label === "person" && d.confidence > 0.5);
        if (!stillLost) return;
        setState("searching");
        targetRef.current = null;
        onBuzzer?.("lost");
        spinCycle();
      }, 2000);
      return () => clearTimeout(t);
    }

    targetRef.current = person;

    const frameCenterX = 320;
    const personCenterX = person.x + person.w / 2;
    const offsetX = personCenterX - frameCenterX;

    const baseSpeed = 200;
    const turnFactor = offsetX / 320;
    const left = Math.round(baseSpeed - turnFactor * 150);
    const right = Math.round(baseSpeed + turnFactor * 150);
    onMotors(
      Math.max(-255, Math.min(255, left)),
      Math.max(-255, Math.min(255, right)),
    );
  }, [state, enabled, detections, onMotors, spinCycle, onBuzzer]);

  return { state, target: targetRef.current };
}
