import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";
import { Camera, CheckCircle2, Flag, HelpCircle, ImageUp, Leaf, RotateCcw, Share2, Sun, Square, ZoomIn, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cropQuery, cropsQuery } from "@/lib/queries";
import { predict, type Prediction } from "@/lib/leafEngine";
import { supabase } from "@/integrations/supabase/client";
import { addLocalHistory, makeThumb } from "@/lib/local-history";
import { useServerFn } from "@tanstack/react-start";
import { getAiOpinion, type AiOpinion } from "@/lib/ai-opinion.functions";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bot, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/diagnose/$cropId")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "রোগ নির্ণয় – LeafDoc পাতা ডাক্তার" },
      { name: "description", content: "পাতার ছবি তুলে বা আপলোড করে গাছের রোগ নির্ণয় করুন।" },
      { property: "og:title", content: "রোগ নির্ণয় – LeafDoc" },
      { property: "og:description", content: "পাতার ছবি তুলে বা আপলোড করে গাছের রোগ নির্ণয় করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(cropQuery(params.cropId)),
      context.queryClient.ensureQueryData(cropsQuery),
    ]),
  errorComponent: () => <AppShell><p className="text-destructive">তথ্য লোড করা যায়নি।</p></AppShell>,
  notFoundComponent: () => <AppShell><p>ফসল পাওয়া যায়নি।</p></AppShell>,
  component: Diagnose,
});

const bnPct = (n: number) => `${n.toLocaleString("bn-BD", { maximumFractionDigits: 1 })}%`;

async function cropToBlob(src: string, area: Area, max = 512): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, max / Math.max(area.width, area.height));
  const c = document.createElement("canvas");
  c.width = Math.round(area.width * scale);
  c.height = Math.round(area.height * scale);
  c.getContext("2d")!.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("crop failed"))), "image/jpeg", 0.9));
}

