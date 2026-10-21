import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type DragEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, Camera, ChevronRight, ImageUp, LogOut, Pencil, Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuthForm } from "@/components/AuthForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccuracyTest, AiToggle, Stats } from "@/components/admin/AdminExtras";
import { LeafWizard } from "@/components/admin/LeafWizard";
import { uploadCoverImage, uploadReferenceImage } from "@/lib/reference-upload";
import { isStoredCover } from "@/lib/leaf-wizard";
import { embeddingFromBlob, invalidateClassifier } from "@/lib/leafEngine";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Crop = Tables<"crop_profiles">;
type DClass = Tables<"disease_classes">;
const MIN_IMAGES = 20;

export const Route = createFileRoute("/admin")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "অ্যাডমিন প্যানেল – LeafDoc" },
      { name: "description", content: "ফসল, রোগের শ্রেণি ও রেফারেন্স ছবি পরিচালনা করুন।" },
      { property: "og:title", content: "অ্যাডমিন প্যানেল – LeafDoc" },
      { property: "og:description", content: "LeafDoc পরিচালনা প্যানেল।" },
      { name: "robots", content: "noindex" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <AppShell>{null}</AppShell>;
  if (!user) return <AppShell><AuthForm title="অ্যাডমিন লগইন" /></AppShell>;
  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">অ্যাডমিন প্যানেল</h1>
        <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}><LogOut /> লগআউট</Button>
      </div>
      {isAdmin ? <AdminContent /> : <p className="rounded-2xl bg-secondary p-5">এই অ্যাকাউন্টের অ্যাডমিন অনুমতি নেই।</p>}
    </AppShell>
  );
}

function useAdminData() {
  return useQuery({
    queryKey: ["admin-crops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crop_profiles")
        .select("*, disease_classes(*, reference_images(count))")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}
const imgCount = (d: { reference_images: unknown }) =>
  (d.reference_images as { count: number }[])?.[0]?.count ?? 0;
const bn = (n: number) => n.toLocaleString("bn-BD");

function AdminContent() {
  const [cropId, setCropId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  const [tab, setTab] = useState("dash");
  const refresh = useRefresh();
  const { data: crops } = useAdminData();
  const crop = crops?.find((c) => c.id === cropId);
  const dclass = crop?.disease_classes.find((d) => d.id === classId);

  if (crop && dclass) return <ClassImages crop={crop} dclass={dclass} onBack={() => setClassId(null)} />;
  if (crop) return <CropDetail crop={crop} onBack={() => setCropId(null)} onOpen={setClassId} />;
  if (wizard) return <LeafWizard onBack={() => setWizard(false)} onDone={(id) => { refresh(); setWizard(false); setCropId(id); }} />;
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="mb-4 grid h-auto w-full grid-cols-3 gap-1 p-1 [&>button]:min-h-11 [&>button]:min-w-0 [&>button]:whitespace-normal [&>button]:px-1 [&>button]:leading-snug">
        <TabsTrigger value="dash">ড্যাশবোর্ড</TabsTrigger>
        <TabsTrigger value="crops">ফসল</TabsTrigger>
        <TabsTrigger value="test">মডেল পরীক্ষা</TabsTrigger>
      </TabsList>
      <TabsContent value="dash" className="space-y-4">
        <Stats />
        <AiToggle />
        <ReportsReview />
      </TabsContent>
      <TabsContent value="crops"><CropList crops={crops ?? []} onOpen={setCropId} onWizard={() => setWizard(true)} /></TabsContent>
      <TabsContent value="test"><AccuracyTest crops={crops ?? []} /></TabsContent>
    </Tabs>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["admin-crops"] });
    qc.invalidateQueries({ queryKey: ["crops"] });
    qc.invalidateQueries({ queryKey: ["crop"] });
  };
}

