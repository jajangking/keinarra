"use client";

import { useRef, useCallback, useEffect, useState } from "react";

export function useAudioManager() {
  const ttsSpeakingRef = useRef(false);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);

  const speak = useCallback((text: string) => {
    window.speechSynthesis.cancel();
    ttsSpeakingRef.current = true;
    setTtsSpeaking(true);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "id-ID";
    u.rate = 1.1;
    u.onend = () => { ttsSpeakingRef.current = false; setTtsSpeaking(false); };
    u.onerror = () => { ttsSpeakingRef.current = false; setTtsSpeaking(false); };
    window.speechSynthesis.speak(u);
  }, []);

  const canBuzzer = useCallback(() => {
    return true;
  }, []);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  return { ttsSpeaking, speak, canBuzzer };
}
