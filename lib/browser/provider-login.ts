import { mkdir } from "fs/promises";
import { chromium, type BrowserContext } from "playwright";
import {
  paiVideoProfilePath,
  pixverseProfilePath,
  removeBrowserProfile,
  updateWebLoginStatus
} from "@/lib/provider-settings/config";

type LoginMethod = "email" | "google";

const contexts = new Map<string, BrowserContext>();

async function openPersistentLogin(provider: "pixverse" | "pai-video", url: string) {
  const profilePath = provider === "pixverse" ? pixverseProfilePath() : paiVideoProfilePath();
  await mkdir(profilePath, { recursive: true });
  const existing = contexts.get(provider);
  if (existing) {
    const page = existing.pages()[0] || (await existing.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    return { profilePath };
  }

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: { width: 1280, height: 900 }
  });
  contexts.set(provider, context);
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  return { profilePath };
}

async function closeContext(provider: "pixverse" | "pai-video") {
  const context = contexts.get(provider);
  if (context) {
    contexts.delete(provider);
    await context.close().catch(() => undefined);
  }
}

async function checkPersistentLogin(provider: "pixverse" | "pai-video", url: string, markers: RegExp[]) {
  const profilePath = provider === "pixverse" ? pixverseProfilePath() : paiVideoProfilePath();
  await mkdir(profilePath, { recursive: true });
  const context = await chromium.launchPersistentContext(profilePath, {
    headless: true
  });
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const currentUrl = page.url();
    const connected = markers.some((marker) => marker.test(bodyText) || marker.test(currentUrl));
    return connected ? "connected" : "unknown";
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function startPixVerseLogin(method: LoginMethod) {
  const loginUrl =
    method === "google"
      ? "https://app.pixverse.ai/login"
      : "https://app.pixverse.ai/login";
  await openPersistentLogin("pixverse", loginUrl);
  await updateWebLoginStatus("pixverseWebBrowser", "unknown");
  return {
    provider: "pixverse_web_browser",
    method,
    message: "PixVerse login opened in a local browser session. Complete login on the official website."
  };
}

export async function checkPixVerseLogin() {
  const status = await checkPersistentLogin("pixverse", "https://app.pixverse.ai", [
    /profile|account|logout|workspace|create|credits/i
  ]).catch(() => "error" as const);
  await updateWebLoginStatus("pixverseWebBrowser", status);
  return { provider: "pixverse_web_browser", status };
}

export async function disconnectPixVerseSession() {
  await closeContext("pixverse");
  await removeBrowserProfile("pixverse");
  await updateWebLoginStatus("pixverseWebBrowser", "not_connected");
  return { provider: "pixverse_web_browser", status: "not_connected" };
}

export async function startPaiVideoLogin() {
  await openPersistentLogin("pai-video", "https://pai.video");
  await updateWebLoginStatus("paiVideoWebBrowser", "unknown");
  return {
    provider: "pai_video_web_browser",
    message: "pai.video login opened in a local browser session. Enter your phone number and verification code on the official page."
  };
}

export async function checkPaiVideoLogin() {
  const status = await checkPersistentLogin("pai-video", "https://pai.video", [
    /profile|account|logout|workspace|create|credits|我的|退出/i
  ]).catch(() => "error" as const);
  await updateWebLoginStatus("paiVideoWebBrowser", status);
  return { provider: "pai_video_web_browser", status };
}

export async function disconnectPaiVideoSession() {
  await closeContext("pai-video");
  await removeBrowserProfile("pai-video");
  await updateWebLoginStatus("paiVideoWebBrowser", "not_connected");
  return { provider: "pai_video_web_browser", status: "not_connected" };
}
