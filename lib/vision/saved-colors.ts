export interface SavedColor {
  id: string;
  name: string;
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  v: number;
  createdAt: number;
}

const STORAGE_KEY = "vision_saved_colors";

export async function loadSavedColors(): Promise<SavedColor[]> {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveSavedColors(colors: SavedColor[]): Promise<void> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
}

export async function addSavedColor(color: SavedColor): Promise<SavedColor[]> {
  const colors = await loadSavedColors();
  colors.push(color);
  await saveSavedColors(colors);
  return colors;
}

export async function removeSavedColor(id: string): Promise<SavedColor[]> {
  const colors = await loadSavedColors();
  const filtered = colors.filter(c => c.id !== id);
  await saveSavedColors(filtered);
  return filtered;
}

export async function renameSavedColor(id: string, name: string): Promise<SavedColor[]> {
  const colors = await loadSavedColors();
  const updated = colors.map(c => c.id === id ? { ...c, name } : c);
  await saveSavedColors(updated);
  return updated;
}
