import { useRef, useState, useCallback, useEffect } from "react";
import { GROQ_API_URL, SYSTEM_PROMPT, AI_TOOLS, buildVisionContextMessage, normalizeColor, type VisionContext } from "@/lib/groq";

export interface AIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

interface ToolCallbacks {
  onSetRobotMode?: (mode: string) => void;
  onSetDetectionMode?: (mode: string) => void;
  onSetTargetColor?: (color: string, rgb?: { r: number; g: number; b: number }) => void;
  onSetColorTolerance?: (tolerance: number) => void;
  onSetColorMinArea?: (minArea: number) => void;
  onSetMotionThreshold?: (threshold: number) => void;
  onSetMotionMinArea?: (minArea: number) => void;
  onSetEdgeThreshold?: (threshold: number) => void;
  onSetObjectMinArea?: (minArea: number) => void;
  onSpeak?: (text: string) => void;
  onStartScan?: () => void;
  onStopScan?: () => void;
  onLockObject?: (scanId: string, name: string) => void;
  onTrackSavedObject?: (name: string) => void;
}

interface UseGroqAIOptions {
  apiKey: string;
  model: string;
  visionContext: VisionContext;
  tools: ToolCallbacks;
}

export function useGroqAI({ apiKey, model, visionContext, tools }: UseGroqAIOptions) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);

  const messagesRef = useRef<AIMessage[]>([]);
  const apiKeyRef = useRef(apiKey);
  const modelRef = useRef(model);
  const toolsRef = useRef(tools);
  const visionContextRef = useRef(visionContext);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  useEffect(() => {
    toolsRef.current = tools;
  }, [tools]);

  useEffect(() => {
    visionContextRef.current = visionContext;
  }, [visionContext]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!apiKeyRef.current || !text.trim()) return;

    const userMsg: AIMessage = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);
    setError(null);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const ctx = buildVisionContextMessage(visionContextRef.current);
    const apiMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "system" as const, content: ctx },
      ...messagesRef.current.slice(-20).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: text.trim() },
    ];

    try {
      const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKeyRef.current}`,
        },
        body: JSON.stringify({
          model: modelRef.current,
          messages: apiMessages,
          tools: AI_TOOLS,
          max_completion_tokens: 500,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Groq API error ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      const choice = data.choices[0]?.message;
      if (!choice) throw new Error("Empty response from Groq");

      let assistantText = choice.content || "";

      if (choice.tool_calls) {
        for (const tc of choice.tool_calls) {
          const args = JSON.parse(tc.function.arguments);
          switch (tc.function.name) {
            case "set_robot_mode":
              toolsRef.current.onSetRobotMode?.(args.mode);
              break;
            case "set_detection_mode":
              toolsRef.current.onSetDetectionMode?.(args.mode);
              break;
            case "set_target_color": {
              if (args.rgb) {
                const [r, g, b] = args.rgb.split(",").map(Number);
                toolsRef.current.onSetTargetColor?.(args.color || "custom", { r, g, b });
              } else {
                toolsRef.current.onSetTargetColor?.(normalizeColor(args.color));
              }
              break;
            }
            case "set_color_tolerance":
              toolsRef.current.onSetColorTolerance?.(args.tolerance);
              break;
            case "set_color_min_area":
              toolsRef.current.onSetColorMinArea?.(args.minArea);
              break;
            case "set_motion_threshold":
              toolsRef.current.onSetMotionThreshold?.(args.threshold);
              break;
            case "set_motion_min_area":
              toolsRef.current.onSetMotionMinArea?.(args.minArea);
              break;
            case "set_edge_threshold":
              toolsRef.current.onSetEdgeThreshold?.(args.threshold);
              break;
            case "set_object_min_area":
              toolsRef.current.onSetObjectMinArea?.(args.minArea);
              break;
            case "speak":
              assistantText = assistantText ? `${assistantText}\n\n${args.text}` : args.text;
              toolsRef.current.onSpeak?.(args.text);
              break;
            case "start_object_scan":
              toolsRef.current.onStartScan?.();
              break;
            case "stop_object_scan":
              toolsRef.current.onStopScan?.();
              break;
            case "lock_object":
              toolsRef.current.onLockObject?.(args.scanId, args.name);
              break;
            case "track_saved_object":
              toolsRef.current.onTrackSavedObject?.(args.name);
              break;
          }
        }
      }

      if (assistantText.trim()) {
        const assistantMsg: AIMessage = {
          id: `msg-${Date.now()}-assistant`,
          role: "assistant",
          content: assistantText.trim(),
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setIsThinking(false);
    }
  }, []);

  const injectVisionContext = useCallback(() => {
    const ctx = buildVisionContextMessage(visionContextRef.current);
    const visionMsg: AIMessage = {
      id: `vision-${Date.now()}`,
      role: "system",
      content: ctx,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, visionMsg]);
  }, []);

  useEffect(() => {
    if (!isEnabled) return;

    const interval = setInterval(() => {
      injectVisionContext();
    }, 10000);

    return () => clearInterval(interval);
  }, [isEnabled, injectVisionContext]);

  const clearChat = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
  }, []);

  const cancelRequest = useCallback(() => {
    abortRef.current?.abort();
    setIsThinking(false);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    messages,
    isThinking,
    error,
    isEnabled,
    setIsEnabled,
    sendMessage,
    clearChat,
    cancelRequest,
    injectVisionContext,
  };
}