function Diagnose() {
  const { cropId } = Route.useParams();
  const navigate = useNavigate();
  const { data: crop } = useSuspenseQuery(cropQuery(cropId));
  const { data: crops } = useSuspenseQuery(cropsQuery);
  const [src, setSrc] = useState<string | null>(null);
  const [cropPos, setCropPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Prediction | null>(null);
  const [saved, setSaved] = useState<{ id: string; path: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [leafBlob, setLeafBlob] = useState<Blob | null>(null);

  if (!crop) return <AppShell><p>ফসল পাওয়া যায়নি। <Link to="/" className="text-primary underline">হোমে ফিরুন</Link></p></AppShell>;
  const cls = (id: string | null | undefined) => crop.disease_classes.find((d) => d.id === id);

  const reset = () => { setSrc(null); setResult(null); setSaved(null); setZoom(1); setCropPos({ x: 0, y: 0 }); };
  const onFile = (f?: File) => { if (!f) return; reset(); setSrc(URL.createObjectURL(f)); };

  const run = async () => {
    if (!src || !area) return;
    setBusy(true); setResult(null); setSaved(null);
    try {
      const blob = await cropToBlob(src, area);
      setLeafBlob(blob);
      const bmp = await createImageBitmap(blob);
      const r = await predict(bmp, crop.id);
      bmp.close();
      setResult(r);
      const id = crypto.randomUUID();
      // device-local history (no login needed)
      const pc = r.status === "ok" ? crop.disease_classes.find((d) => d.id === r.classId) : undefined;
      addLocalHistory({
        id, createdAt: new Date().toISOString(), cropId: crop.id, cropName: crop.name_bn,
        classId: pc?.id ?? null, className: pc?.name_bn ?? null, classNameEn: pc?.name_en ?? null,
        color: pc?.color_hex ?? null, confidence: r.confidence, thumb: await makeThumb(blob),
      });
      // save to cloud (admin statistics + reports)
      const path = `${crop.id}/${id}.jpg`;
      const { error: upErr } = await supabase.storage.from("diagnosis-images").upload(path, blob, { contentType: "image/jpeg" });
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("diagnoses").insert({
        id, user_id: u.user?.id ?? null, crop_profile_id: crop.id, image_url: upErr ? null : path,
        predicted_class_id: r.status === "ok" ? r.classId : null, confidence: r.confidence, top3: r.top3,
      });
      if (error) console.error(error);
      else if (!upErr) setSaved({ id, path });
    } catch (e) {
      console.error(e);
      toast.error("বিশ্লেষণ করা যায়নি। আবার চেষ্টা করুন।");
    } finally { setBusy(false); }
  };

  const share = async () => {
    if (!result) return;
    const c = cls(result.classId);
    const text = result.status === "unknown" ? `LeafDoc: ${crop.name_bn} – নিশ্চিত ফলাফল পাওয়া যায়নি।`
      : `LeafDoc ফলাফল (${crop.name_bn}): ${c?.name_bn} (${c?.name_en}) – নিশ্চয়তা ${bnPct(result.confidence)}`;
    try {
      if (navigator.share) await navigator.share({ title: "LeafDoc – পাতা ডাক্তার", text, url: window.location.href });
      else { await navigator.clipboard.writeText(`${text}\n${window.location.href}`); toast.success("ফলাফল কপি হয়েছে"); }
    } catch { /* cancelled */ }
  };

  return (
    <AppShell>
      <h1 className="mb-3 font-display text-2xl font-bold leading-snug">{crop.name_bn} – রোগ নির্ণয় <span className="block text-base font-normal text-muted-foreground">({crop.name_en})</span></h1>
      <div className="flex items-center gap-2">
        <Leaf className="h-6 w-6 shrink-0 text-leaf" />
        <select
          value={crop.id}
          onChange={(e) => { reset(); navigate({ to: "/diagnose/$cropId", params: { cropId: e.target.value } }); }}
          className="min-h-12 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-base font-semibold"
          aria-label="ফসল পরিবর্তন"
        >
          {crops.map((c) => <option key={c.id} value={c.id}>{c.name_bn} ({c.name_en})</option>)}
        </select>
      </div>

      {!src && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <label className="relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg bg-hero p-3 text-center text-base font-semibold text-primary-foreground shadow-glow focus-within:ring-2 focus-within:ring-ring">
              <Camera className="h-8 w-8" /> ক্যামেরা দিয়ে তুলুন
              <input aria-label="ক্যামেরা দিয়ে তুলুন" type="file" accept="image/*" capture="environment" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <label className="relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-card p-3 text-center text-base font-semibold text-primary focus-within:ring-2 focus-within:ring-ring">
              <ImageUp className="h-8 w-8" /> গ্যালারি থেকে আপলোড
              <input aria-label="গ্যালারি থেকে আপলোড" type="file" accept="image/*" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          <div className="mt-4 rounded-2xl bg-secondary p-4 text-secondary-foreground">
            <p className="mb-2 text-sm font-semibold">ভালো ছবির জন্য:</p>
            <ul className="grid grid-cols-2 gap-2 text-sm">
              <li className="flex items-center gap-2"><Leaf className="h-4 w-4" /> একটি পাতা</li>
              <li className="flex items-center gap-2"><Sun className="h-4 w-4" /> দিনের আলো</li>
              <li className="flex items-center gap-2"><Square className="h-4 w-4" /> সাধারণ ব্যাকগ্রাউন্ড</li>
              <li className="flex items-center gap-2"><ZoomIn className="h-4 w-4" /> কাছ থেকে</li>
            </ul>
          </div>
        </>
      )}

      {src && !result && (
        <div className="mt-4 space-y-3">
          <div className="relative aspect-square max-h-[55dvh] w-full overflow-hidden rounded-lg bg-muted">
            <Cropper image={src} crop={cropPos} zoom={zoom} aspect={1} onCropChange={setCropPos} onZoomChange={setZoom} onCropComplete={(_, px) => setArea(px)} />
          </div>
          <p className="text-center text-xs text-muted-foreground">শুধু পাতাটি বাক্সের ভেতরে রাখুন — টেনে ও জুম করে ঠিক করুন</p>
          <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="h-11 w-full accent-primary" aria-label="জুম" />
          {busy ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-secondary p-6 text-secondary-foreground">
              <Leaf className="h-10 w-10 animate-bounce text-leaf" />
              <p className="font-medium">পাতা বিশ্লেষণ করা হচ্ছে...</p>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}><RotateCcw /> বাতিল</Button>
              <Button className="h-12 flex-1 text-base" onClick={run} disabled={!area}>রোগ নির্ণয় করুন</Button>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-4">
          <ResultCard result={result} cls={cls(result.classId)} />
          {leafBlob && (
            <AiOpinionCard
              blob={leafBlob}
              cropName={`${crop.name_bn} (${crop.name_en})`}
              classNames={crop.disease_classes.map((d) => `${d.name_bn} (${d.name_en})`)}
              knnResult={result.status === "ok" && cls(result.classId) ? `${cls(result.classId)!.name_bn} (${cls(result.classId)!.name_en})` : "অনিশ্চিত"}
              knnConfidence={result.confidence}
            />
          )}
          {result.top3.length > 0 && (
            <div className="rounded-2xl bg-card p-4 shadow-soft">
              <p className="mb-3 text-sm font-semibold">সম্ভাব্য ফলাফল</p>
              <div className="space-y-3">
                {result.top3.map((t) => {
                  const c = cls(t.classId);
                  return (
                    <div key={t.classId}>
                      <div className="flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words">{c?.name_bn} <span className="text-muted-foreground">({c?.name_en})</span></span><span className="shrink-0 font-medium">{bnPct(t.confidence)}</span></div>
                      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${t.confidence}%`, backgroundColor: c?.color_hex ?? undefined }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <SimilarImages items={result.similar} cls={cls} />
          <div className="grid gap-2">
            <Button className="h-12" onClick={reset}><RotateCcw /> আবার চেষ্টা করুন</Button>
            <Button variant="secondary" onClick={share}><Share2 /> ফলাফল শেয়ার করুন</Button>
            <Button variant="outline" disabled={!saved} onClick={() => setReportOpen(true)}><Flag /> ভুল ফলাফল? রিপোর্ট করুন</Button>
          </div>
        </div>
      )}

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        classes={[...crop.disease_classes].sort((a, b) => a.sort_order - b.sort_order)}
        onPick={async (classId) => {
          if (!saved || !result) return;
          const { error } = await supabase.from("diagnosis_reports").insert({
            diagnosis_id: saved.id, crop_profile_id: crop.id, image_url: saved.path,
            predicted_class_id: result.status === "ok" ? result.classId : null, suggested_class_id: classId,
          });
          if (error) toast.error("রিপোর্ট পাঠানো যায়নি");
          else { toast.success("ধন্যবাদ! আপনার রিপোর্ট পাঠানো হয়েছে"); setReportOpen(false); }
        }}
      />
    </AppShell>
  );
}

type C = { name_bn: string; name_en: string; is_healthy: boolean; symptoms_bn: string | null; treatment_bn: string | null; prevention_bn: string | null } | undefined;

function ResultCard({ result, cls }: { result: Prediction; cls: C }) {
  if (result.status === "unknown" || !cls) {
    return (
      <div className="rounded-2xl border border-border bg-muted p-5">
        <div className="flex items-center gap-2 text-lg font-bold"><HelpCircle className="h-6 w-6" /> ফলাফল নিশ্চিত নয়</div>
        <p className="mt-2 text-sm">{result.message}</p>
      </div>
    );
  }
  if (cls.is_healthy) {
    return (
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-soft">
        <div className="flex items-center gap-2 text-xl font-bold"><CheckCircle2 className="h-7 w-7" /> ✓ পাতাটি সুস্থ</div>
        <p className="mt-1 text-sm opacity-90">নিশ্চয়তা {bnPct(result.confidence)}</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border-2 border-destructive/40 bg-destructive/10 p-5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-destructive" />
        <div>
          <div className="text-xl font-bold text-destructive">{cls.name_bn}</div>
          <div className="text-sm text-muted-foreground">({cls.name_en}) · নিশ্চয়তা {bnPct(result.confidence)}</div>
        </div>
      </div>
      <div className="mt-4 space-y-3 text-sm">
        {cls.symptoms_bn && <Section title="লক্ষণ" text={cls.symptoms_bn} />}
        {cls.treatment_bn && <Section title="চিকিৎসা" text={cls.treatment_bn} />}
        {cls.prevention_bn && <Section title="প্রতিরোধ" text={cls.prevention_bn} />}
      </div>
    </div>
  );
}
function Section({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl bg-card p-3"><p className="mb-1 font-semibold">{title}</p><p className="whitespace-pre-line">{text}</p></div>;
}

function SimilarImages({ items, cls }: { items: Prediction["similar"]; cls: (id: string) => C }) {
  const { data } = useQuery({
    queryKey: ["similar", items.map((i) => i.path).join(",")],
    enabled: items.length > 0,
    queryFn: async () => {
      const { data } = await supabase.storage.from("reference-images").createSignedUrls(items.map((i) => i.path), 3600);
      return data?.map((d) => d.signedUrl) ?? [];
    },
  });
  if (!items.length) return null;
  return (
    <div className="rounded-2xl bg-card p-4 shadow-soft">
      <p className="mb-3 text-sm font-semibold">এই ছবিগুলোর সাথে মিল পাওয়া গেছে</p>
      <div className="grid grid-cols-3 gap-2">
        {items.map((it, i) => (
          <div key={it.path}>
            <div className="aspect-square overflow-hidden rounded-xl bg-muted">
              {data?.[i] && <img src={data[i]} alt={cls(it.classId)?.name_en ?? ""} className="h-full w-full object-cover" />}
            </div>
            <p className="mt-1 break-words text-center text-sm text-muted-foreground">{cls(it.classId)?.name_bn}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportDialog({ open, onClose, classes, onPick }: { open: boolean; onClose: () => void; classes: { id: string; name_bn: string; name_en: string; color_hex: string | null }[]; onPick: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>সঠিক রোগটি বাছাই করুন</DialogTitle></DialogHeader>
        <div className="grid gap-2">
          {classes.map((c) => (
            <Button key={c.id} variant="outline" disabled={busy} className="h-auto min-h-12 flex-wrap justify-start whitespace-normal py-3 text-left"
              onClick={async () => { setBusy(true); await onPick(c.id); setBusy(false); }}>
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: c.color_hex ?? undefined }} />
              {c.name_bn} <span className="text-muted-foreground">({c.name_en})</span>
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">অ্যাডমিন যাচাই করার পর এই ছবিটি রেফারেন্স হিসেবে যোগ হবে।</p>
      </DialogContent>
    </Dialog>
  );
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(b); });
}

function AiOpinionCard(p: { blob: Blob; cropName: string; classNames: string[]; knnResult: string; knnConfidence: number }) {
  const ask = useServerFn(getAiOpinion);
  const { data: enabled } = useQuery({
    queryKey: ["setting", "ai_opinion_enabled"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "ai_opinion_enabled").maybeSingle();
      return data?.value === true;
    },
  });
  const { data, isLoading } = useQuery({
    queryKey: ["ai-opinion", p.blob.size, p.knnResult],
    enabled: !!enabled && typeof navigator !== "undefined" && navigator.onLine,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => ask({ data: { imageDataUrl: await blobToDataUrl(p.blob), cropName: p.cropName, classNames: p.classNames, knnResult: p.knnResult, knnConfidence: p.knnConfidence } }),
  });
  if (!enabled) return null;
  const op: AiOpinion | null = data?.ok ? data.opinion : null;
  return (
    <Collapsible defaultOpen className="rounded-2xl bg-card shadow-soft">
      <CollapsibleTrigger className="flex w-full items-center gap-2 p-4 text-left font-semibold">
        <Bot className="h-5 w-5 text-leaf" /> AI এর মতামত
        {op && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${op.agree ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>{op.agree ? "একমত" : "ভিন্নমত"}</span>}
        <ChevronDown className="ml-auto h-4 w-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-4 pb-4 text-sm">
        {isLoading && <p className="animate-pulse text-muted-foreground">AI ছবিটি দেখছে...</p>}
        {data && !data.ok && <p className="text-muted-foreground">{data.error}</p>}
        {!data && !isLoading && <p className="text-muted-foreground">ইন্টারনেট সংযোগ নেই।</p>}
        {op && (
          <>
            {!op.agree && op.suggested_class && <p><b>AI এর অনুমান:</b> {op.suggested_class}</p>}
            <p>{op.explanation_bn}</p>
            {op.advice_bn && <div className="rounded-xl bg-secondary p-3"><b>পরামর্শ:</b> {op.advice_bn}</div>}
            <p className="text-xs text-muted-foreground">AI ভুল করতে পারে — প্রয়োজনে কৃষি কর্মকর্তার পরামর্শ নিন।</p>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
