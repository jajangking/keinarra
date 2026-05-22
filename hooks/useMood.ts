"use client";

import { useState, useCallback, useRef } from "react";

export type Mood = "excited" | "happy" | "playful" | "curious" | "confused" | "tired" | "sleepy" | "idle";

interface MoodState {
  mood: Mood;
  energy: number;  // 0-1
  lastEvent: string;
}

const MOOD_TRANSITIONS: Record<string, Mood> = {
  "found": "excited",
  "lost": "confused",
  "search_start": "curious",
  "search_long": "tired",
  "interact_start": "happy",
  "interact_play": "playful",
  "interact_joke": "playful",
  "interact_serious": "curious",
  "rest_start": "sleepy",
  "rest_end": "idle",
  "stop": "idle",
};

export function useMood() {
  const [state, setState] = useState<MoodState>({ mood: "idle", energy: 0.8, lastEvent: "init" });
  const moodRef = useRef(state);

  const trigger = useCallback((event: string, intensity = 0.5) => {
    const newMood = MOOD_TRANSITIONS[event] || state.mood;
    const energyDelta = event === "found" ? 0.3
      : event === "lost" ? -0.2
      : event === "search_long" ? -0.3
      : event === "rest_start" ? -0.1
      : event === "rest_end" ? 0.2
      : event === "interact_joke" ? 0.15
      : event === "interact_play" ? 0.2
      : 0;

    const next = {
      mood: newMood,
      energy: Math.max(0, Math.min(1, state.energy + energyDelta)),
      lastEvent: event,
    };
    moodRef.current = next;
    setState(next);
  }, [state]);

  const setMood = useCallback((mood: Mood) => {
    const next = { ...state, mood };
    moodRef.current = next;
    setState(next);
  }, [state]);

  return { mood: state.mood, energy: state.energy, trigger, setMood };
}

// Movement improvisation based on mood
export function improviseMove(mood: Mood, energy: number): { left: number; right: number; dur: number }[] {
  const e = energy;
  const wobble = () => Math.round((Math.random() - 0.5) * 60 * e + 60 * e);

  switch (mood) {
    case "excited":
      return [
        { left: wobble() + 80, right: wobble() + 60, dur: 120 + Math.random() * 80 },
        { left: wobble() - 60, right: wobble() - 80, dur: 120 + Math.random() * 80 },
        { left: wobble() + 100, right: wobble() + 40, dur: 150 + Math.random() * 60 },
        { left: 0, right: 0, dur: 200 },
      ];
    case "happy":
      return [
        { left: wobble() + 50, right: wobble() + 50, dur: 200 + Math.random() * 100 },
        { left: wobble() - 30, right: wobble() - 30, dur: 200 + Math.random() * 100 },
        { left: 0, right: 0, dur: 150 },
      ];
    case "playful":
      return [
        { left: wobble() + 100, right: -wobble() - 80, dur: 180 + Math.random() * 120 },
        { left: -wobble() - 80, right: wobble() + 100, dur: 180 + Math.random() * 120 },
        { left: wobble() + 60, right: wobble() + 60, dur: 150 + Math.random() * 80 },
        { left: 0, right: 0, dur: 100 },
      ];
    case "curious":
      return [
        { left: 50 + wobble() / 2, right: -100 - wobble() / 2, dur: 300 + Math.random() * 100 },
        { left: -100 - wobble() / 2, right: 50 + wobble() / 2, dur: 300 + Math.random() * 100 },
        { left: 0, right: 0, dur: 200 },
      ];
    case "confused":
      return [
        { left: wobble() + 30, right: -wobble() - 30, dur: 250 + Math.random() * 100 },
        { left: -wobble() - 30, right: wobble() + 30, dur: 250 + Math.random() * 100 },
        { left: wobble() + 20, right: wobble() + 20, dur: 200 + Math.random() * 80 },
        { left: -wobble() - 20, right: -wobble() - 20, dur: 200 + Math.random() * 80 },
        { left: 0, right: 0, dur: 300 },
      ];
    case "tired":
    case "sleepy":
      const slow = Math.round(30 * e + 20);
      return [
        { left: slow, right: slow, dur: 400 + Math.random() * 200 },
        { left: -Math.round(slow * 0.5), right: -Math.round(slow * 0.5), dur: 400 + Math.random() * 200 },
        { left: 0, right: 0, dur: 500 + Math.random() * 300 },
      ];
    default: // idle
      return [
        { left: wobble() / 2, right: -wobble() / 2, dur: 500 + Math.random() * 200 },
        { left: 0, right: 0, dur: 300 + Math.random() * 200 },
      ];
  }
}

export function moodToMoveDesc(mood: Mood): string {
  const descs: Record<Mood, string> = {
    excited: "gerakan cepat, enerjik, penuh semangat, goyang ke kiri dan kanan",
    happy: "gerakan riang, maju mundur kecil, anggukan",
    playful: "gerakan lincah, muter-muter kecil, goyang-goyang nakal",
    curious: "gerakan pelan mencari, miring ke kiri dan kanan seperti melongok",
    confused: "gerakan bingung, maju mundur ragu, muter ragu",
    tired: "gerakan lambat, berat, seperti kelelahan",
    sleepy: "gerakan sangat lambat, hampir diam, sesekali bergerak sedikit",
    idle: "gerakan kecil kadang-kadang, seperti penasaran",
  };
  return descs[mood] || "gerakan santai";
}
