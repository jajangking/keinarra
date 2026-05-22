"use client";

import { useRef, useCallback } from "react";
import { GROQ_API_URL, getDefaultModel } from "@/lib/groq";

export function useSearchVoice() {
  const prevStateRef = useRef<"idle" | "searching" | "locked" | "resting">("idle");
  const talkingRef = useRef(false);
  const keyRef = useRef("");

  const getKey = useCallback(() => {
    if (keyRef.current) return keyRef.current;
    try {
      const k = localStorage.getItem("groq_api_key") || "";
      keyRef.current = k;
      return k;
    } catch { return ""; }
  }, []);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "id-ID";
    u.rate = 1.1;
    u.pitch = 1.0;
    u.onend = () => { talkingRef.current = false; };
    u.onerror = () => { talkingRef.current = false; };
    talkingRef.current = true;
    window.speechSynthesis.speak(u);
  }, []);

  const askGroq = useCallback(async (prompt: string) => {
    const key = getKey();
    if (!key) return "";
    try {
      const r = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: getDefaultModel(),
          messages: [
            { role: "system", content: "Kamu Keinarra, si robot pencari yang centil, random, dan suka ngaco. Jawab 1 kalimat doang, santai, gak baku, kayak ngobrol sama temen. Bahasa Indonesia gaul, boleh pake bahasa sehari-hari." },
            { role: "user", content: prompt },
          ],
          max_tokens: 60,
          temperature: 0.9,
        }),
      });
      const d = await r.json();
      return d.choices?.[0]?.message?.content?.trim() || "";
    } catch {
      return "";
    }
  }, [getKey]);

  const trigger = useCallback(async ({ searchState, onSpeak, skipSpeak }: { searchState: "idle" | "searching" | "locked" | "resting"; onSpeak?: (text: string) => void; skipSpeak?: boolean }) => {
    if (talkingRef.current) return;
    const prev = prevStateRef.current;
    prevStateRef.current = searchState;

    // Skip on mount or same state
    if (prev === searchState) return;

    // Skip speaking (just update ref) when interaction handles it
    if (skipSpeak) return;

    let prompt = "";
    if (prev === "idle" && searchState === "searching") {
      prompt = "Kamu baru mulai cari manusia. Ucapin sesuatu yang unik, random, lucu, gak melulu 'hai dimana'. Bisa sok sibuk, bisa sok detektif, bisa ngomong sendiri. Yang penting santai dan gak kaku.";
    } else if (prev === "searching" && searchState === "locked") {
      prompt = "Kamu baru nemu manusia yang dicari! Jangan jawab klise. Bisa sok cool, bisa lebay, bisa sok kaget. Yang penting ekspresif dan beda dari biasanya.";
    } else if (prev === "locked" && searchState === "searching") {
      prompt = "Manusianya ilang lagi. Jangan sedih. Bisa bingung, bisa heran, bisa sok sibuk nyari. Yang penting ringan dan gak bikin suasana jadi sedih.";
    } else if (prev === "locked" && searchState === "idle") {
      prompt = "Selesai interaksi, balik diam. Ucapin sesuatu yang santai, bisa sok sibuk, atau kayak orang bosen. Gak usah formal.";
    } else if (prev === "searching" && searchState === "resting") {
      prompt = "Kamu capek banget setelah nyari-nyari. Ucapin sesuatu yang mengeluh tapi lucu, kayak 'capek ah... istirahat dulu'. Sok dramatis dikit.";
    } else if (prev === "resting" && searchState === "searching") {
      prompt = "Kamu selesai istirahat, lanjut nyari lagi. Ucapin sesuatu yang males-malesan tapi tetap jalan, kayak 'yaudah lanjut deh... males tapi yaudah'. Santai.";
    } else if (prev === "searching" && searchState === "idle") {
      prompt = "Gagal nemu orang, balik diam. Bisa sok santai, bisa sok lupa, atau ngomong random. Yang penting gak kaku.";
    }

    if (!prompt) return;

    const emitSpeak = (text: string) => {
      speak(text);
      onSpeak?.(text);
    };

    const groqKey = getKey();
    if (groqKey) {
      const response = await askGroq(prompt);
      if (response) { emitSpeak(response); return; }
    }

    // Fallback random phrases if no API key or Groq fails
    const fallbacks: Record<string, string[]> = {
      "idle→searching": [
        "Halo halo.. ada apaeee? Siapa disanaa?",
        "Awas ya, gue dateng nih!",
        "Mulai patroli.. ciiit ciiit ciiit",
        "Detektif Keinarra meluncur!",
        "Hmm, mana nih orangnya?",
      ],
      "searching→locked": [
        "Nah gitu dong! Kena lo!",
        "Wih keren banget sih ini orang!",
        "Gapapa lo liat-liat, gue juga liat lo",
        "Yaudah kita temenan sekarang!",
        "Stop! Kamu dalam pengawasanku!",
      ],
      "locked→searching": [
        "Lho? mana lagi nih? Sembunyi ya?",
        "Jangan kabur gue kan lucu!",
        "Awas aja ya ntar ketemu lagi!",
        "Kucing-kucingan nih ye?",
      ],
      "locked→idle": [
        "Yaudah kalo gitu, gue pergi dulu",
        "Konci.. dadah ya!",
        "Sip, misi selesai. Istirahat!",
      ],
      "searching→idle": [
        "Yah males ah.. gue bobo dulu",
        "Oke gue menyerah. Lain kali!",
      ],
    };

    const key = `${prev}→${searchState}`;
    const list = fallbacks[key];
    if (list) {
      const msg = list[Math.floor(Math.random() * list.length)];
      emitSpeak(msg);
    }
  }, [askGroq, speak, getKey]);

  return { trigger, speaking: talkingRef };
}
