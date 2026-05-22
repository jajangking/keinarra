"use client";

import { useRef, useState } from "react";

interface AIChatProps {
  messages: { role: "user" | "assistant"; text: string }[];
  isThinking: boolean;
  sttEnabled: boolean;
  onSttToggle: () => void;
  onSendText: (text: string) => void;
  ttsSpeaking: boolean;
}

export function AIChat({ messages, isThinking, sttEnabled, onSttToggle, onSendText, ttsSpeaking }: AIChatProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");

  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    onSendText(t);
    setText("");
    inputRef.current?.focus();
  };

  const lastMessages = messages.slice(-4);

  return (
    <div className="absolute bottom-0 left-0 right-0" style={{ zIndex: 10 }}>
      <div className="bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent px-3 pb-3 pt-10">
        {/* Conversation */}
        {lastMessages.length > 0 && (
          <div className="mb-2 space-y-1 max-h-28 overflow-y-auto scrollbar-thin">
            {lastMessages.map((m, i) => (
              <div key={i} className={`text-xs leading-snug ${m.role === "user" ? "text-zinc-300" : "text-purple-300"}`}>
                <span className="font-bold text-[9px] opacity-50 mr-1">{m.role === "user" ? ">" : "🤖"}</span>
                {m.text.length > 180 ? m.text.slice(0, 180) + "…" : m.text}
              </div>
            ))}
            {ttsSpeaking && <p className="text-yellow-400/70 text-[10px] animate-pulse">▌ Berbicara...</p>}
            {isThinking && <p className="text-yellow-500/60 animate-pulse text-[10px]">▌ Mikir...</p>}
          </div>
        )}

        {/* Input + controls */}
        <div className="flex items-center gap-1.5">
          {/* STT toggle */}
          <button
            onClick={onSttToggle}
            className={`px-2.5 py-2 rounded text-[10px] font-medium shrink-0 transition-colors ${
              sttEnabled ? "bg-cyan-600/40 text-cyan-300" : "bg-zinc-800/60 text-zinc-600"
            }`}
            title={sttEnabled ? "Suara ON" : "Suara OFF"}
          >
            {sttEnabled ? "🎤" : "🔇"}
          </button>
          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ketik pesan..."
            className="flex-1 px-3 py-2 bg-zinc-800/70 backdrop-blur-sm rounded text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-purple-500/30 border border-zinc-700/30 min-w-0"
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="px-3 py-2 rounded text-[10px] font-medium bg-purple-600/40 hover:bg-purple-600/60 text-purple-300 disabled:opacity-30 transition-colors shrink-0"
          >
            KIRIM
          </button>
        </div>
      </div>
    </div>
  );
}
