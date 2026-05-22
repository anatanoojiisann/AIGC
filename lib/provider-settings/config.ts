import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { storageRoot, assertUnderStorage } from "@/lib/storage/files";

export type ProviderSource = "mock" | "pixverse_official_api" | "pixverse_web_browser" | "pai_video_web_browser";
export type LoginStatus = "not_connected" | "connected" | "unknown" | "error";
export type LoginBrowser = "chrome" | "safari";
export type SourceStatus = "available" | "disabled" | "needs_api_key" | "needs_login" | "connected" | "error";

export type ProviderSettingsConfig = {
  activeSource: ProviderSource;
  pixverseOfficialApi: {
    enabled: boolean;
    apiKeyConfigured: boolean;
    maskedKey: string | null;
  };
  pixverseWebBrowser: {
    enabled: boolean;
    loginStatus: LoginStatus;
    profilePath: string;
    browserProfiles?: Record<LoginBrowser, string>;
  };
  paiVideoWebBrowser: {
    enabled: boolean;
    loginStatus: LoginStatus;
    profilePath: string;
    browserProfiles?: Record<LoginBrowser, string>;
  };
};

type ProviderSecrets = {
  pixverseApiKey?: string;
};

const defaultConfig: ProviderSettingsConfig = {
  activeSource: "mock",
  pixverseOfficialApi: {
    enabled: false,
    apiKeyConfigured: false,
    maskedKey: null
  },
  pixverseWebBrowser: {
    enabled: false,
    loginStatus: "not_connected",
    profilePath: "storage/browser-profiles/pixverse-chrome",
    browserProfiles: {
      chrome: "storage/browser-profiles/pixverse-chrome",
      safari: "storage/browser-profiles/pixverse-safari"
    }
  },
  paiVideoWebBrowser: {
    enabled: false,
    loginStatus: "not_connected",
    profilePath: "storage/browser-profiles/pai-video-chrome",
    browserProfiles: {
      chrome: "storage/browser-profiles/pai-video-chrome",
      safari: "storage/browser-profiles/pai-video-safari"
    }
  }
};

const providerSources = new Set<ProviderSource>([
  "mock",
  "pixverse_official_api",
  "pixverse_web_browser",
  "pai_video_web_browser"
]);

function configDirectory() {
  return assertUnderStorage(path.join(storageRoot(), "config"));
}

function settingsPath() {
  return assertUnderStorage(path.join(configDirectory(), "provider-settings.json"));
}

function secretsPath() {
  return assertUnderStorage(path.join(configDirectory(), "provider-secrets.local.json"));
}

function browserProfilePath(name: "pixverse-chrome" | "pixverse-safari" | "pai-video-chrome" | "pai-video-safari") {
  return assertUnderStorage(path.join(storageRoot(), "browser-profiles", name));
}

async function readJson<T>(filePath: string, fallback: T) {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function maskKey(key: string | undefined) {
  if (!key) return null;
  const trimmed = key.trim();
  if (!trimmed) return null;
  return `****${trimmed.slice(-4)}`;
}

async function readSecrets() {
  return readJson<ProviderSecrets>(secretsPath(), {});
}

async function writeSecrets(secrets: ProviderSecrets) {
  await writeJson(secretsPath(), secrets);
}

function mergeConfig(config: Partial<ProviderSettingsConfig>, secrets: ProviderSecrets): ProviderSettingsConfig {
  const envKey = process.env.PIXVERSE_API_KEY?.trim();
  const storedKey = secrets.pixverseApiKey?.trim();
  const configuredKey = storedKey || envKey || "";
  return {
    activeSource: providerSources.has(config.activeSource as ProviderSource) ? (config.activeSource as ProviderSource) : "mock",
    pixverseOfficialApi: {
      enabled: Boolean(config.pixverseOfficialApi?.enabled || configuredKey),
      apiKeyConfigured: Boolean(configuredKey),
      maskedKey: maskKey(configuredKey)
    },
    pixverseWebBrowser: {
      enabled: Boolean(config.pixverseWebBrowser?.enabled),
      loginStatus: config.pixverseWebBrowser?.loginStatus || "not_connected",
      profilePath: "storage/browser-profiles/pixverse-chrome",
      browserProfiles: {
        chrome: "storage/browser-profiles/pixverse-chrome",
        safari: "storage/browser-profiles/pixverse-safari"
      }
    },
    paiVideoWebBrowser: {
      enabled: Boolean(config.paiVideoWebBrowser?.enabled),
      loginStatus: config.paiVideoWebBrowser?.loginStatus || "not_connected",
      profilePath: "storage/browser-profiles/pai-video-chrome",
      browserProfiles: {
        chrome: "storage/browser-profiles/pai-video-chrome",
        safari: "storage/browser-profiles/pai-video-safari"
      }
    }
  };
}

export async function readProviderSettings() {
  const [stored, secrets] = await Promise.all([
    readJson<Partial<ProviderSettingsConfig>>(settingsPath(), defaultConfig),
    readSecrets()
  ]);
  const config = mergeConfig(stored, secrets);
  await writeJson(settingsPath(), config);
  return config;
}

export async function getPixVerseApiKey() {
  const secrets = await readSecrets();
  return secrets.pixverseApiKey?.trim() || process.env.PIXVERSE_API_KEY?.trim() || "";
}

export async function savePixVerseApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("API key is required.");
  const secrets = await readSecrets();
  secrets.pixverseApiKey = trimmed;
  await writeSecrets(secrets);
  const config = await readProviderSettings();
  config.pixverseOfficialApi = {
    enabled: true,
    apiKeyConfigured: true,
    maskedKey: maskKey(trimmed)
  };
  await writeJson(settingsPath(), config);
  return config.pixverseOfficialApi;
}

