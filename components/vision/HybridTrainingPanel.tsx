import type { HybridProfile, HybridSample } from "@/lib/vision/types";

interface HybridTrainingPanelProps {
  phase: "idle" | "training" | "testing" | "improving" | "done";
  samples: HybridSample[];
  profileName: string;
  activeProfile: HybridProfile | null;
  profiles: HybridProfile[];
  dragRegion: { x: number; y: number; w: number; h: number } | null;
  detectedInRegion: boolean;
  improveIteration: number;
  onNameChange: (name: string) => void;
  onCaptureSample: () => void;
  onRemoveSample: (id: string) => void;
  onTrain: () => void;
  onSelectProfile: (profile: HybridProfile) => void;
  onDeleteProfile: (id: string) => void;
  onCancel: () => void;
  onStartTraining: () => void;
}

export function HybridTrainingPanel({
  phase, samples, profileName, activeProfile, profiles,
  dragRegion, detectedInRegion, improveIteration,
  onNameChange, onCaptureSample, onRemoveSample, onTrain,
  onSelectProfile, onDeleteProfile, onCancel, onStartTraining,
}: HybridTrainingPanelProps) {
  if (phase === "idle" && profiles.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <h2 className="text-lg font-semibold mb-3">Hybrid Detection</h2>
        <p className="text-sm text-zinc-400 mb-3">Train a profile to detect your object using color + shape analysis.</p>
        <button
          onClick={onStartTraining}
          className="w-full px-3 py-2 bg-blue-600 rounded text-sm text-white hover:bg-blue-500"
        >
          Start Training
        </button>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h2 className="text-lg font-semibold mb-3">Hybrid Detection</h2>

      {phase === "idle" && profiles.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {profiles.map(p => (
              <div
                key={p.id}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                  activeProfile?.id === p.id ? "bg-blue-900/50 border border-blue-500" : "bg-zinc-800"
                }`}
                onClick={() => onSelectProfile(p)}
              >
                {p.thumbnail && <img src={p.thumbnail} alt={p.name} className="w-10 h-8 rounded object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-zinc-500">{p.samples.length} samples</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteProfile(p.id); }}
                  className="text-red-400 hover:text-red-300 text-xs px-2"
                >
                  X
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={onStartTraining}
            className="w-full px-3 py-2 bg-blue-600 rounded text-sm text-white hover:bg-blue-500"
          >
            Train New Profile
          </button>
        </div>
      )}

      {(phase === "training" || phase === "testing" || phase === "improving") && (
        <div className="space-y-3">
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Object Name</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. kunci rumah"
              className="w-full px-3 py-2 bg-zinc-800 rounded border border-zinc-600 text-white placeholder-zinc-500"
            />
          </div>

          <p className="text-xs text-zinc-400">
            {phase === "training" && "Drag pada video untuk seleksi objek, lalu klik Capture."}
            {phase === "testing" && "Testing detection..."}
            {phase === "improving" && `Auto-improving profile (iteration ${improveIteration})...`}
          </p>

          {dragRegion && (
            <div className="bg-zinc-800 rounded p-2 text-xs font-mono text-zinc-300">
              Region: {dragRegion.x}, {dragRegion.y} ({dragRegion.w}x{dragRegion.h})
            </div>
          )}

          <button
            onClick={onCaptureSample}
            disabled={!dragRegion}
            className="w-full px-3 py-2 bg-blue-600 rounded text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500"
          >
            Capture Sample ({samples.length}/5)
          </button>

          {samples.length > 0 && (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {samples.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 p-1 bg-zinc-800 rounded text-xs">
                  <span className="text-zinc-400 w-6">#{i + 1}</span>
                  <span className="text-zinc-300">AR:{s.aspectRatio.toFixed(1)}</span>
                  <span className="text-zinc-300">Edge:{Math.round(s.edgeDensity * 100)}%</span>
                  <span className="text-zinc-300">Solid:{s.solidity.toFixed(2)}</span>
                  <button
                    onClick={() => onRemoveSample(s.id)}
                    className="ml-auto text-red-400 hover:text-red-300"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onTrain}
              disabled={samples.length < 2 || !profileName.trim()}
              className="flex-1 px-3 py-2 bg-green-600 rounded text-sm text-white disabled:opacity-50 hover:bg-green-500"
            >
              {phase === "improving" ? "Improving..." : `Train & Test (${samples.length} samples)`}
            </button>
            <button
              onClick={onCancel}
              className="px-3 py-2 bg-zinc-700 rounded text-sm text-zinc-300 hover:bg-zinc-600"
            >
              Cancel
            </button>
          </div>

          {phase === "testing" && (
            <div className={`p-2 rounded text-sm text-center ${detectedInRegion ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
              {detectedInRegion ? "Detected! Profile OK." : "Not detected. Click Train again to auto-improve."}
            </div>
          )}
        </div>
      )}

      {phase === "done" && activeProfile && (
        <div className="space-y-2">
          <p className="text-green-400 text-sm font-semibold">Profile "{activeProfile.name}" ready!</p>
          <div className="bg-zinc-800 rounded p-2 text-xs space-y-1">
            <p className="text-zinc-300">HSV: [{activeProfile.hMin.toFixed(0)}-{activeProfile.hMax.toFixed(0)}, {activeProfile.sMin.toFixed(0)}-{activeProfile.sMax.toFixed(0)}, {activeProfile.vMin.toFixed(0)}-{activeProfile.vMax.toFixed(0)}]</p>
            <p className="text-zinc-300">AR: {activeProfile.avgAspectRatio.toFixed(1)}±{activeProfile.aspectRatioTolerance.toFixed(1)}</p>
            <p className="text-zinc-300">Edge: {Math.round(activeProfile.avgEdgeDensity * 100)}%±{Math.round(activeProfile.edgeDensityTolerance * 100)}%</p>
            <p className="text-zinc-300">Solid: {activeProfile.avgSolidity.toFixed(2)}±{activeProfile.solidityTolerance.toFixed(2)}</p>
          </div>
          <button
            onClick={onCancel}
            className="w-full px-3 py-2 bg-zinc-700 rounded text-sm text-zinc-300 hover:bg-zinc-600"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
