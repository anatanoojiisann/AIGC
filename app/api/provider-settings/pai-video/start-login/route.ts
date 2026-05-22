import { startPaiVideoLogin } from "@/lib/browser/provider-login";
import { okJson } from "@/lib/api-response";
import { parseLoginBrowser, providerLoginErrorJson } from "../../_browser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await startPaiVideoLogin(parseLoginBrowser(body.browser));
    return okJson(result);
  } catch (error) {
    return providerLoginErrorJson(error);
  }
}