export async function clearPixVerseApiKey() {
  const secrets = await readSecrets();
  delete secrets.pixverseApiKey;
  await writeSecrets(secrets);
  const config = await readProviderSettings();
  const envKey = process.env.PIXVERSE_API_KEY?.trim();
  config.pixverseOfficialApi = {
    enabled: Boolean(envKey),
    apiKeyConfigured: Boolean(envKey),
    maskedKey: maskKey(envKey)
  };
  if (config.activeSource === "pixverse_official_api" && !config.pixverseOfficialApi.apiKeyConfigured) {
    config.activeSource = "mock";
  }
  await writeJson(settingsPath(), config);
  return config.pixverseOfficialApi;
}

export async function updateActiveSource(activeSource: ProviderSource) {
  if (!providerSources.has(activeSource)) throw new Error("Unsupported provider source.");
  const config = await readProviderSettings();
  config.activeSource = activeSource;
  await writeJson(settingsPath(), config);
  return config;
}

export async function updateWebLoginStatus(
  provider: "pixverseWebBrowser" | "paiVideoWebBrowser",
  loginStatus: LoginStatus
) {
  const config = await readProviderSettings();
  config[provider].enabled = loginStatus === "connected";
  config[provider].loginStatus = loginStatus;
  await writeJson(settingsPath(), config);
  return config[provider];
}

export function sourceStatuses(config: ProviderSettingsConfig): Record<ProviderSource, SourceStatus> {
  return {
    mock: "available",
    pixverse_official_api: config.pixverseOfficialApi.apiKeyConfigured ? "available" : "needs_api_key",
    pixverse_web_browser:
      config.pixverseWebBrowser.loginStatus === "connected" ? "connected" : config.pixverseWebBrowser.loginStatus === "error" ? "error" : "needs_login",
    pai_video_web_browser:
      config.paiVideoWebBrowser.loginStatus === "connected" ? "connected" : config.paiVideoWebBrowser.loginStatus === "error" ? "error" : "needs_login"
  };
}

export function providerSettingsResponse(config: ProviderSettingsConfig) {
  return {
    ...config,
    sources: sourceStatuses(config)
  };
}

export function pixverseProfilePath(browser: LoginBrowser) {
  return browserProfilePath(browser === "safari" ? "pixverse-safari" : "pixverse-chrome");
}

export function paiVideoProfilePath(browser: LoginBrowser) {
  return browserProfilePath(browser === "safari" ? "pai-video-safari" : "pai-video-chrome");
}

export async function removeBrowserProfile(provider: "pixverse" | "pai-video", browser: LoginBrowser) {
  const name =
    provider === "pixverse"
      ? browser === "safari"
        ? "pixverse-safari"
        : "pixverse-chrome"
      : browser === "safari"
        ? "pai-video-safari"
        : "pai-video-chrome";
  await rm(browserProfilePath(name), { recursive: true, force: true });
}
