import { prisma } from "@/lib/db";
import { boolEnv } from "@/lib/utils";
import { GenerationRequest, GenerationResult } from "@/lib/adapters/types";

const forbiddenKeyPattern = /(cookie|session|authorization|token|csrf|xsrf|api[-_]?key|password|credential)/i;

function containsForbiddenCredentials(value: unknown): boolean {
  if (!value) return false;
  if (typeof value === "string") return forbiddenKeyPattern.test(value);
  if (Array.isArray(value)) return value.some(containsForbiddenCredentials);
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, child]) => forbiddenKeyPattern.test(key) || containsForbiddenCredentials(child)
    );
  }
  return false;
}

export class ObservedWebApiAdapter {
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    if (!boolEnv(process.env.ENABLE_OBSERVED_WEB_API)) {
      return {
        status: "manual_required",
        response: { provider: "observed_web_api", blocked: true },
        error: "Observed web API usage is disabled by ENABLE_OBSERVED_WEB_API=false."
      };
    }

    if (!request.capabilityId) {
      throw new Error("Observed web API requires a selected capability.");
    }

    const capability = await prisma.capability.findUnique({ where: { id: request.capabilityId } });
    if (!capability || capability.provider !== "observed_web_api" || !capability.enabled || !capability.productionAllowed) {
      return {
        status: "manual_required",
        response: { capabilityId: request.capabilityId, blocked: true },
        error: "Observed capability is disabled or not production allowed."
      };
    }

    if (containsForbiddenCredentials(capability.requestSchema) || containsForbiddenCredentials(request)) {
      return {
        status: "failed",
        response: { capabilityId: request.capabilityId, blocked: true },
        error: "Blocked: observed API request appears to contain private credentials."
      };
    }

    return {
      status: "manual_required",
      response: {
        provider: "observed_web_api",
        capability,
        note: "MVP records the reviewed request but does not replay private browser APIs automatically."
      },
      error: "Manual implementation required for this observed endpoint."
    };
  }
}
