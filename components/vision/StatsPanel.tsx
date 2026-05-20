import type { RobotState } from "@/lib/vision/types";

const stateLabels: Record<string, string> = {
  idle: "Idle",
  moving: "Moving",
  interacting: "Interacting",
  playing: "Playing",
};

interface StatsPanelProps {
  fps: number;
  objectsCount: number;
  mode: string;
  robot: RobotState;
}

export function StatsPanel({ fps, objectsCount, mode, robot }: StatsPanelProps) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h2 className="text-lg font-semibold mb-3">Stats</h2>
      <div className="space-y-1 text-sm font-mono">
        <p>FPS: <span className="text-green-400">{fps}</span></p>
        <p>Objects: <span className="text-yellow-400">{objectsCount}</span></p>
        <p>Mode: <span className="text-blue-400">{mode}</span></p>
        <p>Robot: <span className="text-cyan-400">{stateLabels[robot.state]}</span></p>
        <p>Battery: <span className={robot.battery > 20 ? "text-green-400" : "text-red-400"}>{Math.round(robot.battery)}%</span></p>
        <p>Speed: <span className="text-purple-400">{robot.speed.toFixed(1)}</span></p>
      </div>
    </div>
  );
}
