import { boolEnv } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    settings: {
      officialPixVerseConfigured: Boolean(process.env.PIXVERSE_API_KEY),
      observedWebApiEnabled: boolEnv(process.env.ENABLE_OBSERVED_WEB_API),
      playwrightAutomationEnabled: boolEnv(process.env.ENABLE_PLAYWRIGHT_AUTOMATION),
      storageRoot: process.env.STORAGE_ROOT || "./storage",
      redisConfigured: Boolean(process.env.REDIS_URL)
    }
  });
}