/* ---------------- Crops ---------------- */
function CropList({ crops, onOpen, onWizard }: { crops: (Crop & { disease_classes: (DClass & { reference_images: unknown })[] })[]; onOpen: (id: string) => void; onWizard: () => void }) {
  const refresh = useRefresh();
  const [editing, setEditing] = useState<Partial<Crop> | null>(null);

  const toggle = async (id: string, v: boolean) => {
    const { error } = await supabase.from("crop_profiles").update({ is_active: v }).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  };
  const remove = async (c: Crop) => {
    if (!confirm(`"${c.name_bn}" এবং এর সব রোগের শ্রেণি ও ছবি মুছে ফেলবেন?`)) return;
    const { error } = await supabase.from("crop_profiles").delete().eq("id", c.id);
    if (error) toast.error(error.message);
    else toast.success("মুছে ফেলা হয়েছে");
    refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">ফসল প্রোফাইল</h2>
        <Button size="sm" variant="outline" onClick={() => setEditing({ is_active: true })}><Plus /> শুধু নাম দিয়ে</Button>
      </div>
      <button type="button" onClick={onWizard} className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-primary bg-secondary/40 p-4 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Plus /></span>
        <span className="min-w-0">
          <span className="block font-semibold text-primary">নতুন পাতা যোগ করুন (সহজ ফর্ম)</span>
          <span className="block text-xs text-muted-foreground">পাতার নাম, রোগের তালিকা, লক্ষণ-চিকিৎসা ও রোগাক্রান্ত ছবি একসাথে জমা দিন</span>
        </span>
      </button>
      {crops.map((c) => {
        const weak = c.disease_classes.filter((d) => imgCount(d) < MIN_IMAGES).length;
        return (
          <div key={c.id} className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <Button variant="ghost" className="h-auto min-w-0 flex-1 flex-col items-start gap-0 whitespace-normal px-0 text-left" onClick={() => onOpen(c.id)}>
                <div className="font-semibold">{c.name_bn} <span className="text-sm font-normal text-muted-foreground">({c.name_en})</span></div>
                <div className="text-xs text-muted-foreground">{bn(c.disease_classes.length)}টি শ্রেণি{weak > 0 && ` · ${bn(weak)}টিতে ছবি কম`}</div>
              </Button>
              <Switch checked={c.is_active} onCheckedChange={(v) => toggle(c.id, v)} aria-label="সক্রিয়" />
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => onOpen(c.id)}>রোগের শ্রেণি <ChevronRight /></Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(c)} aria-label="সম্পাদনা"><Pencil /></Button>
              <Button variant="outline" size="sm" onClick={() => remove(c)} aria-label="মুছুন"><Trash2 className="text-destructive" /></Button>
            </div>
          </div>
        );
      })}
      {crops.length === 0 && <p className="text-muted-foreground">কোনো ফসল নেই।</p>}
      <CropDialog value={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </div>
  );
}

