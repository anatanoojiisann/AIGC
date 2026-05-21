import { apiErrorMessage, errorJson, okJson } from "@/lib/api-response";
import {
  providerSettingsResponse,
  type ProviderSource,
  readProviderSettings,
  sourceStatuses,
  updateActiveSource
} from "@/lib/provider-settings/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const activeSource = body.activeSource as ProviderSource;
    const current = await readProviderSettings();
    const statuses = sourceStatuses(current);
    if (activeSource !== "mock" && statuses[activeSource] !== "available" && statuses[activeSource] !== "connected") {
      return errorJson("VALIDATION_ERROR", "Selected source is not ready. Configure it before making it active.", 400);
    }
    const settings = await updateActiveSource(activeSource);
    return okJson({ settings: providerSettingsResponse(settings) });
  } catch (error) {
    return errorJson("VALIDATION_ERROR", apiErrorMessage(error), 400);
  }
}
