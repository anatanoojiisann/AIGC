import { OfficialPixVerseAdapter } from "@/lib/adapters/official-pixverse";
import { apiErrorMessage, errorJson, okJson } from "@/lib/api-response";
import { getPixVerseApiKey, readProviderSettings } from "@/lib/provider-settings/config";

export const runtime = "nodejs";

export async function POST() {
  try {
    const apiKey = await getPixVerseApiKey();
    if (!apiKey) {
      return errorJson("INVALID_API_KEY", "PixVerse API key test failed: no API key is configured.", 400);
    }

    const balance = await new OfficialPixVerseAdapter().getBalance();
    const settings = await readProviderSettings();
    return okJson({
      configured: settings.pixverseOfficialApi.apiKeyConfigured,
      provider: "pixverse_official_api",
      message:
        balance.mode === "mock"
          ? "API key is saved. Live PixVerse validation is not implemented in this mock MVP."
          : "API key is valid",
      masked: settings.pixverseOfficialApi.maskedKey
    });
  } catch (error) {
    return errorJson("INVALID_API_KEY", `PixVerse API key test failed: ${apiErrorMessage(error)}`, 400);
  }
}
