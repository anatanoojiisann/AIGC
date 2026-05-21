import { apiErrorMessage, errorJson, okJson } from "@/lib/api-response";
import { startPaiVideoLogin } from "@/lib/browser/provider-login";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await startPaiVideoLogin();
    return okJson(result);
  } catch (error) {
    return errorJson("INTERNAL_ERROR", apiErrorMessage(error), 500);
  }
}
