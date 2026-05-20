import { boolEnv } from "@/lib/utils";
import { GenerationRequest, GenerationResult } from "@/lib/adapters/types";

export class PlaywrightAutomationAdapter {
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    if (!boolEnv(process.env.ENABLE_PLAYWRIGHT_AUTOMATION)) {
      return {
        status: "manual_required",
        response: { provider: "playwright_automation", blocked: true },
        error: "Playwright automation is disabled by ENABLE_PLAYWRIGHT_AUTOMATION=false."
      };
    }

    return {
      status: "manual_required",
      response: {
        provider: "playwright_automation",
        request,
        note: "Open a headed Playwright session, log in manually, then automate normal upload, prompt fill, generate, wait, and download steps. Captcha, anti-bot checks, credits, payments, login walls, and rate limits must remain manual."
      },
      error: "Manual browser session required before automation can continue."
    };
  }
}
