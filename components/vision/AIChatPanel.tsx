import { useState, useRef, useEffect } from "react";
import type { AIMessage } from "@/hooks/useGroqAI";
import { GROQ_MODELS } from "@/lib/groq";

interface AIChatPanelProps {
  messages: AIMessage[];
  isThinking: boolean;
  error: string | null;
  isEnabled: boolean;
  model: string;
  onModelChange: (model: string) => void;
  onToggle: () => void;
  onSend: (text: string) => void;
  onClear: () => void;
  onCancel: () => void;
}

const QUICK_ACTIONS = [
  { label: "Hi! 👋", text: "Hi there! How are you doing today?" },
  { label: "What do you see?", text: "What can you see right now?" },
  { label: "Follow something", text: "Can you follow an object for me?" },
  { label: "Play mode", text: "Let's play! Switch to play mode." },
  { label: "Describe scene", text: "Describe what you're seeing right now." },
];

export function AIChatPanel({
  messages, isThinking, error, isEnabled,
  model, onModelChange,
  onToggle, onSend, onClear, onCancel,
}: AIChatPanelProps) {
  const [input, setInput] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevAssistantCountRef = useRef(0);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const assistantMsgs = messages.filter(m => m.role === "assistant");
    const newAssistantCount = assistantMsgs.length;

    if (newAssistantCount > prevAssistantCountRef.current && isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }

    prevAssistantCountRef.current = newAssistantCount;
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isThinking) return;
    onSend(input.trim());
    setInput("");
    inputRef.current?.focus();
  };

  const handleQuickAction = (text: string) => {
    if (!isThinking) {
      onSend(text);
    }
  };

  const currentModel = GROQ_MODELS.find(m => m.id === model) || GROQ_MODELS.find(m => m.default) || GROQ_MODELS[0];

  if (!isEnabled) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/50 overflow-hidden">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-lg shadow-lg shadow-cyan-500/20">
              🤖
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">AI Companion</h2>
              <p className="text-xs text-zinc-500">Powered by Groq</p>
            </div>
          </div>
          <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
            Give your robot a personality. It can see through the camera, talk to you, and control itself.
          </p>
          <button
            onClick={onToggle}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg text-sm font-medium text-white hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/20"
          >
            Enable AI Companion
          </button>
        </div>
      </div>
    );
  }

  const displayMessages = messages.filter(m => m.role !== "system");
  const lastAssistantMsg = [...displayMessages].reverse().find(m => m.role === "assistant");

  return (
    <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/50 overflow-hidden flex flex-col" style={{ maxHeight: "480px" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-sm shadow-lg shadow-cyan-500/20">
              🤖
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-zinc-900 ${
              isThinking ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'
            }`} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">AI Companion</h2>
            <p className="text-[10px] text-zinc-500">
              {isThinking ? 'Thinking...' : lastAssistantMsg ? 'Online' : 'Ready to chat'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Model Selector */}
          <div className="relative">
            <button
              onClick={() => setShowModelPicker(prev => !prev)}
              className="px-2 py-1 rounded-lg text-[10px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors border border-zinc-700/50"
            >
              {currentModel.name}
            </button>
            {showModelPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
                <div className="absolute right-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-2 border-b border-zinc-800">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium px-2">Select Model</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {GROQ_MODELS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { onModelChange(m.id); setShowModelPicker(false); }}
                        className={`w-full px-3 py-2.5 text-left hover:bg-zinc-800 transition-colors flex items-center gap-2 ${
                          model === m.id ? 'bg-cyan-900/20' : ''
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${model === m.id ? 'bg-cyan-400' : 'bg-zinc-600'}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-200 truncate">{m.name}</p>
                          <p className="text-[10px] text-zinc-500">{m.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClear}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Clear chat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
            title="Disable AI"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3" style={{ minHeight: "200px", maxHeight: "300px" }}>
        {displayMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
              <span className="text-xl">💬</span>
            </div>
            <p className="text-sm text-zinc-400 font-medium">Say hi to your robot!</p>
            <p className="text-xs text-zinc-600 mt-1 max-w-[200px]">It can see through the camera and control itself</p>
          </div>
        )}

        {displayMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-br-md"
                  : "bg-zinc-800/80 text-zinc-200 rounded-bl-md"
              }`}
            >
              {msg.content.split("\n").map((line, i) => (
                <p key={i} className={i > 0 ? "mt-1" : ""}>{line}</p>
              ))}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-zinc-800/80 rounded-2xl rounded-bl-md px-4 py-3 text-zinc-400">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="bg-red-900/20 border border-red-800/50 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-xs text-red-300 max-w-[85%]">
              {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {displayMessages.length <= 2 && !isThinking && (
        <div className="px-3 pb-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.text}
                onClick={() => handleQuickAction(action.text)}
                className="flex-shrink-0 px-3 py-1.5 bg-zinc-800/60 hover:bg-zinc-700/80 rounded-full text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-700/50"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-1 border-t border-zinc-800/80">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Talk to your robot..."
            className="flex-1 px-3.5 py-2.5 bg-zinc-800/60 rounded-xl border border-zinc-700/50 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
            disabled={isThinking}
          />
          {isThinking ? (
            <button
              onClick={onCancel}
              className="px-3.5 py-2.5 bg-red-600/80 hover:bg-red-500 rounded-xl text-sm text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="px-3.5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl text-sm text-white disabled:opacity-30 hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
