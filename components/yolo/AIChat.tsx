"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useGroqAI } from "@/hooks/useGroqAI";
import { getDefaultModel, type VisionContext } from "@/lib/groq";

const W = 640;
const H = 480;

interface AIChatProps {
  detections: { label: string; confidence: number; x: number; y: number; w: number; h: number }[];
  fps: number;
}

export function AIChat({ detections, fps }: AIChatProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("groq_api_key") || "";
    return "";
  });
  const [model, setModel] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("groq_model") || getDefaultModel();
    return getDefaultModel();
  });

  const visionContext: VisionContext = {
    mode: "yolo", robotMode: "manual", targetColor: "red", objects: [],
    robot: { x: W / 2, y: H / 2, state: "idle", battery: 100 },
    fps,
    yoloDetections: detections.map(d => ({ ...d, distance: null })),
  };

  const {
    messages, isThinking, error, isEnabled, setIsEnabled,
    sendMessage, clearChat, cancelRequest,
  } = useGroqAI({ apiKey, model, visionContext, tools: { onSpeak: () => {} } });

  const handleSend = () => {
    const text = inputRef.current?.value.trim();
    if (text && isEnabled) { sendMessage(text); inputRef.current!.value = ""; }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0" style={{ zIndex: 10 }}>
      <div className="bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent px-3 pb-3 pt-10">
        {messages.length > 0 && (
          <div className="mb-2 space-y-1 max-h-28 overflow-y-auto">
            {messages.slice(-3).map(m => (
              <div key={m.id} className={`text-xs leading-snug ${m.role === "user" ? "text-zinc-300" : "text-purple-300"}`}>
                <span className="font-bold text-[9px] opacity-50 mr-1">{m.role === "user" ? ">" : "AI"}</span>
                {m.content.length > 150 ? m.content.slice(0, 150) + "…" : m.content}
              </div>
            ))}
            {isThinking && <p className="text-yellow-500/60 animate-pulse text-[10px]">▌</p>}
            {error && <p className="text-red-400 text-[9px] truncate">{error}</p>}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsEnabled(prev => !prev)}
            className={`px-2.5 py-2 rounded text-[10px] font-medium shrink-0 transition-colors ${isEnabled ? "bg-purple-600/40 text-purple-300" : "bg-zinc-800/60 text-zinc-600"}`}
          >
            AI {isEnabled ? "ON" : "OFF"}
          </button>
          <input
            ref={inputRef}
            type="text"
            placeholder="Perintah..."
            className="flex-1 px-3 py-2 bg-zinc-800/70 backdrop-blur-sm rounded text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-purple-500/30 border border-zinc-700/30 min-w-0"
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={!isEnabled || isThinking}
            className="px-3 py-2 rounded text-[10px] font-medium bg-purple-600/40 hover:bg-purple-600/60 text-purple-300 disabled:opacity-30 transition-colors shrink-0"
          >
            KIRIM
          </button>
          {isThinking && (
            <button onClick={cancelRequest} className="px-2 py-2 rounded text-xs bg-red-600/20 text-red-400 shrink-0">×</button>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1.5">
          <input
            type="text"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); localStorage.setItem("groq_api_key", e.target.value); }}
            placeholder="API Key"
            className="flex-1 px-2 py-1.5 bg-zinc-800/50 backdrop-blur-sm rounded text-[10px] text-zinc-500 placeholder-zinc-700 outline-none border border-zinc-800/30 min-w-0"
          />
          <select
            value={model}
            onChange={(e) => { setModel(e.target.value); localStorage.setItem("groq_model", e.target.value); }}
            className="px-2 py-1.5 bg-zinc-800/50 backdrop-blur-sm rounded text-[10px] text-zinc-500 outline-none border border-zinc-800/30"
          >
            <option value="llama-3.3-70b-versatile">70B</option>
            <option value="llama-3.1-8b-instant">8B</option>
          </select>
        </div>
      </div>
    </div>
  );
}
