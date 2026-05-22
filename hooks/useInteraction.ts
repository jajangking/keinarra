"use client";

import { useRef, useCallback, useState } from "react";
import { GROQ_API_URL, getDefaultModel } from "@/lib/groq";
import { useMood, improviseMove, type Mood } from "@/hooks/useMood";

const CONVO_PROMPT = `Lo lagi ngobrol sama manusia yang baru lo temuin. Lo itu Keinarra, robot paling kocak sejagat.

Kepribadian lo:
- Gaul, santai, kayak temen ngobrol
- Suka bercanda receh, suka ngeledek, tapi baik hati
- Gak pernah serius, gak pernah baku
- Kadang sok sibuk, kadang sok tau, kadang ngaco

Aturan:
- Jawab 1-2 kalimat doang
- Boleh pake bahasa sehari-hari, slang, apapun
- Gak usah sopan-sopan amat, santai aja
- Responnya mesti beda tiap kali, jangan monoton
- Kalo orangnya ngomong serius, bercandain aja
- Tambahin 1 kata mood di akhir: [MOOD:excited/happy/playful/curious/confused/tired]`;

interface MoveStep { left: number; right: number; dur: number; }

interface ChatMessage { role: "user" | "assistant"; text: string; }

export function useInteraction() {
  const [listening, setListening] = useState(false);
  const [conversation, setConversation] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const mood_ = useMood();
  const runningRef = useRef(false);
  const motorsRef = useRef<(l: number, r: number) => void>(() => {});
  const speakRef = useRef<(t: string) => void>((t) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "id-ID"; u.rate = 1.1;
    window.speechSynthesis.speak(u);
  });
  const stopRef = useRef<() => void>(() => {});
  const buzzerRef = useRef<((mood: Mood) => void) | null>(null);
  const movesRef = useRef<MoveStep[]>([]);
  const moveIdxRef = useRef(0);
  const moveTimerRef = useRef(0);
  const sttTimerRef = useRef(0);
  const sttCleanupRef = useRef<(() => void) | undefined>(undefined);
  const sttStartRef = useRef<((onResult: (t: string) => void, onState?: (v: boolean) => void) => () => void) | undefined>(undefined);

  const messages: ChatMessage[] = [];
  for (let i = 0; i < conversation.length; i++) {
    messages.push({ role: i % 2 === 0 ? "user" : "assistant", text: conversation[i] });
  }

  const getKey = useCallback(() => {
    try { return localStorage.getItem("groq_api_key") || ""; } catch { return ""; }
  }, []);

  const execMove = useCallback(() => {
    const steps = movesRef.current;
    if (!steps.length || moveIdxRef.current >= steps.length) return;
    const s = steps[moveIdxRef.current];
    motorsRef.current(s.left, s.right);
    moveIdxRef.current++;
    moveTimerRef.current = window.setTimeout(execMove, s.dur);
  }, []);

  const playMove = useCallback((mood: Mood) => {
    clearTimeout(moveTimerRef.current);
    movesRef.current = improviseMove(mood, mood_.energy);
    moveIdxRef.current = 0;
    execMove();
  }, [mood_.energy, execMove]);

  const askGroq = useCallback(async (userText: string): Promise<string> => {
    const key = getKey();
    if (!key) return "";
    setThinking(true);
    try {
      const msgs: { role: string; content: string }[] = [
        { role: "system", content: CONVO_PROMPT },
        { role: "user", content: `(mood skrg: ${mood_.mood}, energi: ${Math.round(mood_.energy * 100)}%)` },
      ];
      for (let i = 0; i < conversation.length; i++) {
        msgs.push({ role: i % 2 === 0 ? "user" : "assistant", content: conversation[i] });
      }
      msgs.push({ role: "user", content: userText });

      const r = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: getDefaultModel(),
          messages: msgs,
          max_tokens: 120,
          temperature: 0.9,
        }),
      });
      const d = await r.json();
      return d.choices?.[0]?.message?.content?.trim() || "";
    } catch { return ""; }
    finally { setThinking(false); }
  }, [getKey, mood_, conversation]);

  const respond = useCallback(async (text: string) => {
    const reply = await askGroq(text);
    if (!reply) return;

    const moodMatch = reply.match(/\[MOOD:\s*(\w+)\s*\]/i);
    let mood: Mood = "happy";
    if (moodMatch) {
      const m = moodMatch[1] as Mood;
      if (["excited","happy","playful","curious","confused","tired"].includes(m)) mood = m;
    }

    const clean = reply.replace(/\[MOOD:[^\]]*\]/gi, "").trim();
    setConversation(prev => [...prev.slice(-20), text, clean]);
    mood_.setMood(mood);
    mood_.trigger("interact_" + (mood === "playful" ? "play" : mood === "curious" ? "serious" : mood === "happy" ? "start" : "joke"));
    speakRef.current(clean);
    buzzerRef.current?.(mood);
  }, [askGroq, mood_]);

  const listenRef = useRef<() => void>(() => {});

  const improvise = useCallback(async () => {
    const key = getKey();
    playMove(mood_.mood);
    if (!key) return;
    try {
      setThinking(true);
      const r = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: getDefaultModel(),
          messages: [
            { role: "system", content: "Lo Keinarra, robot paling kocak. Lawan bicara lo diem. Ucapin sesuatu yang random, lucu, atau sok sibuk. 1 kalimat doang. Tambahin mood di akhir: [MOOD:excited/happy/playful/curious/confused/tired]." },
            { role: "user", content: "Lawan bicara diem, gimana?" },
          ],
          max_tokens: 60,
          temperature: 0.9,
        }),
      });
      const d = await r.json();
      const reply = (d.choices?.[0]?.message?.content?.trim() || "").replace(/\[MOOD:[^\]]*\]/gi, "").trim();
      if (!reply) return;
      const moodMatch = reply.match(/\[MOOD:\s*(\w+)\s*\]/i);
      if (moodMatch) {
        const m = moodMatch[1] as Mood;
        if (["excited","happy","playful","curious","confused","tired"].includes(m)) mood_.setMood(m);
      }
      setConversation(prev => [...prev.slice(-20), reply]);
      speakRef.current(reply);
      buzzerRef.current?.(mood_.mood);
      const waitTTS = () => {
        if (!window.speechSynthesis.speaking) {
          listenRef.current();
        } else {
          setTimeout(waitTTS, 200);
        }
      };
      setTimeout(waitTTS, 500);
    } catch {} finally { setThinking(false); }
  }, [getKey, mood_, playMove]);

  const listen = useCallback(() => {
    if (!runningRef.current || !sttStartRef.current) return;
    clearTimeout(sttTimerRef.current);

    sttTimerRef.current = window.setTimeout(() => {
      sttCleanupRef.current?.();
      setListening(false);
      improvise();
    }, 15000);

    sttCleanupRef.current = sttStartRef.current(
      (text: string) => {
        clearTimeout(sttTimerRef.current);
        sttCleanupRef.current?.();
        if (!runningRef.current) return;
        setListening(false);
        respond(text);

        const waitTTS = () => {
          if (!window.speechSynthesis.speaking) {
            listenRef.current();
          } else {
            setTimeout(waitTTS, 200);
          }
        };
        setTimeout(waitTTS, 500);
      },
      (v: boolean) => setListening(v),
    );
  }, [respond, improvise]);

  listenRef.current = listen;

  const stopListening = useCallback(() => {
    clearTimeout(sttTimerRef.current);
    sttCleanupRef.current?.();
    sttCleanupRef.current = undefined;
    setListening(false);
  }, []);

  const sendText = useCallback((text: string) => {
    if (!runningRef.current || !text.trim()) return;
    respond(text.trim());
    if (!listening) {
      const waitTTS = () => {
        if (!window.speechSynthesis.speaking) {
          listen();
        } else {
          setTimeout(waitTTS, 200);
        }
      };
      setTimeout(waitTTS, 500);
    }
  }, [respond, listening, listen]);

  const start = useCallback((params: {
    onMotors: (l: number, r: number) => void;
    onBuzzer?: (mood: Mood) => void;
    onStartSTT?: (onResult: (t: string) => void, onState?: (v: boolean) => void) => () => void;
    audioManager?: { speak: (t: string) => void };
  }) => {
    // If already running, just update refs — don't clear conversation
    const wasRunning = runningRef.current;
    runningRef.current = true;
    motorsRef.current = params.onMotors;
    buzzerRef.current = params.onBuzzer ?? null;
    sttStartRef.current = params.onStartSTT;

    if (!wasRunning) {
      mood_.trigger("interact_start");
    }

    if (params.audioManager) {
      speakRef.current = (t: string) => {
        params.audioManager!.speak(t);
        const checkTTS = setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            clearInterval(checkTTS);
            playMove(mood_.mood);
          }
        }, 100);
      };
    } else {
      speakRef.current = (t: string) => {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(t);
        u.lang = "id-ID"; u.rate = 1.1;
        u.onend = () => playMove(mood_.mood);
        window.speechSynthesis.speak(u);
      };
    }

    setTimeout(() => playMove("happy"), 300);

    stopRef.current = () => {
      runningRef.current = false;
      clearTimeout(sttTimerRef.current);
      sttCleanupRef.current?.();
      sttCleanupRef.current = undefined;
      motorsRef.current(0, 0);
      clearTimeout(moveTimerRef.current);
      setListening(false);
    };
  }, [mood_, playMove]);

  const stop = useCallback(() => {
    stopRef.current();
    motorsRef.current(0, 0);
    setListening(false);
    runningRef.current = false;
    clearTimeout(moveTimerRef.current);
  }, []);

  return { start, stop, listen, stopListening, sendText, listening, running: runningRef, conversation, messages, thinking, mood: mood_ };
}
