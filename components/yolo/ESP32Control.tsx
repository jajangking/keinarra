"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Robot3D } from "@/components/yolo/Robot3D";
import { useMQTT } from "@/hooks/useMQTT";

interface Detection {
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ESP32ControlProps {
  leftSpeed?: number;
  rightSpeed?: number;
  buzzerOn?: boolean;
  searchState?: "idle" | "searching" | "locked" | "resting";
  detections?: Detection[];
  onMotors?: (left: number, right: number) => void;
  onBuzzer?: (pattern: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function ESP32Control({
  leftSpeed: externalLeft,
  rightSpeed: externalRight,
  buzzerOn: externalBuzzer,
  searchState = "idle" as "idle" | "searching" | "locked" | "resting",
  detections = [],
  onMotors, onBuzzer, onConnect, onDisconnect
}: ESP32ControlProps) {
  const mqtt = useMQTT();
  const [log, setLog] = useState<string[]>([]);
  const [ip, setIp] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem("mqtt_broker") ?? ""; } catch { return ""; }
  });

  const lastSentMotorsRef = useRef({ l: 0, r: 0 });

  const addLog = useCallback((msg: string) => {
    setLog(prev => [msg, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    mqtt.setCallbacks({
      onConnect: () => {
        addLog(">> MQTT TERHUBUNG");
        onConnect?.();
      },
      onDisconnect: () => {
        addLog(">> MQTT TERPUTUS");
        onDisconnect?.();
      },
      onMessage: (topic, payload) => {
        addLog(`>> ${topic}: ${payload}`);
      },
    });
  }, [mqtt, addLog, onConnect, onDisconnect]);

  const sendMotors = useCallback((l: number, r: number) => {
    l = Math.max(-255, Math.min(255, Math.round(l)));
    r = Math.max(-255, Math.min(255, Math.round(r)));
    if (l === lastSentMotorsRef.current.l && r === lastSentMotorsRef.current.r) return;
    lastSentMotorsRef.current = { l, r };
    addLog(`<< MOTOR ${l},${r}`);
    mqtt.sendMotors(l, r);
  }, [mqtt, addLog]);

  const connect = useCallback(() => {
    if (!ip.trim()) { addLog(">> Masukkan alamat broker MQTT"); return; }
    const url = ip.trim().startsWith("ws") ? ip.trim() : `ws://${ip.trim()}`;
    addLog(`>> MENYAMBUNG ${url}`);
    mqtt.setBroker(url);
    mqtt.connect(url);
  }, [ip, addLog, mqtt]);

  const toggleBuzzer = useCallback(() => {
    const pattern = buzRef.current ? "OFF" : "ON:FREQ=800";
    mqtt.sendBuzzer(pattern);
    addLog(`<< BUZZER ${pattern}`);
    if (!buzRef.current) onBuzzer?.("chirp");
    else onBuzzer?.("off");
  }, [mqtt, addLog, onBuzzer]);

  const disconnect = useCallback(() => {
    mqtt.disconnect();
    addLog(">> MQTT DIPUTUSKAN");
    onDisconnect?.();
  }, [mqtt, addLog, onDisconnect]);

  const buzRef = useRef(false);

  // Forward external motor changes to MQTT
  useEffect(() => {
    if (!mqtt.connected) return;
    const l = externalLeft ?? 0;
    const r = externalRight ?? 0;
    sendMotors(l, r);
  }, [externalLeft, externalRight, mqtt.connected, sendMotors]);

  const l = externalLeft ?? 0;
  const r = externalRight ?? 0;
  const buz = externalBuzzer ?? false;
  buzRef.current = buz;

  // Forward external buzzer changes to MQTT
  useEffect(() => {
    if (!mqtt.connected) return;
    mqtt.sendBuzzer(buz ? "ON:FREQ=800" : "OFF");
  }, [buz, mqtt.connected, mqtt]);

  const currentSpeedRef = useRef({ l: 0, r: 0 });
  const keyTargetRef = useRef({ l: 0, r: 0 });
  // Keyboard with smooth acceleration ramp
  useEffect(() => {
    const keys = new Set<string>();
    let anim = 0;
    let active = false;

    const loop = () => {
      if (!mqtt.connected) { anim = requestAnimationFrame(loop); return; }

      if (keys.size === 0) {
        if (active) {
          active = false;
          keyTargetRef.current = { l: 0, r: 0 };
          currentSpeedRef.current = { l: 0, r: 0 };
          sendMotors(0, 0);
          onMotors?.(0, 0);
        }
        anim = requestAnimationFrame(loop);
        return;
      }

      active = true;

      if (keys.has("ArrowUp") && keys.has("ArrowLeft")) { keyTargetRef.current = { l: 200, r: 255 }; }
      else if (keys.has("ArrowUp") && keys.has("ArrowRight")) { keyTargetRef.current = { l: 255, r: 200 }; }
      else if (keys.has("ArrowDown") && keys.has("ArrowLeft")) { keyTargetRef.current = { l: -200, r: -255 }; }
      else if (keys.has("ArrowDown") && keys.has("ArrowRight")) { keyTargetRef.current = { l: -255, r: -200 }; }
      else if (keys.has("ArrowUp")) { keyTargetRef.current = { l: 255, r: 255 }; }
      else if (keys.has("ArrowDown")) { keyTargetRef.current = { l: -255, r: -255 }; }
      else if (keys.has("ArrowLeft")) { keyTargetRef.current = { l: -255, r: 255 }; }
      else if (keys.has("ArrowRight")) { keyTargetRef.current = { l: 255, r: -255 }; }
      else if (keys.has(" ")) { keys.delete(" "); toggleBuzzer(); }

      const t = keyTargetRef.current;
      const c = currentSpeedRef.current;

      const step = 24;
      if (c.l !== t.l) { c.l += Math.sign(t.l - c.l) * Math.min(step, Math.abs(t.l - c.l)); }
      if (c.r !== t.r) { c.r += Math.sign(t.r - c.r) * Math.min(step, Math.abs(t.r - c.r)); }

      sendMotors(c.l, c.r);
      onMotors?.(c.l, c.r);

      anim = requestAnimationFrame(loop);
    };

    const down = (e: KeyboardEvent) => {
      keys.add(e.key);
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key);
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    anim = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(anim);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keys.clear();
      lastSentMotorsRef.current = { l: -999, r: -999 };
    };
  }, [mqtt.connected, sendMotors, toggleBuzzer, onMotors]);

  return (
    <div className="bg-zinc-900/90 backdrop-blur-md rounded-xl border border-zinc-800/50 overflow-hidden shadow-xl" style={{ width: 240 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/50">
        <span className="text-[10px] font-semibold text-zinc-400">ESP32 · MQTT</span>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${mqtt.connected ? "bg-green-400" : "bg-red-400"}`} />
          <span className={`text-[8px] font-mono ${mqtt.connected ? "text-green-400" : "text-red-400"}`}>
            {mqtt.connected ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Broker input + connect */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800/30">
        <input
          value={ip}
          onChange={e => setIp(e.target.value)}
          placeholder="192.168.x.x:9001"
          disabled={mqtt.connected}
          className="flex-1 bg-zinc-800/60 border border-zinc-700/50 rounded px-1.5 py-1 text-[8px] font-mono text-zinc-300 placeholder-zinc-700 outline-none focus:border-cyan-700/50 transition-colors"
        />
        <button
          onClick={mqtt.connected ? disconnect : connect}
          className={`px-2 py-1 rounded text-[7px] font-medium transition-colors ${
            mqtt.connected
              ? "bg-red-600/30 text-red-400 hover:bg-red-600/40"
              : "bg-cyan-600/30 text-cyan-400 hover:bg-cyan-600/40"
          }`}
        >
          {mqtt.connected ? "OFF" : "ON"}
        </button>
      </div>

      {/* 3D Robot Visualization */}
      <div className="flex items-center justify-center py-1 border-b border-zinc-800/40">
        <Robot3D
          leftSpeed={l}
          rightSpeed={r}
          buzzerOn={buz}
          connected={mqtt.connected}
          searchState={searchState}
          detections={detections}
        />
      </div>

      {/* Buttons */}
      <div className="grid grid-cols-3 gap-1 px-3 pb-2">
        <button disabled={!mqtt.connected} onTouchStart={() => sendMotors(255, 255)} onTouchEnd={() => sendMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-cyan-400 active:bg-cyan-900/40 disabled:opacity-30 transition-colors select-none touch-none">▲</button>
        <button disabled={!mqtt.connected} onClick={toggleBuzzer} className="py-1 bg-zinc-800/80 rounded text-[9px] text-yellow-400 disabled:opacity-30 transition-colors select-none touch-none">{buz ? "🔊" : "🔇"}</button>
        <button disabled={!mqtt.connected} onTouchStart={() => sendMotors(-255, -255)} onTouchEnd={() => sendMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-red-400 active:bg-red-900/40 disabled:opacity-30 transition-colors select-none touch-none">▼</button>
        <button disabled={!mqtt.connected} onTouchStart={() => sendMotors(-200, 200)} onTouchEnd={() => sendMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-cyan-400 active:bg-cyan-900/40 disabled:opacity-30 transition-colors select-none touch-none">◄</button>
        <button disabled={!mqtt.connected} onClick={() => sendMotors(0, 0)} className="py-1 bg-red-900/30 rounded text-[9px] text-red-400 disabled:opacity-30 transition-colors select-none touch-none">■</button>
        <button disabled={!mqtt.connected} onTouchStart={() => sendMotors(200, -200)} onTouchEnd={() => sendMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-cyan-400 active:bg-cyan-900/40 disabled:opacity-30 transition-colors select-none touch-none">►</button>
      </div>

      {/* Motor bars */}
      <div className="px-3 pb-2 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[7px] text-zinc-600 w-4 font-mono">L</span>
          <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-75" style={{
              width: `${Math.abs(l) / 255 * 100}%`,
              backgroundColor: l > 0 ? "#22d3ee" : l < 0 ? "#ef4444" : "#525252",
              marginLeft: l < 0 ? "auto" : "0",
              marginRight: l > 0 ? "auto" : "0",
            }} />
          </div>
          <span className="text-[8px] font-mono text-zinc-500 w-8 text-right">{l}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[7px] text-zinc-600 w-4 font-mono">R</span>
          <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-75" style={{
              width: `${Math.abs(r) / 255 * 100}%`,
              backgroundColor: r > 0 ? "#22d3ee" : r < 0 ? "#ef4444" : "#525252",
              marginLeft: r < 0 ? "auto" : "0",
              marginRight: r > 0 ? "auto" : "0",
            }} />
          </div>
          <span className="text-[8px] font-mono text-zinc-500 w-8 text-right">{r}</span>
        </div>
        {buz && (
          <div className="flex items-center gap-1 text-[7px] text-yellow-500 font-mono animate-pulse">
            <span className="w-1 h-1 rounded-full bg-yellow-500" />
            BUZZER ON
          </div>
        )}
      </div>

      {/* Monitor */}
      <div className="border-t border-zinc-800/40">
        <div className="flex items-center justify-between px-2 py-0.5">
          <span className="text-[6px] font-mono text-zinc-700">MQTT</span>
          <button onClick={() => setLog([])} className="text-[6px] px-1 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-600 transition-colors">CLR</button>
        </div>
        <div className="h-20 overflow-y-auto px-2 py-1 font-mono text-[7px] leading-relaxed">
          {log.length === 0 && <span className="text-zinc-700">—</span>}
          {log.map((line, i) => (
            <div key={i} className={line.startsWith("<<") ? "text-cyan-600" : line.startsWith(">>") ? "text-green-600" : "text-zinc-600"}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
