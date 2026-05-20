interface MotionDetectionPanelProps {
  motionThreshold: number;
  minMotionArea: number;
  onThresholdChange: (v: number) => void;
  onMinAreaChange: (v: number) => void;
}

export function MotionDetectionPanel({ motionThreshold, minMotionArea, onThresholdChange, onMinAreaChange }: MotionDetectionPanelProps) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h2 className="text-lg font-semibold mb-3">Motion Detection</h2>
      <div className="space-y-3">
        <div>
          <label className="text-sm text-zinc-400 block mb-1">Sensitivity: {motionThreshold}</label>
          <input
            type="range" min="5" max="100" value={motionThreshold}
            onChange={(e) => onThresholdChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="text-sm text-zinc-400 block mb-1">Min Area: {minMotionArea}</label>
          <input
            type="range" min="100" max="5000" value={minMotionArea}
            onChange={(e) => onMinAreaChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
