"use client";

import { useState, useCallback } from "react";
import type { TrainingSample } from "@/lib/vision/types";
import {
  addTrainingSample,
  removeTrainingSample,
  clearTrainingSamples,
  knnPredict,
} from "@/lib/vision/classifier";

interface TrainingPanelProps {
  samples: TrainingSample[];
  onSamplesChange: (samples: TrainingSample[]) => void;
  onCapture: () => void;
  capturedPreview: string | null;
  labelInput: string;
  onLabelChange: (label: string) => void;
  onSaveSample: (label: string) => void;
  predicting: boolean;
  prediction: { label: string; confidence: number } | null;
}

export function TrainingPanel({
  samples,
  onSamplesChange,
  onCapture,
  capturedPreview,
  labelInput,
  onLabelChange,
  onSaveSample,
  predicting,
  prediction,
}: TrainingPanelProps) {
  const [filterLabel, setFilterLabel] = useState("");

  const groupedLabels = samples.reduce<Record<string, number>>((acc, s) => {
    acc[s.label] = (acc[s.label] || 0) + 1;
    return acc;
  }, {});

  const filtered = filterLabel
    ? samples.filter(s => s.label === filterLabel)
    : samples;

  const handleClear = useCallback(() => {
    clearTrainingSamples();
    onSamplesChange([]);
  }, [onSamplesChange]);

  const handleDelete = useCallback((id: string) => {
    const updated = removeTrainingSample(id);
    onSamplesChange(updated);
  }, [onSamplesChange]);

  return (
    <div className="bg-zinc-900/60 rounded-xl p-4 border border-zinc-800/50">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-300">Custom Training</h2>
        <div className="flex items-center gap-2">
          {samples.length > 0 && (
            <span className="text-[10px] font-mono text-zinc-500">{samples.length} sample{ samples.length !== 1 ? "s" : ""}</span>
          )}
          <span className={`w-2 h-2 rounded-full ${predicting ? "bg-green-400 animate-pulse" : "bg-zinc-600"}`} />
        </div>
      </div>

      {/* Capture & save */}
      <div className="space-y-2 mb-3">
        <div className="flex gap-2">
          <button
            onClick={onCapture}
            className="flex-1 px-3 py-2 bg-blue-600/60 hover:bg-blue-600/80 rounded-lg text-xs font-medium text-blue-200 transition-colors"
          >
            {capturedPreview ? "Recapture" : "Capture Object"}
          </button>
        </div>
        {capturedPreview && (
          <div className="flex gap-2 items-start">
            <div className="w-16 h-16 rounded-lg border border-zinc-700/50 overflow-hidden shrink-0">
              <img src={capturedPreview} alt="captured" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 flex gap-1.5">
              <input
                type="text"
                value={labelInput}
                onChange={(e) => onLabelChange(e.target.value)}
                placeholder="Nama (contoh: botol)"
                className="flex-1 px-2 py-1.5 bg-zinc-800/60 rounded-lg border border-zinc-700/30 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-blue-500/30"
                onKeyDown={(e) => { if (e.key === "Enter" && labelInput.trim()) onSaveSample(labelInput.trim()); }}
              />
              <button
                onClick={() => { if (labelInput.trim()) onSaveSample(labelInput.trim()); }}
                disabled={!labelInput.trim()}
                className="px-3 py-1.5 bg-green-600/60 hover:bg-green-600/80 disabled:opacity-40 rounded-lg text-xs font-medium text-green-200 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats per label */}
      {Object.keys(groupedLabels).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(groupedLabels).map(([label, count]) => (
            <button
              key={label}
              onClick={() => setFilterLabel(prev => prev === label ? "" : label)}
              className={`px-2 py-0.5 rounded text-[9px] font-mono transition-colors ${
                filterLabel === label
                  ? "bg-blue-600/50 text-blue-200"
                  : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60"
              }`}
            >
              {label}:{count}
            </button>
          ))}
        </div>
      )}

      {/* Prediction */}
      {prediction && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-cyan-900/30 border border-cyan-500/30">
          <p className="text-xs font-mono text-cyan-300">
            Prediksi: <strong>{prediction.label}</strong>
          </p>
          <p className="text-[10px] font-mono text-cyan-400/60">
            Confidence: {Math.round(prediction.confidence * 100)}%
          </p>
        </div>
      )}

      {/* Sample list */}
      {filtered.length > 0 && (
        <div className="max-h-40 overflow-y-auto space-y-1">
          {filtered.map((s) => (
            <div key={s.id} className="flex items-center gap-2 bg-zinc-800/40 rounded px-2 py-1.5">
              {s.thumbnail && (
                <img src={s.thumbnail} alt="" className="w-8 h-8 rounded border border-zinc-700/30 object-cover shrink-0" />
              )}
              <span className="text-xs text-zinc-300 font-mono flex-1 truncate">{s.label}</span>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-[9px] text-red-500/60 hover:text-red-400 shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {samples.length > 0 && (
        <button
          onClick={handleClear}
          className="mt-3 w-full px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 rounded-lg text-[10px] text-red-400 transition-colors"
        >
          Clear All Samples
        </button>
      )}
    </div>
  );
}
