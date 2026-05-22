import { useState, useRef, useCallback, useEffect } from "react";

interface Esp32PanelProps {
  leftSpeed: number;
  rightSpeed: number;
  buzzerOn: boolean;
  buzzerFreq: number;
  connected: boolean;
  serialLog: string[];
  onSetMotors: (left: number, right: number) => void;
  onSetBuzzer: (freq: number) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ESP32Panel({
  leftSpeed, rightSpeed, buzzerOn, buzzerFreq, connected, serialLog,
  onSetMotors, onSetBuzzer, onConnect, onDisconnect,
}: Esp32PanelProps) {
  const [leftInput, setLeftInput] = useState("0");
  const [rightInput, setRightInput] = useState("0");
  const [buzzerFreqInput, setBuzzerFreqInput] = useState("1000");
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [serialLog]);

  const handleMotorSend = () => {
    const l = parseInt(leftInput) || 0;
    const r = parseInt(rightInput) || 0;
    onSetMotors(Math.max(-255, Math.min(255, l)), Math.max(-255, Math.min(255, r)));
  };

  const handleBuzzerSend = () => {
    const f = parseInt(buzzerFreqInput) || 0;
    onSetBuzzer(Math.max(0, Math.min(5000, f)));
  };

  return (
    <div className="bg-zinc-900/60 rounded-xl p-4 border border-zinc-800/50">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-300">ESP32 Controller</h2>
        <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${connected ? "bg-green-900/60 text-green-400" : "bg-red-900/60 text-red-400"}`}>
          {connected ? "CONNECTED" : "OFFLINE"}
        </span>
      </div>

      {/* Motor Controls */}
      <div className="mb-4">
        <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Motors (Dual DC)</h3>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <label className="text-[10px] text-zinc-500 block mb-1">Left Wheel</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min="-255" max="255" value={leftInput}
                onChange={(e) => setLeftInput(e.target.value)}
                className="flex-1 accent-cyan-500 h-1"
              />
              <span className="text-xs font-mono text-zinc-400 w-12 text-right">{leftInput}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${Math.abs(Number(leftInput) || 0) / 2.55}%`,
                  marginLeft: Number(leftInput) < 0 ? "auto" : "0%",
                  marginRight: Number(leftInput) > 0 ? "auto" : "0%",
                  backgroundColor: Number(leftInput) > 0 ? "#22d3ee" : Number(leftInput) < 0 ? "#ef4444" : "#525252",
                }}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 block mb-1">Right Wheel</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min="-255" max="255" value={rightInput}
                onChange={(e) => setRightInput(e.target.value)}
                className="flex-1 accent-cyan-500 h-1"
              />
              <span className="text-xs font-mono text-zinc-400 w-12 text-right">{rightInput}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${Math.abs(Number(rightInput) || 0) / 2.55}%`,
                  marginLeft: Number(rightInput) < 0 ? "auto" : "0%",
                  marginRight: Number(rightInput) > 0 ? "auto" : "0%",
                  backgroundColor: Number(rightInput) > 0 ? "#22d3ee" : Number(rightInput) < 0 ? "#ef4444" : "#525252",
                }}
              />
            </div>
          </div>
        </div>
        <button
          onClick={handleMotorSend}
          className="w-full py-1.5 bg-cyan-600/40 hover:bg-cyan-600/60 rounded-lg text-xs font-medium text-cyan-300 transition-colors"
        >
          SET MOTORS
        </button>
      </div>

      {/* Quick Motor Commands */}
      <div className="mb-4">
        <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5">Quick Commands</h3>
        <div className="grid grid-cols-4 gap-1">
          <button onClick={() => onSetMotors(255, 255)} className="py-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded text-[10px] text-zinc-400 transition-colors">FWD</button>
          <button onClick={() => onSetMotors(-255, -255)} className="py-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded text-[10px] text-zinc-400 transition-colors">BWD</button>
          <button onClick={() => onSetMotors(200, -200)} className="py-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded text-[10px] text-zinc-400 transition-colors">LEFT</button>
          <button onClick={() => onSetMotors(-200, 200)} className="py-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded text-[10px] text-zinc-400 transition-colors">RIGHT</button>
          <button onClick={() => onSetMotors(150, 255)} className="py-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded text-[10px] text-zinc-400 transition-colors">SL L</button>
          <button onClick={() => onSetMotors(255, 150)} className="py-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded text-[10px] text-zinc-400 transition-colors">SL R</button>
          <button onClick={() => onSetMotors(0, 0)} className="py-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded text-[10px] text-zinc-400 transition-colors">STOP</button>
        </div>
      </div>

      {/* Current Status */}
      <div className="mb-4 p-2 bg-zinc-800/40 rounded-lg border border-zinc-700/30">
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div>
            <span className="text-zinc-500">Left:</span>
            <span className={`ml-1 ${leftSpeed !== 0 ? "text-cyan-400" : "text-zinc-600"}`}>{leftSpeed}</span>
          </div>
          <div>
            <span className="text-zinc-500">Right:</span>
            <span className={`ml-1 ${rightSpeed !== 0 ? "text-cyan-400" : "text-zinc-600"}`}>{rightSpeed}</span>
          </div>
          <div className="col-span-2">
            <span className="text-zinc-500">Buzzer:</span>
            <span className={`ml-1 ${buzzerOn ? "text-yellow-400" : "text-zinc-600"}`}>
              {buzzerOn ? `ON ${buzzerFreq}Hz` : "OFF"}
            </span>
          </div>
        </div>
      </div>

      {/* Buzzer Control */}
      <div className="mb-4">
        <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Buzzer</h3>
        <div className="flex gap-2 mb-2">
          <input
            type="range" min="0" max="5000" step="100" value={buzzerFreqInput}
            onChange={(e) => setBuzzerFreqInput(e.target.value)}
            className="flex-1 accent-yellow-500 h-1"
          />
          <span className="text-xs font-mono text-zinc-400 w-12 text-right">{buzzerFreqInput}Hz</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button onClick={() => onSetBuzzer(1000)} className="py-1 bg-yellow-600/30 hover:bg-yellow-600/50 rounded text-[10px] text-yellow-400 transition-colors">1kHz</button>
          <button onClick={() => onSetBuzzer(2000)} className="py-1 bg-yellow-600/30 hover:bg-yellow-600/50 rounded text-[10px] text-yellow-400 transition-colors">2kHz</button>
          <button onClick={() => onSetBuzzer(0)} className="py-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded text-[10px] text-zinc-400 transition-colors">OFF</button>
        </div>
      </div>

      {/* Serial Monitor */}
      <div>
        <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5">Serial Monitor</h3>
        <div className="bg-black/60 rounded-lg p-2 h-24 overflow-y-auto font-mono text-[9px] leading-relaxed border border-zinc-800/50">
          {serialLog.length === 0 && (
            <span className="text-zinc-600">Waiting for commands...</span>
          )}
          {serialLog.map((line, i) => (
            <div key={i} className={line.startsWith("<<") ? "text-cyan-500" : line.startsWith(">>") ? "text-green-500" : "text-zinc-500"}>
              {line}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Connect Button */}
      <button
        onClick={connected ? onDisconnect : onConnect}
        className={`w-full mt-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          connected
            ? "bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30"
            : "bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 border border-cyan-600/30"
        }`}
      >
        {connected ? "Disconnect" : "Connect ESP32 (Web Serial)"}
      </button>
    </div>
  );
}
