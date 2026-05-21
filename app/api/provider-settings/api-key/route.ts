import { apiErrorMessage, errorJson, okJson } from "@/lib/api-response";
import {
  clearPixVerseApiKey,
  providerSettingsResponse,
  readProviderSettings,
  savePixVerseApiKey
} from "@/lib/provider-settings/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
    await savePixVerseApiKey(apiKey);
    const settings = await readProviderSettings();
    return okJson({
      apiKey: settings.pixverseOfficialApi,
      settings: providerSettingsResponse(settings)
    });
  } catch (error) {
    return errorJson("VALIDATION_ERROR", apiErrorMessage(error), 400);
  }
}

export async function DELETE() {
  try {
    await clearPixVerseApiKey();
    const settings = await readProviderSettings();
    return okJson({
      apiKey: settings.pixverseOfficialApi,
      settings: providerSettingsResponse(settings)
    });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", apiErrorMessage(error), 500);
  }
}
