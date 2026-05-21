import { useState } from "react";
import type { ScannedObject, SavedObject } from "@/lib/vision/objects";

interface ObjectScanPanelProps {
  isScanning: boolean;
  scannedObjects: ScannedObject[];
  savedObjects: SavedObject[];
  selectedForLock: string | null;
  onStartScan: () => void;
  onStopScan: () => void;
  onSelectObject: (id: string) => void;
  onLockObject: (id: string, name: string) => void;
  onDeleteSaved: (id: string) => void;
  onClearScanned: () => void;
}

export function ObjectScanPanel({
  isScanning,
  scannedObjects,
  savedObjects,
  selectedForLock,
  onStartScan,
  onStopScan,
  onSelectObject,
  onLockObject,
  onDeleteSaved,
  onClearScanned,
}: ObjectScanPanelProps) {
  const [nameInput, setNameInput] = useState<Record<string, string>>({});

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Pemindai Objek</h2>
        <button
          onClick={isScanning ? onStopScan : onStartScan}
          className={`px-3 py-1.5 rounded-md text-sm font-medium ${
            isScanning
              ? "bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30"
              : "bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-600/30"
          }`}
        >
          {isScanning ? "Berhenti" : "Mulai Pindai"}
        </button>
      </div>

      {isScanning && (
        <div className="mb-3 p-2 bg-yellow-900/20 border border-yellow-600/30 rounded-md">
          <p className="text-xs text-yellow-400 animate-pulse">
            Memindai dengan YOLO... Objek akan muncul di bawah
          </p>
        </div>
      )}

      {scannedObjects.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-zinc-400">Objek Terdeteksi ({scannedObjects.length})</label>
            <button
              onClick={onClearScanned}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Bersihkan
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {scannedObjects.map((obj) => (
              <button
                key={obj.id}
                onClick={() => onSelectObject(obj.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg border-2 transition-all text-left ${
                  selectedForLock === obj.id
                    ? "border-cyan-400 bg-cyan-900/30"
                    : "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
                }`}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold"
                  style={{ backgroundColor: obj.color + "30", color: obj.color }}
                >
                  {obj.label.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize truncate">{obj.label}</p>
                  <p className="text-[10px] text-zinc-500">
                    {Math.round(obj.confidence * 100)}% • {Math.round(obj.w)}×{Math.round(obj.h)}
                  </p>
                </div>
                {selectedForLock === obj.id && (
                  <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      {selectedForLock && (
        <div className="mb-3 p-3 bg-cyan-900/20 border border-cyan-600/30 rounded-lg">
          <p className="text-sm font-medium text-cyan-300 mb-2">Kunci Objek Terpilih</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={nameInput[selectedForLock] || ""}
              onChange={(e) => setNameInput(prev => ({ ...prev, [selectedForLock]: e.target.value }))}
              placeholder="Nama objek..."
              className="flex-1 px-2 py-1.5 bg-zinc-900 rounded border border-zinc-600 text-sm text-white placeholder-zinc-500"
              onKeyDown={(e) => {
                if (e.key === "Enter" && nameInput[selectedForLock]?.trim()) {
                  onLockObject(selectedForLock, nameInput[selectedForLock].trim());
                  setNameInput(prev => { const next = { ...prev }; delete next[selectedForLock]; return next; });
                }
              }}
              autoFocus
            />
            <button
              onClick={() => {
                if (nameInput[selectedForLock]?.trim()) {
                  onLockObject(selectedForLock, nameInput[selectedForLock].trim());
                  setNameInput(prev => { const next = { ...prev }; delete next[selectedForLock]; return next; });
                }
              }}
              disabled={!nameInput[selectedForLock]?.trim()}
              className="px-3 py-1.5 bg-cyan-600 rounded text-sm text-white disabled:opacity-50 hover:bg-cyan-500"
            >
              Kunci
            </button>
          </div>
        </div>
      )}

      {savedObjects.length > 0 && (
        <div>
          <label className="text-sm text-zinc-400 block mb-2">Objek Tersimpan ({savedObjects.length})</label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {savedObjects.map((obj) => (
              <div
                key={obj.id}
                className="flex items-center gap-3 p-2 bg-zinc-800 rounded-lg"
              >
                <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center text-lg font-bold text-zinc-300 border border-zinc-600">
                  {obj.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{obj.name}</p>
                  <p className="text-[10px] text-zinc-500">
                    {obj.seenCount > 0 ? `Terlihat ${obj.seenCount}x` : "Belum terdeteksi"}
                  </p>
                </div>
                <button
                  onClick={() => onDeleteSaved(obj.id)}
                  className="text-red-400 hover:text-red-300 text-xs px-2"
                >
                  X
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {scannedObjects.length === 0 && savedObjects.length === 0 && !isScanning && (
        <div className="text-center py-6">
          <p className="text-sm text-zinc-500">Mulai pindai untuk mendeteksi objek</p>
          <p className="text-xs text-zinc-600 mt-1">Objek akan muncul di sini untuk ditinjau dan dikunci</p>
        </div>
      )}
    </div>
  );
}
