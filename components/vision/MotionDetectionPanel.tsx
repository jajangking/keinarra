interface MotionDetectionPanelProps {
  motionThreshold: number;
  motionMinArea: number;
  onThresholdChange: (v: number) => void;
  onMinAreaChange: (v: number) => void;
}

export function MotionDetectionPanel({ motionThreshold, motionMinArea, onThresholdChange, onMinAreaChange }: MotionDetectionPanelProps) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h2 className="text-lg font-semibold mb-3">Deteksi Gerakan</h2>
      <div className="space-y-3">
        <div>
          <label className="text-sm text-zinc-400 block mb-1">Batas Perbedaan Pixel: {motionThreshold}</label>
          <input
            type="range" min="5" max="100" value={motionThreshold}
            onChange={(e) => onThresholdChange(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-zinc-500 mt-1">
            <span>Sensitif</span>
            <span>Ketat</span>
          </div>
        </div>
        <div>
          <label className="text-sm text-zinc-400 block mb-1">Luas Minimum: {motionMinArea}px</label>
          <input
            type="range" min="100" max="5000" step="100" value={motionMinArea}
            onChange={(e) => onMinAreaChange(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-zinc-500 mt-1">
            <span>Gerakan kecil</span>
            <span>Hanya gerakan besar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
