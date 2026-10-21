import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isStoredCover } from "@/lib/leaf-wizard";

/** Replace stored cover paths with short-lived signed links (buckets are private). */
async function withCoverUrls<T extends { cover_image_url: string | null }>(rows: T[]): Promise<T[]> {
  const stored = rows.map((r) => r.cover_image_url).filter(isStoredCover);
  if (!stored.length) return rows;
  const { data } = await supabase.storage.from("reference-images").createSignedUrls(stored, 60 * 60 * 6);
  const map = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => (isStoredCover(r.cover_image_url) ? { ...r, cover_image_url: map.get(r.cover_image_url) ?? null } : r));
}

export const cropsQuery = queryOptions({
  queryKey: ["crops"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("crop_profiles")
      .select("*, disease_classes(count)")
      .eq("is_active", true)
      .order("created_at");
    if (error) throw error;
    return withCoverUrls(data);
  },
});

export const cropQuery = (id: string) =>
  queryOptions({
    queryKey: ["crop", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crop_profiles")
        .select("*, disease_classes(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
