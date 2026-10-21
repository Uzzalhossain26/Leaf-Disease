import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Sign-in only: new accounts cannot be created; only existing admins log in.
export function AuthForm({ title }: { title: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error("লগইন ব্যর্থ: ইমেইল বা পাসওয়ার্ড ভুল");
    setBusy(false);
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/admin` });
    if (r.error) toast.error("Google লগইন ব্যর্থ");
  };

  return (
    <div className="rounded-lg bg-card p-4 shadow-soft sm:p-6">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">শুধুমাত্র অ্যাডমিনদের জন্য।</p>
      <Button variant="outline" className="mt-4 w-full" onClick={google}>Google দিয়ে লগইন করুন</Button>
      <div className="my-4 text-center text-xs text-muted-foreground">অথবা</div>
      <form onSubmit={submit} className="space-y-3">
        <Input type="email" required placeholder="ইমেইল" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
        <Input type="password" required minLength={6} placeholder="পাসওয়ার্ড" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
        <Button type="submit" className="w-full" disabled={busy}>লগইন করুন</Button>
      </form>
    </div>
  );
}
