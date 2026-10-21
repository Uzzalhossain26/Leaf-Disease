import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Camera, ImageUp, ListPlus, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { invalidateClassifier } from "@/lib/leafEngine";
import { uploadCoverImage, uploadReferenceImage } from "@/lib/reference-upload";
import { healthyDisease, newDisease, parseNameList, validateLeafDraft, type DiseaseDraft } from "@/lib/leaf-wizard";

const bn = (n: number) => n.toLocaleString("bn-BD");

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 flex-1 space-y-1"><Label>{label}</Label>{children}</div>;
}

function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null;
}

function PhotoPicker({ files, onAdd, onRemove, multiple = true }: { files: File[]; onAdd: (f: File[]) => void; onRemove: (i: number) => void; multiple?: boolean }) {
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAdd(Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/")));
    e.target.value = "";
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          <ImageUp className="h-4 w-4" /> ছবি বাছুন
          <input type="file" accept="image/*" multiple={multiple} className="hidden" onChange={pick} />
        </label>
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm font-medium text-primary">
          <Camera className="h-4 w-4" /> ক্যামেরা
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
        </label>
      </div>
      {files.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="relative aspect-square overflow-hidden rounded-md bg-muted">
              <Thumb file={f} />
              <button type="button" onClick={() => onRemove(i)} aria-label="ছবি বাদ দিন" className="absolute right-0.5 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LeafWizard({ onBack, onDone }: { onBack: () => void; onDone: (cropId: string) => void }) {
  const [nameBn, setNameBn] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [desc, setDesc] = useState("");
  const [cover, setCover] = useState<File[]>([]);
  const [list, setList] = useState("");
  const [diseases, setDiseases] = useState<DiseaseDraft[]>([healthyDisease(), newDisease(0)]);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);

  const upd = (key: string, patch: Partial<DiseaseDraft>) =>
    setDiseases((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const addFromList = () => {
    const names = parseNameList(list);
    if (!names.length) { toast.error("প্রতি লাইনে একটি রোগের নাম লিখুন"); return; }
    setDiseases((ds) => {
      const kept = ds.filter((d) => d.is_healthy || d.name_bn || d.name_en || d.files.length);
      return [...kept, ...names.map((n, i) => newDisease(kept.length + i, n))];
    });
    setList("");
    toast.success(`${bn(names.length)}টি রোগ যোগ হয়েছে — এখন তথ্য ও ছবি দিন`);
  };

  const save = async () => {
    const err = validateLeafDraft({ name_bn: nameBn, name_en: nameEn, description: desc, diseases });
    if (err) { toast.error(err); return; }
    const totalImgs = diseases.reduce((s, d) => s + d.files.length, 0);
    setProgress({ done: 0, total: totalImgs, label: "পাতার প্রোফাইল তৈরি হচ্ছে…" });
    try {
      let coverPath: string | null = null;
      if (cover[0]) coverPath = await uploadCoverImage(cover[0]);
      const { data: crop, error } = await supabase
        .from("crop_profiles")
        .insert({ name_bn: nameBn.trim(), name_en: nameEn.trim(), description: desc.trim() || null, cover_image_url: coverPath, is_active: true })
        .select("id").single();
      if (error) throw error;

      const rows = diseases.map((d, i) => ({
        crop_profile_id: crop.id, name_bn: d.name_bn.trim(), name_en: d.name_en.trim(), is_healthy: d.is_healthy,
        symptoms_bn: d.symptoms_bn.trim() || null, treatment_bn: d.treatment_bn.trim() || null, prevention_bn: d.prevention_bn.trim() || null,
        color_hex: d.color_hex, sort_order: i + 1,
      }));
      const { data: classes, error: e2 } = await supabase.from("disease_classes").insert(rows).select("id, sort_order");
      if (e2) throw e2;

      let done = 0, failed = 0;
      for (const [i, d] of diseases.entries()) {
        const cls = classes.find((c) => c.sort_order === i + 1);
        if (!cls) continue;
        for (const f of d.files) {
          setProgress({ done, total: totalImgs, label: `ছবি আপলোড হচ্ছে: ${d.name_bn}` });
          try { await uploadReferenceImage(cls.id, f); } catch (e) { console.error(e); failed++; }
          done++;
        }
      }
      invalidateClassifier(crop.id);
      if (failed) toast.error(`${bn(failed)}টি ছবি আপলোড হয়নি`);
      toast.success(`"${nameBn}" যোগ হয়েছে`);
      onDone(crop.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "সংরক্ষণ করা যায়নি");
    }
    setProgress(null);
  };

  const busy = !!progress;

  return (
    <div className="space-y-4 pb-4">
      <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}><ArrowLeft /> সব ফসল</Button>
      <div>
        <h2 className="font-display text-xl font-bold">নতুন পাতা যোগ করুন</h2>
        <p className="text-sm text-muted-foreground">এক পাতাতেই নাম, রোগের তালিকা, তথ্য ও ছবি দিয়ে সংরক্ষণ করুন।</p>
      </div>

      <section className="space-y-3 rounded-lg bg-card p-4 shadow-soft">
        <h3 className="font-semibold">১. পাতার তথ্য</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="বাংলা নাম"><Input value={nameBn} placeholder="যেমন: বেগুন পাতা" onChange={(e) => setNameBn(e.target.value)} /></F>
          <F label="English name"><Input value={nameEn} placeholder="e.g. Eggplant Leaf" onChange={(e) => setNameEn(e.target.value)} /></F>
        </div>
        <F label="বিবরণ (ঐচ্ছিক)"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></F>
        <F label="কভার ছবি (ঐচ্ছিক)">
          <PhotoPicker files={cover} multiple={false} onAdd={(f) => setCover(f.slice(0, 1))} onRemove={() => setCover([])} />
        </F>
      </section>

      <section className="space-y-3 rounded-lg bg-card p-4 shadow-soft">
        <h3 className="font-semibold">২. রোগের নামের তালিকা</h3>
        <p className="text-sm text-muted-foreground">প্রতি লাইনে একটি রোগ লিখুন: <span className="font-medium text-foreground">বাংলা নাম | English name</span></p>
        <Textarea rows={4} value={list} onChange={(e) => setList(e.target.value)} placeholder={"ফল ও কাণ্ড পচা | Fruit Rot\nপাতা কোঁকড়ানো | Leaf Curl"} />
        <Button variant="secondary" className="w-full" onClick={addFromList} disabled={busy}><ListPlus /> তালিকা থেকে রোগ যোগ করুন</Button>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">৩. প্রতিটি রোগের তথ্য ও ছবি</h3>
        {diseases.map((d, i) => (
          <div key={d.key} className="space-y-3 rounded-lg border-l-4 bg-card p-4 shadow-soft" style={{ borderLeftColor: d.color_hex }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{bn(i + 1)}. {d.name_bn || "নতুন রোগ"}{d.is_healthy && " (সুস্থ)"}</span>
              <Button variant="ghost" size="icon" aria-label="রোগ বাদ দিন" disabled={busy} onClick={() => setDiseases((ds) => ds.filter((x) => x.key !== d.key))}><Trash2 className="text-destructive" /></Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="বাংলা নাম"><Input value={d.name_bn} onChange={(e) => upd(d.key, { name_bn: e.target.value })} /></F>
              <F label="English name"><Input value={d.name_en} onChange={(e) => upd(d.key, { name_en: e.target.value })} /></F>
            </div>
            <div className="flex items-end gap-3">
              <F label="রং"><input type="color" className="h-11 w-16 rounded-lg border" value={d.color_hex} onChange={(e) => upd(d.key, { color_hex: e.target.value })} /></F>
              <label className="flex min-h-11 flex-1 items-center justify-between gap-2 text-sm">সুস্থ পাতা <Switch checked={d.is_healthy} onCheckedChange={(v) => upd(d.key, { is_healthy: v })} /></label>
            </div>
            <F label="লক্ষণ (পাতার রং, দাগ, টেক্সচার)"><Textarea value={d.symptoms_bn} onChange={(e) => upd(d.key, { symptoms_bn: e.target.value })} /></F>
            {!d.is_healthy && (
              <>
                <F label="চিকিৎসা"><Textarea value={d.treatment_bn} onChange={(e) => upd(d.key, { treatment_bn: e.target.value })} /></F>
                <F label="প্রতিরোধ"><Textarea value={d.prevention_bn} onChange={(e) => upd(d.key, { prevention_bn: e.target.value })} /></F>
              </>
            )}
            <F label={`ছবি (${bn(d.files.length)}টি) — কমপক্ষে ২০টি ভালো`}>
              <PhotoPicker files={d.files} onAdd={(f) => upd(d.key, { files: [...d.files, ...f] })} onRemove={(j) => upd(d.key, { files: d.files.filter((_, k) => k !== j) })} />
            </F>
          </div>
        ))}
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => setDiseases((ds) => [...ds, newDisease(ds.length)])}><Plus /> আরেকটি রোগ যোগ করুন</Button>
      </section>

      {progress && (
        <div className="rounded-lg bg-secondary p-4">
          <p className="mb-2 text-sm">{progress.label}</p>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 10}%` }} />
          </div>
          {progress.total > 0 && <p className="mt-1 text-xs text-muted-foreground">{bn(progress.done)}/{bn(progress.total)}</p>}
        </div>
      )}
      <Button size="lg" className="w-full" disabled={busy} onClick={save}><Save /> সব সংরক্ষণ করুন</Button>
    </div>
  );
}
