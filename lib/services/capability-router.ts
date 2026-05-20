import { prisma } from "@/lib/db";
import { Provider } from "@/lib/adapters/types";
import { boolEnv } from "@/lib/utils";

export class CapabilityRouter {
  async resolve(userSelectedProvider?: Provider, capabilityId?: string | null): Promise<Provider> {
    if (userSelectedProvider && userSelectedProvider !== "manual_required") {
      const allowed = await this.isProviderAllowed(userSelectedProvider, capabilityId);
      if (allowed) return userSelectedProvider;
    }

    if (await this.isProviderAllowed("official_pixverse")) return "official_pixverse";
    if (await this.isProviderAllowed("observed_web_api", capabilityId)) return "observed_web_api";
    if (await this.isProviderAllowed("playwright_automation")) return "playwright_automation";
    return "manual_required";
  }

  async isProviderAllowed(provider: Provider, capabilityId?: string | null) {
    if (provider === "official_pixverse") {
      return prisma.capability.findFirst({
        where: { provider, enabled: true, productionAllowed: true }
      });
    }

    if (provider === "observed_web_api") {
      if (!boolEnv(process.env.ENABLE_OBSERVED_WEB_API) || !capabilityId) return false;
      const capability = await prisma.capability.findUnique({ where: { id: capabilityId } });
      return Boolean(capability?.enabled && capability.productionAllowed && capability.provider === "observed_web_api");
    }

    if (provider === "playwright_automation") {
      if (!boolEnv(process.env.ENABLE_PLAYWRIGHT_AUTOMATION)) return false;
      const capability = await prisma.capability.findFirst({ where: { provider, enabled: true } });
      return Boolean(capability);
    }

    return false;
  }
}
