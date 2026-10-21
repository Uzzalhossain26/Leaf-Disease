import { Link } from "@tanstack/react-router";
import { Home, History, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import logo from "@/assets/leafdoc-logo.png.asset.json";
import { useAuth } from "@/lib/use-auth";
import { InstallPrompt } from "@/components/InstallPrompt";

export function AppShell({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  const items = [
    { to: "/", label: "হোম", icon: Home },
    { to: "/history", label: "ইতিহাস", icon: History },
    // Admin link appears only for signed-in admins; others never see it.
    ...(isAdmin ? [{ to: "/admin", label: "অ্যাডমিন", icon: ShieldCheck }] : []),
  ] as const;
  return (
    <div className="app-shell mx-auto flex min-h-dvh w-full min-w-0 max-w-xl flex-col">
      <header className="app-header sticky top-0 z-20 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <img src={logo.url} alt="LeafDoc – পাতা ডাক্তার লোগো" className="h-12 w-auto object-contain" />
      </header>
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      <footer className="px-4 pb-3 text-center text-xs text-muted-foreground">
        Design and Developed By- <span className="font-semibold text-primary">Md. Uzzal Hossain</span>
      </footer>
      <InstallPrompt />
      <nav aria-label="প্রধান মেনু" className="app-navigation fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur">
        <div className={`mx-auto grid max-w-xl gap-1 px-3 py-2 ${items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {items.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-sm text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              activeProps={{ className: "bg-secondary text-primary font-semibold" }}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
