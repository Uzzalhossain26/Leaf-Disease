import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Camera, Leaf, Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { cropsQuery } from "@/lib/queries";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "LeafDoc – পাতা ডাক্তার | পাতার রোগ শনাক্ত করুন" },
      { name: "description", content: "পাতার ছবি তুলে গাছের রোগ শনাক্ত করুন এবং চিকিৎসা ও প্রতিরোধের পরামর্শ পান।" },
      { property: "og:title", content: "LeafDoc – পাতা ডাক্তার" },
      { property: "og:description", content: "পাতার ছবি তুলে গাছের রোগ শনাক্ত করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(cropsQuery),
  errorComponent: () => <AppShell><p className="text-destructive">ফসলের তালিকা লোড করা যায়নি।</p></AppShell>,
  component: Index,
});

function Index() {
  const { data: crops } = useSuspenseQuery(cropsQuery);
  const [selected, setSelected] = useState<string | null>(crops[0]?.id ?? null);
  const navigate = useNavigate();

  return (
    <AppShell>
      <section className="mb-6 border-b border-border pb-5">
        <h1 className="font-display text-3xl font-bold leading-snug text-primary">LeafDoc – পাতা ডাক্তার</h1>
        <p className="mt-2 text-muted-foreground">আপনার গাছের পাতা কি অসুস্থ?</p>
      </section>

      <h2 className="mb-3 text-lg font-semibold">১. ফসল নির্বাচন করুন</h2>
      <div className="grid grid-cols-2 gap-3">
        {crops.map((c) => {
          const active = c.id === selected;
          const count = (c.disease_classes as unknown as { count: number }[])?.[0]?.count ?? 0;
          return (
            <Button
              key={c.id}
              variant="outline"
              aria-pressed={active}
              onClick={() => setSelected(c.id)}
              className={`relative h-auto min-w-0 flex-col items-stretch justify-start gap-0 whitespace-normal rounded-lg border-2 bg-card p-3 text-left shadow-soft transition ${active ? "border-primary bg-secondary/40" : "border-border"}`}
            >
              {active && (
                <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground"><Check className="h-3 w-3" /></span>
              )}
              {c.cover_image_url ? (
                <img src={c.cover_image_url} alt={c.name_bn} className="mb-3 aspect-[4/3] w-full rounded-md object-cover" />
              ) : (
                <div className="mb-3 flex aspect-[4/3] items-center justify-center rounded-md bg-secondary"><Leaf className="h-10 w-10 text-leaf" /></div>
              )}
              <div className="font-semibold">{c.name_bn}</div>
              <div className="text-xs text-muted-foreground">({c.name_en}) · {count}টি শ্রেণি</div>
            </Button>
          );
        })}
        {crops.length === 0 && <p className="col-span-2 text-muted-foreground">কোনো ফসল পাওয়া যায়নি।</p>}
      </div>

      <h2 className="mb-3 mt-7 text-lg font-semibold">২. পাতার ছবি দিন</h2>
      <Button
        variant="hero"
        size="xl"
        className="h-auto min-h-16 w-full whitespace-normal px-3 py-4 text-base leading-snug sm:text-lg"
        disabled={!selected}
        onClick={() => selected && navigate({ to: "/diagnose/$cropId", params: { cropId: selected } })}
      >
        <Camera /> পাতার ছবি তুলুন / আপলোড করুন
      </Button>
      <p className="mt-3 text-center text-sm text-muted-foreground">ভালো ফলাফলের জন্য দিনের আলোয় একটি পাতার কাছ থেকে ছবি তুলুন।</p>
    </AppShell>
  );
}
