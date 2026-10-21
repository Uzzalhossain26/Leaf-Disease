// Diagnosis history kept on the farmer's own device (no login needed).
export type LocalDiagnosis = {
  id: string;
  createdAt: string;
  cropId: string;
  cropName: string;
  classId: string | null;
  className: string | null;
  classNameEn: string | null;
  color: string | null;
  confidence: number | null;
  thumb: string | null;
};

const KEY = "leafdoc-history-v1";
export const MAX_LOCAL_HISTORY = 100;

export function readLocalHistory(): LocalDiagnosis[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LocalDiagnosis[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addLocalHistory(entry: LocalDiagnosis) {
  const list = [entry, ...readLocalHistory().filter((e) => e.id !== entry.id)].slice(0, MAX_LOCAL_HISTORY);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full: keep fewer entries without thumbnails.
    try {
      window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30).map((e) => ({ ...e, thumb: null }))));
    } catch { /* ignore */ }
  }
}

export function clearLocalHistory() {
  window.localStorage.removeItem(KEY);
}

/** Small JPEG data URL for the history list. */
export async function makeThumb(blob: Blob, size = 128): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, size / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return c.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}
