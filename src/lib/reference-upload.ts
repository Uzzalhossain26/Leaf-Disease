import { supabase } from "@/integrations/supabase/client";
import { resizeImage } from "@/lib/resize-image";
import { embeddingFromBlob } from "@/lib/leafEngine";

export const REF_BUCKET = "reference-images";

/** Resize to 512px, store the photo, compute its fingerprint and save it as a reference image. */
export async function uploadReferenceImage(classId: string, file: File | Blob) {
  const blob = await resizeImage(file, 512);
  const path = `${classId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(REF_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  let embedding: number[] | null = null;
  try { embedding = await embeddingFromBlob(blob); } catch (err) { console.error(err); }
  const { error: e2 } = await supabase.from("reference_images").insert({ disease_class_id: classId, image_url: path, embedding });
  if (e2) throw e2;
}

/** Upload a crop cover photo; returns the storage path to keep in cover_image_url. */
export async function uploadCoverImage(file: File) {
  const blob = await resizeImage(file, 512);
  const path = `covers/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(REF_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}
