import type { PlayTarget } from "@/lib/vision/types";

interface PlayModePanelProps {
  score: number;
  playTargets: PlayTarget[];
  onSpawnTarget: () => void;
  onClearTargets: () => void;
}

export function PlayModePanel({ score, playTargets, onSpawnTarget, onClearTargets }: PlayModePanelProps) {
  if (playTargets.length === 0 && score === 0) return null;

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h2 className="text-lg font-semibold mb-3">Mode Main</h2>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-zinc-400">Skor</span>
          <span className="text-xl font-bold text-yellow-400">{score}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onSpawnTarget} className="flex-1 px-3 py-2 bg-yellow-600 rounded-md hover:bg-yellow-700 text-sm">
            + Target
          </button>
          <button onClick={onClearTargets} className="flex-1 px-3 py-2 bg-zinc-700 rounded-md hover:bg-zinc-600 text-sm">
            Bersihkan
          </button>
        </div>
      </div>
    </div>
  );
}
