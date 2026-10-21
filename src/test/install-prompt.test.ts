import { describe, expect, it } from "vitest";
import { isIosDevice, pickInstallMode, shouldShowInstall } from "@/lib/install-prompt";

describe("install banner rules", () => {
  it("shows on a normal visit in the browser", () => {
    expect(shouldShowInstall({ standalone: false, inIframe: false, dismissed: false })).toBe(true);
  });

  it("hides once the app is already installed and opened as an app", () => {
    expect(shouldShowInstall({ standalone: true, inIframe: false, dismissed: false })).toBe(false);
  });

  it("hides after the visitor closes it in this visit", () => {
    expect(shouldShowInstall({ standalone: false, inIframe: false, dismissed: true })).toBe(false);
  });

  it("uses the real install button when the browser offers one", () => {
    expect(pickInstallMode({ hasNativePrompt: true, ios: false })).toBe("native");
  });

  it("shows Add to Home Screen steps on iPhone", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
    expect(isIosDevice(ua)).toBe(true);
    expect(pickInstallMode({ hasNativePrompt: false, ios: true })).toBe("ios");
  });

  it("treats a desktop Mac without touch as not iPhone", () => {
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
  });
});
