"use client";

import { useRef, useCallback, useState } from "react";
import { useCamera } from "@/hooks/useCamera";

const W = 640;
const H = 480;

interface ChatMsg {
  id: string;
  role: "user" | "ai";
  text: string;
}

export default function MediaPipePage() {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: "0", role: "ai", text: "Halo! Aku bisa bantu deteksi objek via kamera." },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { videoRef, canvasRef, isRunning, fps, start, stop } = useCamera({
    width: W,
    height: H,
    targetFps: 30,
    onFrame: (frame) => {
      renderOverlay(frame);
    },
  });

  const renderOverlay = useCallback((_frame: ImageData) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const parent = overlay.parentElement;
    if (!parent) return;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    if (overlay.width !== pw || overlay.height !== ph) {
      overlay.width = pw;
      overlay.height = ph;
    }
  }, []);

  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: "user", text }]);
    setChatInput("");
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: "ai",
        text: "Fitur chat AI akan segera terintegrasi dengan deteksi.",
      }]);
    }, 600);
  }, [chatInput]);

  return (
    <div className="h-screen bg-black text-zinc-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-zinc-950/90 border-b border-zinc-800/50 shrink-0">
        <div className="flex items-center gap-3">
          <a href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">←</a>
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-sm font-bold tracking-tight">MediaPipe Vision</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-500">{fps} FPS</span>
          <button
            onClick={isRunning ? stop : start}
            className={`px-3 py-1.5 rounded text-[10px] font-medium transition-colors ${
              isRunning
                ? "bg-red-600/30 text-red-400"
                : "bg-emerald-600/30 text-emerald-400"
            }`}
          >
            {isRunning ? "STOP" : "START"}
          </button>
        </div>
      </header>

      {/* Camera Feed - fullscreen mobile */}
      <div className="flex-1 relative bg-black overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
        />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        <canvas ref={canvasRef} className="hidden" />

        {!isRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
            <div className="w-16 h-16 rounded-full border-2 border-zinc-700 flex items-center justify-center mb-3">
              <svg className="w-8 h-8 text-zinc-500 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p className="text-zinc-500 text-sm font-mono">Camera off</p>
            <button
              onClick={start}
              className="mt-6 px-8 py-3 bg-emerald-600 rounded-xl text-sm font-bold text-white active:scale-95 transition-transform"
            >
              START
            </button>
          </div>
        )}

        {/* AI Chat Overlay */}
        <div className="absolute bottom-0 left-0 right-0 z-20">
          {!chatOpen ? (
            <div className="flex justify-center pb-4">
              <button
                onClick={() => setChatOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs active:scale-95 transition-transform shadow-lg"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                Tanya AI
              </button>
            </div>
          ) : (
            <>
              {/* Chat messages */}
              <div className="max-h-44 overflow-y-auto px-4 py-3 space-y-2">
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-sm ${
                      m.role === "user"
                        ? "bg-emerald-500/80 backdrop-blur text-white rounded-br-md"
                        : "bg-white/10 backdrop-blur-md text-white/90 rounded-bl-md"
                    }`}>
                      {m.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Input row */}
              <div className="flex items-center gap-2 px-3 pb-4">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendChat()}
                  placeholder="Ketik pesan..."
                  className="flex-1 bg-white/15 backdrop-blur-md rounded-xl px-4 py-3 text-xs text-white placeholder-white/40 outline-none focus:ring-1 focus:ring-white/30"
                />
                <button
                  onClick={sendChat}
                  className="w-10 h-10 rounded-xl bg-emerald-500/80 backdrop-blur flex items-center justify-center active:scale-90 transition-transform shrink-0"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
