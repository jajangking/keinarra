import { useRef, useState, useCallback, useEffect } from "react";

export type SearchState = "idle" | "searching" | "locked";

interface UseRobotSearchOptions {
  detections: { label: string; confidence: number; x: number; y: number; w: number; h: number }[];
  onMotors: (left: number, right: number) => void;
  onBuzzer?: (freq: number) => void;
  enabled?: boolean;
}

export function useRobotSearch({ detections, onMotors, onBuzzer, enabled = false }: UseRobotSearchOptions) {
  const [state, setState] = useState<SearchState>("idle");
  const targetRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const timerRef = useRef(0);

  // Spin pattern: left 1.5s → stop 0.3s → right 1.5s → stop 0.3s → repeat
  const spinCycle = useCallback(() => {
    let step = 0;
    const run = () => {
      if (!enabled) return;
      
      // Check if person is detected
      const person = detections.find(d => d.label === "person" && d.confidence > 0.5);
      if (person) {
        targetRef.current = person;
        setState("locked");
        onMotors(0, 0);
        onBuzzer?.(1000);
        return;
      }

      // Spin cycle
      const phases = [
        { left: -200, right: 200, dur: 1500 }, // spin left
        { left: 0, right: 0, dur: 300 },        // pause
        { left: 200, right: -200, dur: 1500 },  // spin right
        { left: 0, right: 0, dur: 300 },        // pause
      ];
      const phase = phases[step % phases.length];
      onMotors(phase.left, phase.right);
      step++;
      timerRef.current = window.setTimeout(run, phase.dur);
    };
    run();
  }, [enabled, detections, onMotors, onBuzzer]);

  useEffect(() => {
    if (!enabled) {
      clearTimeout(timerRef.current);
      setState("idle");
      targetRef.current = null;
      return;
    }
    setState("searching");
    spinCycle();
    return () => clearTimeout(timerRef.current);
  }, [enabled, spinCycle]);

  // Follow logic when locked
  useEffect(() => {
    if (state !== "locked" || !enabled) return;

    const person = detections.find(d => d.label === "person" && d.confidence > 0.5);
    if (!person) {
      // Lost target → resume searching
      setState("searching");
      targetRef.current = null;
      spinCycle();
      return;
    }

    targetRef.current = person;

    // Center of frame
    const frameCenterX = 320; // W/2
    const personCenterX = person.x + person.w / 2;
    const offsetX = personCenterX - frameCenterX;

    // Map offset to motor differential
    const baseSpeed = 200;
    const turnFactor = offsetX / 320; // -1 to 1
    const left = Math.round(baseSpeed - turnFactor * 150);
    const right = Math.round(baseSpeed + turnFactor * 150);
    onMotors(
      Math.max(-255, Math.min(255, left)),
      Math.max(-255, Math.min(255, right)),
    );
  }, [state, enabled, detections, onMotors, spinCycle]);

  return { state, target: targetRef.current };
}
