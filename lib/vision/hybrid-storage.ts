import type { HybridProfile } from "./types";

const STORAGE_KEY = "vision_hybrid_profiles";

export async function loadHybridProfiles(): Promise<HybridProfile[]> {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveHybridProfiles(profiles: HybridProfile[]): Promise<void> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export async function addHybridProfile(profile: HybridProfile): Promise<HybridProfile[]> {
  const profiles = await loadHybridProfiles();
  profiles.push(profile);
  await saveHybridProfiles(profiles);
  return profiles;
}

export async function removeHybridProfile(id: string): Promise<HybridProfile[]> {
  const profiles = await loadHybridProfiles();
  const filtered = profiles.filter(p => p.id !== id);
  await saveHybridProfiles(filtered);
  return filtered;
}
