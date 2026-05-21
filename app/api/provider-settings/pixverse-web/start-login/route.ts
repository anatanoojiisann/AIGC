import { apiErrorMessage, errorJson, okJson } from "@/lib/api-response";
import { startPixVerseLogin } from "@/lib/browser/provider-login";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const method = body.method === "google" ? "google" : "email";
    const result = await startPixVerseLogin(method);
    return okJson(result);
  } catch (error) {
    return errorJson("INTERNAL_ERROR", apiErrorMessage(error), 500);
  }
}
