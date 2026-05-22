"use client";

import { useRef, useCallback } from "react";

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: { isFinal: boolean; [index: number]: { transcript: string } }[] }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function useSpeechToText() {
  const recognitionRef = useRef<SpeechRec | null>(null);
  const activeRef = useRef(false);
  const timerRef = useRef(0);

  const start = useCallback((
    onResult: (text: string) => void,
    onState?: (listening: boolean) => void,
  ): (() => void) => {
    const W = (window as unknown as Record<string, unknown>);
    const Ctor = (W.SpeechRecognition || W.webkitSpeechRecognition) as new () => SpeechRec | undefined;
    if (!Ctor) return () => {};

    // Stop existing
    try { recognitionRef.current?.stop(); } catch {}
    clearTimeout(timerRef.current);

    activeRef.current = true;
    const r = new Ctor();
    if (!r) return () => {};
    r.lang = "id-ID";
    r.continuous = false;
    r.interimResults = false;

    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const t = e.results[i][0].transcript.trim();
          if (t) onResult(t);
        }
      }
    };

    r.onerror = () => {
      activeRef.current = false;
      onState?.(false);
    };

    r.onend = () => {
      activeRef.current = false;
      onState?.(false);
    };

    try { r.start(); } catch { return () => {}; }
    recognitionRef.current = r;
    onState?.(true);

    return () => {
      activeRef.current = false;
      clearTimeout(timerRef.current);
      try { r.stop(); } catch {}
      if (recognitionRef.current === r) recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    clearTimeout(timerRef.current);
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
  }, []);

  return { sttStart: start, sttStop: stop };
}
