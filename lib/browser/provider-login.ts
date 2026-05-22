import { mkdir } from "fs/promises";
import { chromium, webkit, type BrowserContext, type BrowserType } from "playwright";
import {
  type LoginBrowser,
  paiVideoProfilePath,
  pixverseProfilePath,
  removeBrowserProfile,
  updateWebLoginStatus
} from "@/lib/provider-settings/config";

type LoginMethod = "email" | "google";

const contexts = new Map<string, BrowserContext>();

export class ProviderLoginError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProviderLoginError";
    this.code = code;
  }
}

function browserType(browser: LoginBrowser): BrowserType {
  return browser === "safari" ? webkit : chromium;
}

function browserLabel(browser: LoginBrowser) {
  return browser === "safari" ? "Safari" : "Chrome";
}

function browserInstallError(browser: LoginBrowser) {
  return browser === "safari"
    ? new ProviderLoginError(
        "PLAYWRIGHT_WEBKIT_NOT_INSTALLED",
        "Playwright WebKit is not installed. Run: npx playwright install webkit"
      )
    : new ProviderLoginError(
        "PLAYWRIGHT_CHROMIUM_NOT_INSTALLED",
        "Playwright Chromium is not installed. Run: npx playwright install chromium"
      );
}

function normalizeLaunchError(error: unknown, browser: LoginBrowser): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/Executable doesn't exist|browserType\.launch|playwright install|Host system is missing dependencies/i.test(message)) {
    throw browserInstallError(browser);
  }
  throw new ProviderLoginError("INTERNAL_ERROR", message);
}

function contextKey(provider: "pixverse" | "pai-video", browser: LoginBrowser) {
  return `${provider}:${browser}`;
}

async function openPersistentLogin(provider: "pixverse" | "pai-video", browser: LoginBrowser, url: string) {
  const profilePath = provider === "pixverse" ? pixverseProfilePath(browser) : paiVideoProfilePath(browser);
  await mkdir(profilePath, { recursive: true });
  const key = contextKey(provider, browser);
  const existing = contexts.get(key);
  if (existing) {
    const page = existing.pages()[0] || (await existing.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    return { profilePath };
  }

  let context: BrowserContext;
  try {
    context = await browserType(browser).launchPersistentContext(profilePath, {
      headless: false,
      viewport: { width: 1280, height: 900 }
    });
  } catch (error) {
    normalizeLaunchError(error, browser);
  }
  contexts.set(key, context);
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  return { profilePath };
}

async function closeContext(provider: "pixverse" | "pai-video", browser: LoginBrowser) {
  const key = contextKey(provider, browser);
  const context = contexts.get(key);
  if (context) {
    contexts.delete(key);
    await context.close().catch(() => undefined);
  }
}

async function checkPersistentLogin(provider: "pixverse" | "pai-video", browser: LoginBrowser, url: string, markers: RegExp[]) {
  const profilePath = provider === "pixverse" ? pixverseProfilePath(browser) : paiVideoProfilePath(browser);
  await mkdir(profilePath, { recursive: true });
  let context: BrowserContext;
  try {
    context = await browserType(browser).launchPersistentContext(profilePath, {
      headless: true
    });
  } catch (error) {
    normalizeLaunchError(error, browser);
  }
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

export async function startPixVerseLogin(method: LoginMethod, browser: LoginBrowser) {
  const loginUrl =
    method === "google"
      ? "https://app.pixverse.ai/login"
      : "https://app.pixverse.ai/login";
  await openPersistentLogin("pixverse", browser, loginUrl);
  await updateWebLoginStatus("pixverseWebBrowser", "unknown");
  return {
    provider: "pixverse_web_browser",
    method,
    browser,
    message: `PixVerse ${browserLabel(browser)} login opened. Complete login on the official website.`
  };
}

export async function checkPixVerseLogin(browser: LoginBrowser) {
  let status: "connected" | "unknown" | "error";
  try {
    status = await checkPersistentLogin("pixverse", browser, "https://app.pixverse.ai", [
      /profile|account|logout|workspace|create|credits/i
    ]);
  } catch (error) {
    if (error instanceof ProviderLoginError) throw error;
    status = "error";
  }
  await updateWebLoginStatus("pixverseWebBrowser", status);
  return { provider: "pixverse_web_browser", browser, status };
}

export async function disconnectPixVerseSession(browser: LoginBrowser) {
  await closeContext("pixverse", browser);
  await removeBrowserProfile("pixverse", browser);
  await updateWebLoginStatus("pixverseWebBrowser", "not_connected");
  return { provider: "pixverse_web_browser", browser, status: "not_connected" };
}

export async function startPaiVideoLogin(browser: LoginBrowser) {
  await openPersistentLogin("pai-video", browser, "https://pai.video");
  await updateWebLoginStatus("paiVideoWebBrowser", "unknown");
  return {
    provider: "pai_video_web_browser",
    browser,
    message: `pai.video ${browserLabel(browser)} login opened. Enter your phone number and verification code on the official page.`
  };
}

export async function checkPaiVideoLogin(browser: LoginBrowser) {
  let status: "connected" | "unknown" | "error";
  try {
    status = await checkPersistentLogin("pai-video", browser, "https://pai.video", [
      /profile|account|logout|workspace|create|credits|我的|退出/i
    ]);
  } catch (error) {
    if (error instanceof ProviderLoginError) throw error;
    status = "error";
  }
  await updateWebLoginStatus("paiVideoWebBrowser", status);
  return { provider: "pai_video_web_browser", browser, status };
}

export async function disconnectPaiVideoSession(browser: LoginBrowser) {
  await closeContext("pai-video", browser);
  await removeBrowserProfile("pai-video", browser);
  await updateWebLoginStatus("paiVideoWebBrowser", "not_connected");
  return { provider: "pai_video_web_browser", browser, status: "not_connected" };
}
