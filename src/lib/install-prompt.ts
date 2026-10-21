// Pure helpers for the "install the app" banner so the rules stay testable.

export type InstallMode = "native" | "ios" | "manual";

/** Session key: once dismissed, the banner stays hidden until the next visit. */
export const INSTALL_DISMISS_KEY = "leafdoc-install-dismissed";

/** iPhone/iPad (including iPadOS that reports itself as a Mac with touch). */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function shouldShowInstall(opts: {
  standalone: boolean;
  inIframe: boolean;
  dismissed: boolean;
}): boolean {
  return !opts.standalone && !opts.inIframe && !opts.dismissed;
}

/** Which kind of banner to show: real install button, iOS steps, or menu steps. */
export function pickInstallMode(opts: { hasNativePrompt: boolean; ios: boolean }): InstallMode {
  if (opts.hasNativePrompt) return "native";
  if (opts.ios) return "ios";
  return "manual";
}
