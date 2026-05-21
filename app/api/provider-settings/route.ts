import { apiErrorMessage, errorJson, okJson } from "@/lib/api-response";
import { providerSettingsResponse, readProviderSettings } from "@/lib/provider-settings/config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const settings = await readProviderSettings();
    return okJson({ settings: providerSettingsResponse(settings) });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", apiErrorMessage(error), 500);
  }
}
