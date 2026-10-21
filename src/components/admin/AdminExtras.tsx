import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Bot, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

const bn = (n: number) => n.toLocaleString("bn-BD", { maximumFractionDigits: 1 });

/* ---------- Stats ---------- */
export function Stats() {
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { count } = await supabase.from("diagnoses").select("id", { count: "exact", head: true });
      const { data, error } = await supabase
        .from("diagnoses")
        .select("predicted_class_id, disease_classes(name_bn, color_hex), crop_profiles(name_bn)")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const m = new Map<string, { name: string; color: string; n: number }>();
      for (const d of data) {
        const k = d.predicted_class_id ?? "unknown";
        const cur = m.get(k) ?? {
          name: d.disease_classes ? `${d.disease_classes.name_bn} · ${d.crop_profiles?.name_bn ?? ""}` : "অনিশ্চিত",
          color: d.disease_classes?.color_hex ?? "#9ca3af",
          n: 0,
        };
        cur.n++;
        m.set(k, cur);
      }
      return { total: count ?? data.length, rows: [...m.values()].sort((a, b) => b.n - a.n) };
    },
  });
  const max = Math.max(1, ...(data?.rows.map((r) => r.n) ?? [1]));
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-hero p-5 text-primary-foreground shadow-soft">
        <div className="text-sm opacity-90">মোট রোগ নির্ণয়</div>
        <div className="font-display text-4xl font-bold">{bn(data?.total ?? 0)}</div>
      </div>
      <div className="rounded-2xl bg-card p-4 shadow-soft">
        <p className="mb-3 font-semibold">রোগ অনুযায়ী সংখ্যা</p>
        {!data?.rows.length && <p className="text-sm text-muted-foreground">এখনো কোনো তথ্য নেই।</p>}
        <div className="space-y-2">
          {data?.rows.map((r) => (
            <div key={r.name}>
              <div className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{r.name}</span><span className="shrink-0 font-medium">{bn(r.n)}</span></div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${(r.n / max) * 100}%`, backgroundColor: r.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- AI toggle ---------- */
export function AiToggle() {
  const qc = useQueryClient();
  const { data: on } = useQuery({
    queryKey: ["setting", "ai_opinion_enabled"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "ai_opinion_enabled").maybeSingle();
      return data?.value === true;
    },
  });
  const set = async (v: boolean) => {
    const { error } = await supabase.from("app_settings").upsert({ key: "ai_opinion_enabled", value: v, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["setting", "ai_opinion_enabled"] });
  };
  return (
    <label className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
      <Bot className="h-6 w-6 shrink-0 text-leaf" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">AI দ্বিতীয় মতামত</div>
        <div className="text-xs text-muted-foreground">প্রতিটি ফলাফলের নিচে "AI এর মতামত" দেখাবে (AI ক্রেডিট খরচ হয়)</div>
      </div>
      <Switch checked={!!on} onCheckedChange={set} />
    </label>
  );
}

/* ---------- Accuracy test ---------- */
type Res = {
  classes: { id: string; name: string; n: number; correct: number }[];
  matrix: number[][];
  total: number;
  correct: number;
};

export function AccuracyTest({ crops }: { crops: { id: string; name_bn: string; disease_classes: { id: string; name_bn: string; name_en: string; sort_order: number }[] }[] }) {
  const [cropId, setCropId] = useState(crops[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const crop = crops.find((c) => c.id === cropId);

  const run = async () => {
    if (!crop) return;
    setBusy(true); setRes(null);
    try {
      const cls = [...crop.disease_classes].sort((a, b) => a.sort_order - b.sort_order);
      const { data, error } = await supabase
        .from("reference_images")
        .select("disease_class_id, embedding")
        .in("disease_class_id", cls.map((c) => c.id))
        .not("embedding", "is", null);
      if (error) throw error;
      const refs = data.filter((r) => Array.isArray(r.embedding)).map((r) => ({ label: r.disease_class_id, e: r.embedding as number[] }));
      const idx = new Map(cls.map((c, i) => [c.id, i]));
      const matrix = cls.map(() => cls.map(() => 0));
      const K = 5;
      // Leave-one-out kNN (cosine on L2-normalized embeddings).
      for (let i = 0; i < refs.length; i++) {
        const a = refs[i]!.e;
        const sims: { s: number; l: string }[] = [];
        for (let j = 0; j < refs.length; j++) {
          if (i === j) continue;
          const b = refs[j]!.e;
          let d = 0;
          for (let t = 0; t < a.length; t++) d += a[t]! * b[t]!;
          sims.push({ s: d, l: refs[j]!.label });
        }
        sims.sort((x, y) => y.s - x.s);
        const votes = new Map<string, { n: number; s: number }>();
        for (const v of sims.slice(0, K)) {
          const cur = votes.get(v.l) ?? { n: 0, s: 0 };
          cur.n++; cur.s += v.s;
          votes.set(v.l, cur);
        }
        const pred = [...votes].sort((x, y) => y[1].n - x[1].n || y[1].s - x[1].s)[0]?.[0];
        const ti = idx.get(refs[i]!.label), pi = pred ? idx.get(pred) : undefined;
        if (ti !== undefined && pi !== undefined) matrix[ti]![pi]!++;
        if (i % 50 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      const classes = cls.map((c, i) => ({ id: c.id, name: c.name_bn, n: matrix[i]!.reduce((s, x) => s + x, 0), correct: matrix[i]![i]! }));
      const correct = classes.reduce((s, c) => s + c.correct, 0);
      const total = classes.reduce((s, c) => s + c.n, 0);
      setRes({ classes, matrix, total, correct });
      if (total < 2) toast.error("পরীক্ষার জন্য যথেষ্ট ফিঙ্গারপ্রিন্টসহ ছবি নেই");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ত্রুটি");
    }
    setBusy(false);
  };

  const pct = (c: number, n: number) => (n ? (c / n) * 100 : 0);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card p-4 shadow-soft">
        <p className="mb-2 text-sm text-muted-foreground">প্রতিটি রেফারেন্স ছবিকে একে একে বাদ দিয়ে বাকি ছবি দিয়ে চিনতে চেষ্টা করা হয় (leave-one-out)।</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <select value={cropId} onChange={(e) => { setCropId(e.target.value); setRes(null); }} className="min-h-12 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-base" aria-label="ফসল">
            {crops.map((c) => <option key={c.id} value={c.id}>{c.name_bn}</option>)}
          </select>
          <Button onClick={run} disabled={busy || !crop}><FlaskConical className={busy ? "animate-pulse" : ""} /> মডেল পরীক্ষা করুন</Button>
        </div>
      </div>

      {res && res.total > 0 && (
        <>
          <div className="rounded-2xl bg-hero p-5 text-primary-foreground shadow-soft">
            <div className="text-sm opacity-90">সামগ্রিক নির্ভুলতা</div>
            <div className="font-display text-4xl font-bold">{bn(pct(res.correct, res.total))}%</div>
            <div className="text-xs opacity-90">{bn(res.correct)}/{bn(res.total)}টি ছবি সঠিক</div>
          </div>
          <div className="rounded-2xl bg-card p-4 shadow-soft">
            <p className="mb-3 font-semibold">শ্রেণি অনুযায়ী নির্ভুলতা</p>
            <div className="space-y-2">
              {res.classes.map((c) => {
                const p = pct(c.correct, c.n);
                const weak = c.n < 20 || p < 70;
                return (
                  <div key={c.id}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span>{c.name} <span className="text-xs text-muted-foreground">({bn(c.n)}টি ছবি)</span></span>
                      <span className={weak ? "shrink-0 font-semibold text-destructive" : "shrink-0 font-semibold text-primary"}>{bn(p)}%</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${weak ? "bg-destructive" : "bg-primary"}`} style={{ width: `${p}%` }} />
                    </div>
                    {weak && <p className="mt-0.5 text-xs text-destructive">আরও ছবি দিন</p>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl bg-card p-4 shadow-soft">
            <p className="mb-1 font-semibold">কনফিউশন ম্যাট্রিক্স</p>
            <p className="mb-3 text-xs text-muted-foreground">সারি = আসল রোগ, কলাম = মডেলের অনুমান</p>
            <div className="max-w-full overflow-x-auto overscroll-x-contain" tabIndex={0} aria-label="কনফিউশন ম্যাট্রিক্স">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th />
                    {res.classes.map((c, j) => <th key={c.id} className="px-1 pb-1 font-medium" title={c.name}>{bn(j + 1)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {res.matrix.map((row, i) => {
                    const rowMax = Math.max(1, ...row);
                    return (
                      <tr key={i}>
                        <th className="whitespace-nowrap pr-2 text-left font-medium">{bn(i + 1)}. {res.classes[i]!.name}</th>
                        {row.map((v, j) => (
                          <td key={j} className="p-0.5">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded ${i === j ? "bg-primary text-primary-foreground" : v ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}
                              style={v && i !== j ? { opacity: 0.35 + 0.65 * (v / rowMax) } : undefined}
                            >
                              {bn(v)}
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
