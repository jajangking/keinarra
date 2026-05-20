interface InteractionLogProps {
  logs: string[];
}

export function InteractionLog({ logs }: InteractionLogProps) {
  if (logs.length === 0) return null;

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h2 className="text-lg font-semibold mb-3">Interaction Log</h2>
      <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-xs text-zinc-400">
        {logs.map((log, i) => (
          <p key={i} className="text-green-400">{log}</p>
        ))}
      </div>
    </div>
  );
}
