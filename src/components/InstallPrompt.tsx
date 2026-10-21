import { useEffect, useState } from "react";
import { Download, Share, X, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png.asset.json";
import {
  INSTALL_DISMISS_KEY,
  isIosDevice,
  pickInstallMode,
  shouldShowInstall,
  type InstallMode,
} from "@/lib/install-prompt";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function InstallPrompt() {
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(INSTALL_DISMISS_KEY) === "1";
    } catch {
      /* storage blocked */
    }
    if (!shouldShowInstall({ standalone: isStandalone(), inIframe: inIframe(), dismissed })) return;

    const ios = isIosDevice(navigator.userAgent, navigator.maxTouchPoints);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("native");
    };
    const onInstalled = () => {
      setMode(null);
      setDeferred(null);
      toast.success("LeafDoc অ্যাপ ইন্সটল হয়েছে!");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iPhone never fires the install event, so show steps right away. Other
    // browsers get a moment to offer the real install button first.
    const timer = window.setTimeout(
      () => setMode((m) => m ?? pickInstallMode({ hasNativePrompt: false, ios })),
      ios ? 800 : 2500,
    );

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      sessionStorage.setItem(INSTALL_DISMISS_KEY, "1");
    } catch {
      /* storage blocked */
    }
    setMode(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setMode(null);
    else dismiss();
  };

  if (!mode) return null;

  return (
    <div role="dialog" aria-live="polite" aria-label="অ্যাপ ইন্সটল করুন" className="install-banner fixed inset-x-0 z-30 px-3">
      <div className="mx-auto flex max-w-xl items-start gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-lg">
        <img src={logo.url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-contain" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold text-primary">LeafDoc অ্যাপ ইন্সটল করুন</p>
          {mode === "native" && (
            <p className="text-sm text-muted-foreground">
              ফোন বা কম্পিউটারে অ্যাপের মতো এক চাপে খুলুন, আলাদা কিছু ডাউনলোড লাগবে না।
            </p>
          )}
          {mode === "ios" && (
            <p className="text-sm text-muted-foreground">
              নিচের শেয়ার বোতাম <Share aria-label="শেয়ার" className="inline h-4 w-4 align-text-bottom" /> চাপুন, তারপর{" "}
              <b>"Add to Home Screen"</b> বেছে নিন।
            </p>
          )}
          {mode === "manual" && (
            <p className="text-sm text-muted-foreground">
              ব্রাউজারের মেনু <MoreVertical aria-label="মেনু" className="inline h-4 w-4 align-text-bottom" /> থেকে{" "}
              <b>"Install app"</b> বা <b>"Add to Home screen"</b> চাপুন।
            </p>
          )}
          {mode === "native" && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={install}>
                <Download className="h-4 w-4" /> ইন্সটল করুন
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                পরে
              </Button>
            </div>
          )}
        </div>
        <Button size="icon" variant="ghost" className="shrink-0" onClick={dismiss} aria-label="বন্ধ করুন">
          <X className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
