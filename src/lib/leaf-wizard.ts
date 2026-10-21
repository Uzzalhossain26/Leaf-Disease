// Pure helpers for the admin "add a new leaf" form (kept free of UI for testing).
export type DiseaseDraft = {
  key: string;
  name_bn: string;
  name_en: string;
  is_healthy: boolean;
  color_hex: string;
  symptoms_bn: string;
  treatment_bn: string;
  prevention_bn: string;
  files: File[];
};

export type LeafDraft = {
  name_bn: string;
  name_en: string;
  description: string;
  diseases: DiseaseDraft[];
};

const PALETTE = ["#92400e", "#334155", "#ca8a04", "#b91c1c", "#7c3aed", "#0e7490", "#be185d"];

export function newDisease(index: number, partial: Partial<DiseaseDraft> = {}): DiseaseDraft {
  return {
    key: Math.random().toString(36).slice(2),
    name_bn: "",
    name_en: "",
    is_healthy: false,
    color_hex: PALETTE[index % PALETTE.length]!,
    symptoms_bn: "",
    treatment_bn: "",
    prevention_bn: "",
    files: [],
    ...partial,
  };
}

export function healthyDisease(): DiseaseDraft {
  return newDisease(0, {
    name_bn: "সুস্থ পাতা",
    name_en: "Healthy",
    is_healthy: true,
    color_hex: "#16a34a",
    symptoms_bn: "পাতা সমান সবুজ, মসৃণ; কোনো দাগ বা বিবর্ণতা নেই।",
    treatment_bn: "কোনো চিকিৎসার প্রয়োজন নেই।",
  });
}

/**
 * One disease per line. "বাংলা নাম | English name" (also accepts ",", " - " or "বাংলা (English)").
 */
export function parseNameList(text: string): { name_bn: string; name_en: string }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const paren = line.match(/^(.*?)\s*\((.+)\)\s*$/);
      if (paren) return { name_bn: paren[1]!.trim(), name_en: paren[2]!.trim() };
      const parts = line.split(/\s*[|,]\s*|\s+[-–]\s+/);
      const name_bn = (parts[0] ?? "").trim();
      const name_en = parts.slice(1).join(" ").trim();
      return { name_bn, name_en };
    })
    .filter((n) => n.name_bn.length > 0);
}

/** Returns a Bengali error message, or null when the leaf can be saved. */
export function validateLeafDraft(d: LeafDraft): string | null {
  if (!d.name_bn.trim() || !d.name_en.trim()) return "পাতার বাংলা ও ইংরেজি নাম দিন";
  if (!d.diseases.some((x) => !x.is_healthy)) return "কমপক্ষে একটি রোগ যোগ করুন";
  for (const [i, x] of d.diseases.entries()) {
    if (!x.name_bn.trim() || !x.name_en.trim()) return `${(i + 1).toLocaleString("bn-BD")} নম্বর রোগের বাংলা ও ইংরেজি নাম দিন`;
  }
  const names = d.diseases.map((x) => x.name_en.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "একই নামের রোগ দুবার দেওয়া হয়েছে";
  return null;
}

/** Cover photos uploaded by admins live in storage; static paths and links are used as-is. */
export function isStoredCover(path: string | null | undefined): path is string {
  return !!path && !path.startsWith("/") && !/^https?:\/\//.test(path);
}
