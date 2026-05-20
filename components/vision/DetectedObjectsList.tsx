import type { DetectedObject } from "@/lib/vision/types";

interface DetectedObjectsListProps {
  objects: DetectedObject[];
}

export function DetectedObjectsList({ objects }: DetectedObjectsListProps) {
  if (objects.length === 0) return null;

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h2 className="text-lg font-semibold mb-3">Detected Objects</h2>
      <div className="space-y-2 max-h-48 overflow-y-auto font-mono text-sm">
        {objects.map((obj, i) => (
          <div key={i} className="bg-zinc-800 rounded p-2">
            <div>
              <span className="text-cyan-400">{obj.id}</span>
              <span className="text-green-400 ml-1">{obj.label}</span>
            </div>
            <span className="text-zinc-500 text-xs">
              ({obj.x}, {obj.y}) {obj.w}x{obj.h}
              {obj.similarity !== undefined && ` (${Math.round(obj.similarity)}%)`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
