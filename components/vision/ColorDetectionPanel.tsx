import { useState } from "react";
import type { SavedColor } from "@/lib/vision/saved-colors";
import { rgbToHsv } from "@/lib/vision/color";

interface ColorDetectionPanelProps {
  targetColor: string;
  colorTolerance: number;
  colorMinArea: number;
  pickingColor: boolean;
  pickedRgb: { r: number; g: number; b: number } | null;
  savedColors: SavedColor[];
  onColorChange: (c: string) => void;
  onToleranceChange: (v: number) => void;
  onMinAreaChange: (v: number) => void;
  onPickColor: () => void;
  onClearPicked: () => void;
  onSaveColor: (name: string) => void;
  onSelectSaved: (color: SavedColor) => void;
  onDeleteSaved: (id: string) => void;
}

export function ColorDetectionPanel({
  targetColor, colorTolerance, colorMinArea, pickingColor, pickedRgb, savedColors,
  onColorChange, onToleranceChange, onMinAreaChange, onPickColor, onClearPicked,
  onSaveColor, onSelectSaved, onDeleteSaved,
}: ColorDetectionPanelProps) {
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const handleSave = () => {
    if (!saveName.trim() || !pickedRgb) return;
    onSaveColor(saveName.trim());
    setSaveName("");
    setShowSaveInput(false);
  };

  const pickedHsv = pickedRgb ? rgbToHsv(pickedRgb.r, pickedRgb.g, pickedRgb.b) : null;

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h2 className="text-lg font-semibold mb-3">Deteksi Warna</h2>
      <div className="space-y-3">
        <div>
          <label className="text-sm text-zinc-400 block mb-1">Warna Preset</label>
          <div className="flex flex-wrap gap-2">
            {[
              { name: "red", bg: "#ef4444" },
              { name: "orange", bg: "#f97316" },
              { name: "yellow", bg: "#eab308" },
              { name: "green", bg: "#22c55e" },
              { name: "blue", bg: "#3b82f6" },
              { name: "cyan", bg: "#06b6d4" },
              { name: "pink", bg: "#ec4899" },
              { name: "purple", bg: "#a855f7" },
              { name: "white", bg: "#ffffff" },
              { name: "black", bg: "#000000" },
              { name: "brown", bg: "#92400e" },
              { name: "gold", bg: "#fbbf24" },
              { name: "lime", bg: "#84cc16" },
              { name: "navy", bg: "#1e3a8a" },
              { name: "magenta", bg: "#d946ef" },
              { name: "teal", bg: "#14b8a6" },
              { name: "coral", bg: "#f87171" },
              { name: "gray", bg: "#6b7280" },
              { name: "silver", bg: "#9ca3af" },
              { name: "indigo", bg: "#6366f1" },
              { name: "amber", bg: "#f59e0b" },
              { name: "olive", bg: "#65740a" },
              { name: "peach", bg: "#ffb4a2" },
              { name: "crimson", bg: "#dc143c" },
              { name: "scarlet", bg: "#ff2400" },
              { name: "maroon", bg: "#800000" },
              { name: "emerald", bg: "#10b981" },
              { name: "sky", bg: "#87ceeb" },
              { name: "azure", bg: "#007fff" },
              { name: "aqua", bg: "#00ffff" },
              { name: "lavender", bg: "#e6e6fa" },
              { name: "plum", bg: "#8e4585" },
              { name: "tangerine", bg: "#ff9966" },
              { name: "rust", bg: "#b7410e" },
              { name: "lemon", bg: "#fff44f" },
              { name: "mint", bg: "#98ff98" },
              { name: "rose", bg: "#ff007f" },
            ].map(({ name, bg }) => (
              <button
                key={name}
                onClick={() => onColorChange(name)}
                className={`w-8 h-8 rounded-full border-2 ${
                  targetColor === name ? "border-white scale-110" : "border-zinc-600"
                }`}
                style={{ backgroundColor: bg }}
                title={name}
              />
            ))}
          </div>
        </div>

        <button
          onClick={onPickColor}
          className={`w-full px-3 py-2 rounded-md text-sm ${
            pickingColor ? "bg-yellow-600 text-white animate-pulse" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          {pickingColor ? "Klik pada video untuk pilih warna..." : "Pilih Warna dari Kamera"}
        </button>

        {pickedRgb && (
          <div className="bg-zinc-800 rounded p-3 border border-zinc-700 space-y-2">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-lg border-2 border-zinc-500 shadow-lg"
                style={{ backgroundColor: `rgb(${pickedRgb.r}, ${pickedRgb.g}, ${pickedRgb.b})` }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-bold text-white">
                  RGB({pickedRgb.r}, {pickedRgb.g}, {pickedRgb.b})
                </p>
                <p className="text-xs text-zinc-400">
                  #{pickedRgb.r.toString(16).padStart(2, "0")}{pickedRgb.g.toString(16).padStart(2, "0")}{pickedRgb.b.toString(16).padStart(2, "0")} • {targetColor}
                </p>
                {pickedHsv && (
                  <p className="text-xs text-cyan-400 font-mono">
                    HSV({pickedHsv[0].toFixed(0)}, {pickedHsv[1].toFixed(0)}%, {pickedHsv[2].toFixed(0)}%)
                  </p>
                )}
              </div>
              <button
                onClick={onClearPicked}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
              >
                Hapus
              </button>
            </div>

            {showSaveInput ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Nama warna..."
                  className="flex-1 px-2 py-1 bg-zinc-900 rounded border border-zinc-600 text-sm text-white placeholder-zinc-500"
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim()}
                  className="px-3 py-1 bg-green-600 rounded text-sm text-white disabled:opacity-50"
                >
                  Simpan
                </button>
                <button
                  onClick={() => { setShowSaveInput(false); setSaveName(""); }}
                  className="px-2 py-1 bg-zinc-700 rounded text-sm text-zinc-300"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveInput(true)}
                className="w-full px-2 py-1 bg-blue-900/50 text-blue-400 rounded text-sm hover:bg-blue-900"
              >
                Simpan Warna Ini
              </button>
            )}
          </div>
        )}

        {savedColors.length > 0 && (
          <div>
            <label className="text-sm text-zinc-400 block mb-2">Warna Tersimpan</label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {savedColors.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 p-2 bg-zinc-800 rounded cursor-pointer hover:bg-zinc-750"
                  onClick={() => onSelectSaved(c)}
                >
                  <div
                    className="w-8 h-8 rounded border border-zinc-600"
                    style={{ backgroundColor: `rgb(${c.r}, ${c.g}, ${c.b})` }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-zinc-500">RGB({c.r}, {c.g}, {c.b})</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteSaved(c.id); }}
                    className="text-red-400 hover:text-red-300 text-xs px-2"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-sm text-zinc-400 block mb-1">Toleransi HSV: {colorTolerance}%</label>
          <input
            type="range" min="0" max="100" value={colorTolerance}
            onChange={(e) => onToleranceChange(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-zinc-500 mt-1">
            <span>Ketat (sempit)</span>
            <span>Longgar (lebar)</span>
          </div>
        </div>

        <div>
          <label className="text-sm text-zinc-400 block mb-1">Luas Minimum: {colorMinArea}px</label>
          <input
            type="range" min="50" max="5000" step="50" value={colorMinArea}
            onChange={(e) => onMinAreaChange(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-zinc-500 mt-1">
            <span>Blob kecil</span>
            <span>Hanya blob besar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
