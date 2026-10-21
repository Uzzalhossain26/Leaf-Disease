// Browser-only leaf recognition engine (MobileNet v2 embeddings + KNN).
// All TF imports are dynamic so SSR never loads TensorFlow.
import type * as tfType from "@tensorflow/tfjs";
import type { MobileNet } from "@tensorflow-models/mobilenet";
import type { KNNClassifier } from "@tensorflow-models/knn-classifier";
import { supabase } from "@/integrations/supabase/client";

export type ImgSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;
const SIZE = 224;
export const UNKNOWN_MSG = "নিশ্চিত হতে পারছি না। পাতাটি পরিষ্কার আলোতে, একা, কাছ থেকে আবার তুলুন।";

let tf: typeof tfType | null = null;
let modelPromise: Promise<MobileNet> | null = null;

export function loadModel(): Promise<MobileNet> {
  if (!modelPromise) {
    modelPromise = (async () => {
      tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const mobilenet = await import("@tensorflow-models/mobilenet");
      const CACHE = "indexeddb://leafdoc-mobilenet-v2-100";
      try {
        // Offline-first: use the copy saved in IndexedDB on a previous visit.
        return await mobilenet.load({ version: 2, alpha: 1.0, modelUrl: CACHE, inputRange: [0, 1] });
      } catch {
        const m = await mobilenet.load({ version: 2, alpha: 1.0 });
        const graph = (m as unknown as { model?: { save?: (u: string) => Promise<unknown> } }).model;
        graph?.save?.(CACHE).catch((e) => console.warn("model cache failed", e));
        return m;
      }
    })().catch((e) => {
      modelPromise = null;
      throw e;
    });
  }
  return modelPromise;
}

type Variant = "original" | "flip" | "crop";

function toCanvas(img: ImgSource, variant: Variant = "original"): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext("2d")!;
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  let sx = 0, sy = 0, sw = w, sh = h;
  if (variant === "crop") {
    const s = Math.min(w, h) * 0.8;
    sx = (w - s) / 2; sy = (h - s) / 2; sw = s; sh = s;
  }
  if (variant === "flip") {
    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
  return c;
}

function l2(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

async function embedCanvas(c: HTMLCanvasElement): Promise<number[]> {
  const model = await loadModel();
  const t = tf!.tidy(() => model.infer(c, true) as tfType.Tensor);
  const arr = Array.from(await t.data());
  t.dispose();
  return l2(arr);
}

export async function getEmbedding(img: ImgSource): Promise<number[]> {
  return embedCanvas(toCanvas(img));
}

export async function embeddingFromBlob(blob: Blob): Promise<number[]> {
  const bmp = await createImageBitmap(blob);
  try { return await getEmbedding(bmp); } finally { bmp.close(); }
}

/* ---------------- Classifier cache ---------------- */
type Refs = { id?: string; path?: string; label: string; emb: number[] }[];
type Entry = { knn: KNNClassifier; refs: Refs };
const memCache = new Map<string, Entry>();

const DB = "leafdoc-engine", STORE = "classifiers";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(key: string, val: Refs) {
  try {
    const db = await idb();
    db.transaction(STORE, "readwrite").objectStore(STORE).put(val, key);
  } catch { /* ignore */ }
}
async function idbGet(key: string): Promise<Refs | null> {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => res((r.result as Refs) ?? null);
      r.onerror = () => res(null);
    });
  } catch { return null; }
}

export function invalidateClassifier(cropProfileId: string) {
  const e = memCache.get(cropProfileId);
  e?.knn.dispose();
  memCache.delete(cropProfileId);
}

async function fetchRefs(cropProfileId: string): Promise<Refs> {
  const { data, error } = await supabase
    .from("reference_images")
    .select("id, image_url, disease_class_id, embedding, disease_classes!inner(crop_profile_id)")
    .eq("disease_classes.crop_profile_id", cropProfileId)
    .not("embedding", "is", null);
  if (error) throw error;
  return (data ?? [])
    .filter((r) => Array.isArray(r.embedding))
    .map((r) => ({ id: r.id, path: r.image_url, label: r.disease_class_id, emb: r.embedding as number[] }));
}

export async function buildClassifier(cropProfileId: string, force = false): Promise<Entry> {
  if (!force && memCache.has(cropProfileId)) return memCache.get(cropProfileId)!;
  await loadModel();
  let refs: Refs | null = null;
  try {
    refs = await fetchRefs(cropProfileId);
    void idbPut(cropProfileId, refs);
  } catch (e) {
    refs = await idbGet(cropProfileId);
    if (!refs) throw e;
  }
  const knnMod = await import("@tensorflow-models/knn-classifier");
  const knn = knnMod.create();
  for (const r of refs) {
    const t = tf!.tensor1d(r.emb);
    knn.addExample(t, r.label);
    t.dispose();
  }
  invalidateClassifier(cropProfileId);
  const entry = { knn, refs };
  memCache.set(cropProfileId, entry);
  return entry;
}

/* ---------------- Prediction ---------------- */
export type Prediction = {
  status: "ok" | "unknown";
  classId: string | null;
  confidence: number; // 0-100
  similarity: number; // best cosine
  top3: { classId: string; confidence: number }[];
  message?: string | undefined;
  similar: { path: string; classId: string; similarity: number }[];
};

export async function predict(img: ImgSource, cropProfileId: string): Promise<Prediction> {
  const { knn, refs } = await buildClassifier(cropProfileId);
  if (!refs.length || knn.getNumClasses() === 0) {
    return { status: "unknown", classId: null, confidence: 0, similarity: 0, top3: [], similar: [], message: UNKNOWN_MSG };
  }
  const k = Math.min(5, refs.length);
  const variants: Variant[] = ["original", "flip", "crop"];
  const sum: Record<string, number> = {};
  let bestSim = -1;
  const sims = new Map<number, number>();
  for (const v of variants) {
    const emb = await embedCanvas(toCanvas(img, v));
    const t = tf!.tensor1d(emb);
    const res = await knn.predictClass(t, k);
    t.dispose();
    for (const [label, p] of Object.entries(res.confidences)) sum[label] = (sum[label] ?? 0) + p / variants.length;
    refs.forEach((r, idx) => {
      let d = 0;
      for (let i = 0; i < emb.length; i++) d += emb[i]! * r.emb[i]!;
      if (d > bestSim) bestSim = d;
      sims.set(idx, Math.max(sims.get(idx) ?? -1, d));
    });
  }
  const ranked = Object.entries(sum)
    .map(([classId, p]) => ({ classId, confidence: Math.round(p * 1000) / 10 }))
    .sort((a, b) => b.confidence - a.confidence);
  const best = ranked[0] ?? { classId: "", confidence: 0 };
  const unknown = bestSim < 0.55 || best.confidence < 50;
  return {
    status: unknown ? "unknown" : "ok",
    classId: best.classId,
    confidence: best.confidence,
    similarity: Math.round(bestSim * 1000) / 1000,
    top3: ranked.slice(0, 3),
    message: unknown ? UNKNOWN_MSG : undefined,
    similar: [...sims.entries()]
      .filter(([i]) => refs[i]!.path)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([i, sim]) => ({ path: refs[i]!.path!, classId: refs[i]!.label, similarity: Math.round(sim * 1000) / 1000 })),
  };
}
