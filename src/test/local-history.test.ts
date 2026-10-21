import { beforeEach, describe, expect, it } from "vitest";
import { addLocalHistory, MAX_LOCAL_HISTORY, readLocalHistory, type LocalDiagnosis } from "@/lib/local-history";

const entry = (id: string): LocalDiagnosis => ({
  id, createdAt: new Date().toISOString(), cropId: "c", cropName: "আম", classId: null,
  className: null, classNameEn: null, color: null, confidence: 40, thumb: null,
});

describe("device history (no login)", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows the newest diagnosis first", () => {
    addLocalHistory(entry("a"));
    addLocalHistory(entry("b"));
    expect(readLocalHistory().map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("keeps at most the newest entries", () => {
    for (let i = 0; i < MAX_LOCAL_HISTORY + 5; i++) addLocalHistory(entry(String(i)));
    expect(readLocalHistory()).toHaveLength(MAX_LOCAL_HISTORY);
  });
});