function CropDialog({ value, onClose, onSaved }: { value: Partial<Crop> | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Crop>>({});
  const [busy, setBusy] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const open = !!value;
  const cur = { ...value, ...f };

  const save = async () => {
    if (!cur.name_bn || !cur.name_en) { toast.error("বাংলা ও ইংরেজি নাম দিন"); return; }
    setBusy(true);
    let cover = cur.cover_image_url ?? null;
    if (coverFile) {
      try { cover = await uploadCoverImage(coverFile); }
      catch { setBusy(false); toast.error("কভার ছবি আপলোড হয়নি"); return; }
    }
    const row = { name_bn: cur.name_bn, name_en: cur.name_en, description: cur.description ?? null, cover_image_url: cover, is_active: cur.is_active ?? true };
    const { error } = value?.id
      ? await supabase.from("crop_profiles").update(row).eq("id", value.id)
      : await supabase.from("crop_profiles").insert(row);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("সংরক্ষিত হয়েছে");
    setF({}); setCoverFile(null); onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setF({}); setCoverFile(null); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{value?.id ? "ফসল সম্পাদনা" : "নতুন ফসল"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="বাংলা নাম"><Input value={cur.name_bn ?? ""} placeholder="পেয়ারা পাতা" onChange={(e) => setF({ ...f, name_bn: e.target.value })} /></Field>
          <Field label="English name"><Input value={cur.name_en ?? ""} placeholder="Guava Leaf" onChange={(e) => setF({ ...f, name_en: e.target.value })} /></Field>
          <Field label="বিবরণ"><Textarea value={cur.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="কভার ছবি (ঐচ্ছিক)">
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm font-medium text-primary">
              <ImageUp className="h-4 w-4" /> {coverFile ? coverFile.name : cur.cover_image_url ? "ছবি বদলান" : "ছবি বাছুন"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
            </label>
            {cur.cover_image_url && !coverFile && !isStoredCover(cur.cover_image_url) && <p className="text-xs text-muted-foreground">বর্তমান: {cur.cover_image_url}</p>}
          </Field>
          <label className="flex items-center justify-between text-sm">সক্রিয় <Switch checked={cur.is_active ?? true} onCheckedChange={(v) => setF({ ...f, is_active: v })} /></label>
          <Button className="w-full" disabled={busy} onClick={save}>সংরক্ষণ করুন</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Classes ---------------- */
function CropDetail({ crop, onBack, onOpen }: { crop: Crop & { disease_classes: (DClass & { reference_images: unknown })[] }; onBack: () => void; onOpen: (id: string) => void }) {
  const refresh = useRefresh();
  const [editing, setEditing] = useState<Partial<DClass> | null>(null);
  const classes = [...crop.disease_classes].sort((a, b) => a.sort_order - b.sort_order);

  const remove = async (d: DClass) => {
    if (!confirm(`"${d.name_bn}" ও এর সব ছবি মুছে ফেলবেন?`)) return;
    const { error } = await supabase.from("disease_classes").delete().eq("id", d.id);
    if (error) toast.error(error.message);
    refresh();
  };

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft /> সব ফসল</Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{crop.name_bn} – রোগের শ্রেণি</h2>
        <Button size="sm" onClick={() => setEditing({ crop_profile_id: crop.id, color_hex: "#16a34a", sort_order: classes.length + 1, is_healthy: false })}><Plus /> নতুন</Button>
      </div>
      {classes.map((d) => {
        const n = imgCount(d);
        return (
          <div key={d.id} className="rounded-2xl bg-card p-4 shadow-soft">
            <Button variant="ghost" className="h-auto w-full items-center justify-start gap-3 whitespace-normal px-0 text-left" onClick={() => onOpen(d.id)}>
              <span className="h-8 w-8 shrink-0 rounded-full border" style={{ backgroundColor: d.color_hex ?? undefined }} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{d.name_bn} <span className="text-sm text-muted-foreground">({d.name_en})</span></div>
                <div className="text-xs text-muted-foreground">{bn(n)}টি ছবি{d.is_healthy && " · সুস্থ"}</div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Button>
            {n < MIN_IMAGES && <WarnBadge />}
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => onOpen(d.id)}><ImageUp /> ছবি</Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(d)} aria-label="সম্পাদনা"><Pencil /></Button>
              <Button variant="outline" size="sm" onClick={() => remove(d)} aria-label="মুছুন"><Trash2 className="text-destructive" /></Button>
            </div>
          </div>
        );
      })}
      {classes.length === 0 && <p className="text-muted-foreground">কোনো শ্রেণি নেই।</p>}
      <RecomputeEmbeddings cropId={crop.id} classIds={classes.map((c) => c.id)} />
      <ClassDialog value={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </div>
  );
}

function WarnBadge() {
  return (
    <div className="mt-2 inline-flex max-w-full items-start gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
      <TriangleAlert className="mt-1 h-3.5 w-3.5 shrink-0" /> ভালো ফলাফলের জন্য কমপক্ষে ২০টি ছবি দিন
    </div>
  );
}

function ClassDialog({ value, onClose, onSaved }: { value: Partial<DClass> | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<DClass>>({});
  const [busy, setBusy] = useState(false);
  const cur = { ...value, ...f };

  const save = async () => {
    if (!cur.name_bn || !cur.name_en || !cur.crop_profile_id) { toast.error("বাংলা ও ইংরেজি নাম দিন"); return; }
    setBusy(true);
    const row = {
      crop_profile_id: cur.crop_profile_id, name_bn: cur.name_bn, name_en: cur.name_en, is_healthy: !!cur.is_healthy,
      symptoms_bn: cur.symptoms_bn ?? null, treatment_bn: cur.treatment_bn ?? null, prevention_bn: cur.prevention_bn ?? null,
      color_hex: cur.color_hex ?? "#16a34a", sort_order: cur.sort_order ?? 0,
    };
    const { error } = value?.id
      ? await supabase.from("disease_classes").update(row).eq("id", value.id)
      : await supabase.from("disease_classes").insert(row);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("সংরক্ষিত হয়েছে");
    setF({}); onSaved(); onClose();
  };

  return (
    <Dialog open={!!value} onOpenChange={(o) => { if (!o) { setF({}); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{value?.id ? "শ্রেণি সম্পাদনা" : "নতুন রোগের শ্রেণি"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="বাংলা নাম"><Input value={cur.name_bn ?? ""} onChange={(e) => setF({ ...f, name_bn: e.target.value })} /></Field>
          <Field label="English name"><Input value={cur.name_en ?? ""} onChange={(e) => setF({ ...f, name_en: e.target.value })} /></Field>
          <div className="flex items-end gap-3">
            <Field label="রং"><input type="color" className="h-11 w-16 rounded-lg border" value={cur.color_hex ?? "#16a34a"} onChange={(e) => setF({ ...f, color_hex: e.target.value })} /></Field>
            <Field label="ক্রম"><Input type="number" value={cur.sort_order ?? 0} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} /></Field>
          </div>
          <label className="flex items-center justify-between text-sm">সুস্থ পাতা (Healthy) <Switch checked={!!cur.is_healthy} onCheckedChange={(v) => setF({ ...f, is_healthy: v })} /></label>
          <Field label="লক্ষণ"><Textarea value={cur.symptoms_bn ?? ""} onChange={(e) => setF({ ...f, symptoms_bn: e.target.value })} /></Field>
          <Field label="চিকিৎসা"><Textarea value={cur.treatment_bn ?? ""} onChange={(e) => setF({ ...f, treatment_bn: e.target.value })} /></Field>
          <Field label="প্রতিরোধ"><Textarea value={cur.prevention_bn ?? ""} onChange={(e) => setF({ ...f, prevention_bn: e.target.value })} /></Field>
          <Button className="w-full" disabled={busy} onClick={save}>সংরক্ষণ করুন</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 flex-1 space-y-1"><Label>{label}</Label>{children}</div>;
}

/* ---------------- Images ---------------- */
function ClassImages({ crop, dclass, onBack }: { crop: Crop; dclass: DClass; onBack: () => void }) {
  const refresh = useRefresh();
  const qc = useQueryClient();
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const { data: images } = useQuery({
    queryKey: ["ref-images", dclass.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("reference_images").select("id, image_url").eq("disease_class_id", dclass.id).order("created_at", { ascending: false });
      if (error) throw error;
      const paths = data.map((d) => d.image_url);
      const { data: signed } = paths.length ? await supabase.storage.from("reference-images").createSignedUrls(paths, 3600) : { data: [] };
      return data.map((d, i) => ({ ...d, url: signed?.[i]?.signedUrl ?? "" }));
    },
  });

  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setProgress({ done: 0, total: imgs.length });
    let ok = 0;
    for (const f of imgs) {
      try {
        await uploadReferenceImage(dclass.id, f);
        ok++;
      } catch (e) {
        console.error(e);
      }
      setProgress((p) => p && { ...p, done: p.done + 1 });
    }
    setProgress(null);
    invalidateClassifier(crop.id);
    if (ok < imgs.length) toast.error(`${bn(imgs.length - ok)}টি ছবি আপলোড হয়নি`);
    if (ok) toast.success(`${bn(ok)}টি ছবি আপলোড হয়েছে`);
    qc.invalidateQueries({ queryKey: ["ref-images", dclass.id] });
    refresh();
  };

  const remove = async (id: string, path: string) => {
    await supabase.storage.from("reference-images").remove([path]);
    const { error } = await supabase.from("reference_images").delete().eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["ref-images", dclass.id] });
    refresh();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    upload(Array.from(e.dataTransfer.files));
  };

  const count = images?.length ?? 0;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft /> {crop.name_bn}</Button>
      <div className="flex items-center gap-3">
        <span className="h-8 w-8 shrink-0 rounded-full border" style={{ backgroundColor: dclass.color_hex ?? undefined }} />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{dclass.name_bn} ({dclass.name_en})</h2>
          <div className="text-sm text-muted-foreground">মোট {bn(count)}টি ছবি</div>
        </div>
      </div>
      {images && count < MIN_IMAGES && <WarnBadge />}

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-4 text-center transition sm:p-6 ${drag ? "border-primary bg-secondary" : "border-border bg-card"}`}
      >
        <ImageUp className="mx-auto h-10 w-10 text-leaf" />
        <p className="mt-2 text-sm text-muted-foreground">এখানে ছবি টেনে আনুন, অথবা নিচের বোতাম ব্যবহার করুন</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-sm font-medium text-primary-foreground">
            <ImageUp className="h-4 w-4" /> ছবি বাছুন
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </label>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-primary px-3 py-3 text-sm font-medium text-primary">
            <Camera className="h-4 w-4" /> ক্যামেরা
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </label>
        </div>
        {progress && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">আপলোড হচ্ছে {bn(progress.done)}/{bn(progress.total)}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images?.map((img) => (
          <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
            {img.url && <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />}
            <Button variant="destructive" size="icon"
              onClick={() => remove(img.id, img.image_url)}
              className="absolute right-1 top-1 h-11 w-11 rounded-md"
              aria-label="ছবি মুছুন"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecomputeEmbeddings({ cropId, classIds }: { cropId: string; classIds: string[] }) {
  const [p, setP] = useState<{ done: number; total: number } | null>(null);
  const run = async () => {
    if (!classIds.length) return;
    const { data, error } = await supabase.from("reference_images").select("id, image_url").in("disease_class_id", classIds);
    if (error) { toast.error(error.message); return; }
    setP({ done: 0, total: data.length });
    let fail = 0;
    for (const r of data) {
      try {
        const { data: blob, error: e1 } = await supabase.storage.from("reference-images").download(r.image_url);
        if (e1 || !blob) throw e1;
        const embedding = await embeddingFromBlob(blob);
        const { error: e2 } = await supabase.from("reference_images").update({ embedding }).eq("id", r.id);
        if (e2) throw e2;
      } catch (e) { console.error(e); fail++; }
      setP((x) => x && { ...x, done: x.done + 1 });
    }
    setP(null);
    invalidateClassifier(cropId);
    if (fail) toast.error(`${bn(fail)}টি ছবির ফিঙ্গারপ্রিন্ট হয়নি`);
    else toast.success("সব ছবির ফিঙ্গারপ্রিন্ট আপডেট হয়েছে");
  };
  return (
    <div className="rounded-2xl bg-card p-4 shadow-soft">
      <Button className="h-auto min-h-12 w-full whitespace-normal py-3 text-left leading-snug" variant="secondary" disabled={!!p} onClick={run}><RefreshCw className={p ? "animate-spin" : ""} /> সব ছবির ফিঙ্গারপ্রিন্ট আপডেট করুন</Button>
      {p && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{bn(p.done)}/{bn(p.total)}</p>
        </div>
      )}
    </div>
  );
}

function ReportsReview() {
  const refresh = useRefresh();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diagnosis_reports")
        .select("*, suggested:disease_classes!diagnosis_reports_suggested_class_id_fkey(name_bn, name_en), predicted:disease_classes!diagnosis_reports_predicted_class_id_fkey(name_bn), crop:crop_profiles(name_bn)")
        .eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw error;
      const { data: signed } = data.length ? await supabase.storage.from("diagnosis-images").createSignedUrls(data.map((r) => r.image_url), 3600) : { data: [] };
      return data.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? "" }));
    },
  });
  if (!data?.length) return <p className="rounded-2xl bg-secondary p-4 text-sm">"ভুল ফলাফল" রিপোর্ট নেই।</p>;

  const decide = async (r: (typeof data)[number], approve: boolean) => {
    setBusy(r.id);
    try {
      if (approve) {
        const { data: blob, error } = await supabase.storage.from("diagnosis-images").download(r.image_url);
        if (error || !blob) throw error ?? new Error("download failed");
        const path = `${r.suggested_class_id}/${crypto.randomUUID()}.jpg`;
        const { error: e1 } = await supabase.storage.from("reference-images").upload(path, blob, { contentType: "image/jpeg" });
        if (e1) throw e1;
        let embedding: number[] | null = null;
        try { embedding = await embeddingFromBlob(blob); } catch (e) { console.error(e); }
        const { error: e2 } = await supabase.from("reference_images").insert({ disease_class_id: r.suggested_class_id, image_url: path, embedding });
        if (e2) throw e2;
        invalidateClassifier(r.crop_profile_id);
      }
      const { error: e3 } = await supabase.from("diagnosis_reports").update({ status: approve ? "approved" : "rejected" }).eq("id", r.id);
      if (e3) throw e3;
      toast.success(approve ? "রেফারেন্স ছবি হিসেবে যোগ হয়েছে" : "বাতিল করা হয়েছে");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ত্রুটি হয়েছে");
    }
    setBusy(null);
    qc.invalidateQueries({ queryKey: ["reports"] });
    refresh();
  };

  return (
    <div className="mb-6 space-y-3">
      <h2 className="text-lg font-semibold">ভুল ফলাফল রিপোর্ট ({bn(data.length)})</h2>
      {data.map((r) => (
        <div key={r.id} className="flex gap-3 rounded-2xl bg-card p-3 shadow-soft">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">{r.url && <img src={r.url} alt="" className="h-full w-full object-cover" />}</div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="text-xs text-muted-foreground">{r.crop?.name_bn} · অনুমান: {r.predicted?.name_bn ?? "অনিশ্চিত"}</div>
            <div className="font-medium">সঠিক: {r.suggested?.name_bn} ({r.suggested?.name_en})</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" disabled={busy === r.id} onClick={() => decide(r, true)}>অনুমোদন</Button>
              <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => decide(r, false)}>বাতিল</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
