import type { DebugLogEntry } from "@/lib/vision/types";

interface DebugLogPanelProps {
  logs: DebugLogEntry[];
}

export function DebugLogPanel({ logs }: DebugLogPanelProps) {
  if (logs.length === 0) return null;

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h2 className="text-lg font-semibold mb-3">Debug Log</h2>
      <div className="space-y-2 max-h-64 overflow-y-auto font-mono text-xs">
        {logs.map((log, i) => (
          <div key={i} className="bg-zinc-800 rounded p-2">
            <p className="text-green-400">{log.message || `${log.type} (frame ${log.frame})`}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
