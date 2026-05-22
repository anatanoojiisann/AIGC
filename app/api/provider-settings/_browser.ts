import { errorJson } from "@/lib/api-response";
import { ProviderLoginError } from "@/lib/browser/provider-login";
import type { ApiErrorCode } from "@/lib/api-response";
import type { LoginBrowser } from "@/lib/provider-settings/config";

export function parseLoginBrowser(value: unknown): LoginBrowser {
  if (value === "chrome" || value === "safari") return value;
  throw new ProviderLoginError("INVALID_BROWSER", "Browser must be chrome or safari.");
}

export function providerLoginErrorJson(error: unknown) {
  if (error instanceof ProviderLoginError) {
    const status =
      error.code === "INVALID_BROWSER"
        ? 400
        : error.code === "PLAYWRIGHT_CHROMIUM_NOT_INSTALLED" || error.code === "PLAYWRIGHT_WEBKIT_NOT_INSTALLED"
          ? 503
          : 500;
    return errorJson(error.code as ApiErrorCode, error.message, status);
  }
  const message = error instanceof Error ? error.message : "Unexpected provider login error.";
  return errorJson("INTERNAL_ERROR", message, 500);
}
