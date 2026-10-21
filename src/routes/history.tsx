import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { clearLocalHistory, readLocalHistory, type LocalDiagnosis } from "@/lib/local-history";

export const Route = createFileRoute("/history")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "পূর্বের রোগ নির্ণয় – LeafDoc" },
      { name: "description", content: "এই ফোনে করা আগের সব পাতার রোগ নির্ণয়ের ইতিহাস দেখুন।" },
      { property: "og:title", content: "পূর্বের রোগ নির্ণয় – LeafDoc" },
      { property: "og:description", content: "আপনার রোগ নির্ণয়ের ইতিহাস।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const [data, setData] = useState<LocalDiagnosis[] | null>(null);
  const [cropF, setCropF] = useState("");
  const [classF, setClassF] = useState("");
  useEffect(() => setData(readLocalHistory()), []);

  const crops = useMemo(() => {
    const m = new Map<string, string>();
    data?.forEach((d) => m.set(d.cropId, d.cropName));
    return [...m];
  }, [data]);
  const classes = useMemo(() => {
    const m = new Map<string, string>();
    data?.filter((d) => !cropF || d.cropId === cropF).forEach((d) => d.classId && m.set(d.classId, d.className ?? ""));
    return [...m];
  }, [data, cropF]);
  const rows = data?.filter((d) => (!cropF || d.cropId === cropF) && (!classF || (classF === "unknown" ? !d.classId : d.classId === classF)));

  const clear = () => {
    if (!window.confirm("সব ইতিহাস মুছে ফেলবেন?")) return;
    clearLocalHistory();
    setData([]);
  };

  const sel = "min-h-12 min-w-0 w-full rounded-lg border border-border bg-card px-3 py-2 text-base";
  return (
    <AppShell>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">পূর্বের রোগ নির্ণয়</h1>
        {!!data?.length && <Button variant="ghost" size="sm" onClick={clear}><Trash2 /> মুছুন</Button>}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">এই ফোনে করা রোগ নির্ণয়গুলো এখানে থাকে — লগইন লাগে না।</p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <select className={sel} value={cropF} onChange={(e) => { setCropF(e.target.value); setClassF(""); }} aria-label="ফসল">
          <option value="">সব ফসল</option>
          {crops.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select className={sel} value={classF} onChange={(e) => setClassF(e.target.value)} aria-label="রোগ">
          <option value="">সব রোগ</option>
          {classes.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          <option value="unknown">অনিশ্চিত</option>
        </select>
      </div>
      {rows?.length === 0 && <p className="rounded-2xl bg-secondary p-5 text-center">কোনো রোগ নির্ণয় পাওয়া যায়নি।</p>}
      <ul className="space-y-3">
        {rows?.map((d) => (
          <li key={d.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
              {d.thumb && <img src={d.thumb} alt={`${d.cropName} – ${d.className ?? "অনিশ্চিত"} (${new Date(d.createdAt).toLocaleDateString("bn-BD")})`} loading="lazy" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2 font-semibold">
                <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground" style={d.color ? { backgroundColor: d.color } : undefined} />
                <span className="break-words">{d.className ?? "অনিশ্চিত"}</span>
              </div>
              {d.classNameEn && <div className="break-words text-sm text-muted-foreground">({d.classNameEn})</div>}
              <div className="text-xs text-muted-foreground">{d.cropName} · {new Date(d.createdAt).toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" })}</div>
            </div>
            {d.confidence != null && <div className="shrink-0 text-sm font-semibold text-primary">{Math.round(d.confidence).toLocaleString("bn-BD")}%</div>}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
