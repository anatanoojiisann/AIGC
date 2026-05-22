import { startPixVerseLogin } from "@/lib/browser/provider-login";
import { okJson } from "@/lib/api-response";
import { parseLoginBrowser, providerLoginErrorJson } from "../../_browser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const method = body.method === "google" ? "google" : "email";
    const browser = parseLoginBrowser(body.browser);
    const result = await startPixVerseLogin(method, browser);
    return okJson(result);
  } catch (error) {
    return providerLoginErrorJson(error);
  }
}
