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
  onControlMotors?: (left: number, right: number, durationMs?: number) => string | void;
  onControlBuzzer?: (frequency: number, durationMs?: number) => string | void;
}

interface UseGroqAIOptions {
  apiKey: string;
  model: string;
  visionContext: VisionContext;
  tools: ToolCallbacks;
}

function executeTool(tc: { function: { name: string; arguments: string } }, tools: ToolCallbacks): string {
  const args = JSON.parse(tc.function.arguments);
  switch (tc.function.name) {
    case "set_robot_mode":
      tools.onSetRobotMode?.(args.mode);
      return `Robot mode set to ${args.mode}`;
    case "set_detection_mode":
      tools.onSetDetectionMode?.(args.mode);
      return `Detection mode set to ${args.mode}`;
    case "set_target_color": {
      if (args.rgb) {
        const [r, g, b] = args.rgb.split(",").map(Number);
        tools.onSetTargetColor?.(args.color || "custom", { r, g, b });
        return `Target color set to RGB(${r},${g},${b})`;
      }
      tools.onSetTargetColor?.(normalizeColor(args.color));
      return `Target color set to ${args.color}`;
    }
    case "set_color_tolerance":
      tools.onSetColorTolerance?.(args.tolerance);
      return `Color tolerance set to ${args.tolerance}`;
    case "set_color_min_area":
      tools.onSetColorMinArea?.(args.minArea);
      return `Color min area set to ${args.minArea}`;
    case "set_motion_threshold":
      tools.onSetMotionThreshold?.(args.threshold);
      return `Motion threshold set to ${args.threshold}`;
    case "set_motion_min_area":
      tools.onSetMotionMinArea?.(args.minArea);
      return `Motion min area set to ${args.minArea}`;
    case "set_edge_threshold":
      tools.onSetEdgeThreshold?.(args.threshold);
      return `Edge threshold set to ${args.threshold}`;
    case "set_object_min_area":
      tools.onSetObjectMinArea?.(args.minArea);
      return `Object min area set to ${args.minArea}`;
    case "speak":
      tools.onSpeak?.(args.text);
      return `Spoken: ${args.text}`;
    case "start_object_scan":
      tools.onStartScan?.();
      return "Object scan started";
    case "stop_object_scan":
      tools.onStopScan?.();
      return "Object scan stopped";
    case "lock_object":
      tools.onLockObject?.(args.scanId, args.name);
      return `Object ${args.name} locked`;
    case "track_saved_object":
      tools.onTrackSavedObject?.(args.name);
      return `Tracking saved object: ${args.name}`;
    case "control_motors": {
      const result = tools.onControlMotors?.(Number(args.left), Number(args.right), args.duration_ms != null ? Number(args.duration_ms) : undefined);
      return result || `Motors set to L=${args.left} R=${args.right}${args.duration_ms ? ` for ${args.duration_ms}ms` : ""}`;
    }
    case "control_buzzer": {
      const result = tools.onControlBuzzer?.(Number(args.frequency), args.duration_ms != null ? Number(args.duration_ms) : undefined);
      return result || (args.frequency > 0 ? `Buzzer ON at ${args.frequency}Hz${args.duration_ms ? ` for ${args.duration_ms}ms` : ""}` : "Buzzer OFF");
    }
    default:
      return `Unknown tool: ${tc.function.name}`;
  }
}

const GROQ_API_BODY = (model: string, messages: unknown[]) => ({
  model,
  messages,
  tools: AI_TOOLS,
  max_completion_tokens: 500,
});

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

  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { toolsRef.current = tools; }, [tools]);
  useEffect(() => { visionContextRef.current = visionContext; }, [visionContext]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

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
    const apiMessages: unknown[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: ctx },
      ...messagesRef.current.slice(-20).map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: text.trim() },
    ];

    let finalText = "";

    try {
      for (let round = 0; round < 3; round++) {
        const res = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKeyRef.current}`,
          },
          body: JSON.stringify(GROQ_API_BODY(modelRef.current, apiMessages)),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Groq API error ${res.status}: ${errBody}`);
        }

        const data = await res.json();
        const choice = data.choices[0]?.message;
        if (!choice) throw new Error("Empty response from Groq");

        if (choice.tool_calls && choice.tool_calls.length > 0) {
          const assistantMsg = {
            role: "assistant" as const,
            content: choice.content || null,
            tool_calls: choice.tool_calls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
          };
          apiMessages.push(assistantMsg);

          const newCtx = buildVisionContextMessage(visionContextRef.current);

          for (const tc of choice.tool_calls) {
            const result = executeTool(tc, toolsRef.current);
            apiMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: result,
            });
          }

          apiMessages.push({
            role: "system",
            content: `[VISION UPDATE] ${newCtx}`,
          });

          if (choice.content) {
            finalText = choice.content;
          }
        } else {
          finalText = choice.content || finalText;
          break;
        }
      }

      if (finalText.trim()) {
        const assistantMsg: AIMessage = {
          id: `msg-${Date.now()}-assistant`,
          role: "assistant",
          content: finalText.trim(),
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
    const interval = setInterval(injectVisionContext, 10000);
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
    return () => abortRef.current?.abort();
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
