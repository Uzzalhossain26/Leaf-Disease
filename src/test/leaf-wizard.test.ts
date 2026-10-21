import { describe, expect, it } from "vitest";
import { healthyDisease, isStoredCover, newDisease, parseNameList, validateLeafDraft } from "@/lib/leaf-wizard";

describe("parseNameList", () => {
  it("reads one disease per line as Bengali | English", () => {
    expect(parseNameList("আগাম ধসা | Early Blight\n\nনাবি ধসা (Late Blight)")).toEqual([
      { name_bn: "আগাম ধসা", name_en: "Early Blight" },
      { name_bn: "নাবি ধসা", name_en: "Late Blight" },
    ]);
  });
  it("keeps hyphenated English names intact", () => {
    expect(parseNameList("পাতা মোড়ানো | Leaf-Roll Virus")[0]!.name_en).toBe("Leaf-Roll Virus");
  });
});

describe("validateLeafDraft", () => {
  const base = { name_bn: "আলু পাতা", name_en: "Potato Leaf", description: "" };
  it("needs at least one disease besides healthy", () => {
    expect(validateLeafDraft({ ...base, diseases: [healthyDisease()] })).not.toBeNull();
  });
  it("accepts a named leaf with a named disease", () => {
    const d = newDisease(0, { name_bn: "আগাম ধসা", name_en: "Early Blight" });
    expect(validateLeafDraft({ ...base, diseases: [healthyDisease(), d] })).toBeNull();
  });
  it("rejects a disease without an English name", () => {
    const d = newDisease(0, { name_bn: "আগাম ধসা" });
    expect(validateLeafDraft({ ...base, diseases: [d] })).not.toBeNull();
  });
});

describe("isStoredCover", () => {
  it("treats only storage paths as stored", () => {
    expect(isStoredCover("covers/a.jpg")).toBe(true);
    expect(isStoredCover("/crops/potato.jpg")).toBe(false);
    expect(isStoredCover("https://x.y/a.jpg")).toBe(false);
  });
});
