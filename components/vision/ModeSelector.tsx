import type { DetectionMode, RobotMode } from "@/lib/vision/types";

interface ModeSelectorProps {
  robotMode: RobotMode;
  detectionMode: DetectionMode;
  onRobotModeChange: (mode: RobotMode) => void;
  onDetectionModeChange: (mode: DetectionMode) => void;
}

const ROBOT_LABELS: Record<RobotMode, string> = {
  follow: "Ikuti",
  interact: "Interaksi",
  play: "Main",
};

const DETECTION_LABELS: Record<DetectionMode, string> = {
  all: "Semua",
  color: "Warna",
  motion: "Gerakan",
  object: "Objek",
  scan: "Pindai",
  yolo: "YOLO",
};

export function ModeSelector({ robotMode, detectionMode, onRobotModeChange, onDetectionModeChange }: ModeSelectorProps) {
  return (
    <>
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <h2 className="text-lg font-semibold mb-3">Mode Robot</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["follow", "interact", "play"] as RobotMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onRobotModeChange(m)}
              className={`px-3 py-2 rounded-md text-sm capitalize ${
                robotMode === m ? "bg-cyan-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {ROBOT_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <h2 className="text-lg font-semibold mb-3">Mode Deteksi</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["all", "color", "motion", "object", "scan", "yolo"] as DetectionMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onDetectionModeChange(m)}
              className={`px-3 py-2 rounded-md text-sm capitalize ${
                detectionMode === m ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {DETECTION_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
