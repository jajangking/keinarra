import { useState } from "react";
import type { SavedColor } from "@/lib/vision/saved-colors";

interface ColorDetectionPanelProps {
  targetColor: string;
  colorThreshold: number;
  pickingColor: boolean;
  pickedRgb: { r: number; g: number; b: number } | null;
  savedColors: SavedColor[];
  onColorChange: (c: string) => void;
  onThresholdChange: (v: number) => void;
  onPickColor: () => void;
  onClearPicked: () => void;
  onSaveColor: (name: string) => void;
  onSelectSaved: (color: SavedColor) => void;
  onDeleteSaved: (id: string) => void;
}

export function ColorDetectionPanel({
  targetColor, colorThreshold, pickingColor, pickedRgb, savedColors,
  onColorChange, onThresholdChange, onPickColor, onClearPicked,
  onSaveColor, onSelectSaved, onDeleteSaved,
}: ColorDetectionPanelProps) {
  const sensitivity = Math.round(((500 - colorThreshold) / 490) * 100);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const handleSave = () => {
    if (!saveName.trim() || !pickedRgb) return;
    onSaveColor(saveName.trim());
    setSaveName("");
    setShowSaveInput(false);
  };

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h2 className="text-lg font-semibold mb-3">Color Detection</h2>
      <div className="space-y-3">
        <div>
          <label className="text-sm text-zinc-400 block mb-1">Preset Colors</label>
          <div className="flex gap-2">
            {["red", "green", "blue", "yellow", "orange"].map((c) => (
              <button
                key={c}
                onClick={() => onColorChange(c)}
                className={`w-8 h-8 rounded-full border-2 ${
                  targetColor === c ? "border-white scale-110" : "border-zinc-600"
                }`}
                style={{ backgroundColor: c }}
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
          {pickingColor ? "Klik pada video untuk pick warna..." : "Pick Color dari Kamera"}
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
              </div>
              <button
                onClick={onClearPicked}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
              >
                Clear
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
            <label className="text-sm text-zinc-400 block mb-2">Saved Colors</label>
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
          <label className="text-sm text-zinc-400 block mb-1">Sensitivity: {sensitivity}%</label>
          <input
            type="range" min="0" max="100" value={sensitivity}
            onChange={(e) => {
              const s = Number(e.target.value);
              const minArea = Math.round(500 - (s / 100) * 490);
              onThresholdChange(minArea);
            }}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-zinc-500 mt-1">
            <span>Strict</span>
            <span>Sensitive</span>
          </div>
        </div>
      </div>
    </div>
  );
}
