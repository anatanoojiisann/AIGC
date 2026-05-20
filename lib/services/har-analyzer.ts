const blockedHeaderNames = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-csrf-token",
  "x-xsrf-token",
  "x-api-key",
  "api-key",
  "proxy-authorization"
]);

const sensitiveKeyPattern =
  /(token|secret|cookie|session|csrf|xsrf|authorization|auth|password|passwd|api[-_]?key|credential|payment|card|cvv|email|phone)/i;

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phonePattern = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const cardPattern = /\b(?:\d[ -]*?){13,19}\b/g;
const bearerPattern = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

type HarHeader = { name: string; value: string };
type HarEntry = {
  request?: {
    method?: string;
    url?: string;
    headers?: HarHeader[];
    postData?: { mimeType?: string; text?: string };
    queryString?: { name: string; value: string }[];
  };
  response?: {
    status?: number;
    headers?: HarHeader[];
    content?: { mimeType?: string; text?: string };
  };
  _resourceType?: string;
};

function sanitizeValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value
    .replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(phonePattern, "[REDACTED_PHONE]")
    .replace(cardPattern, "[REDACTED_PAYMENT]")
    .replace(bearerPattern, "[REDACTED_AUTH]")
    .replace(jwtPattern, "[REDACTED_TOKEN]");
}

function sanitizeUnknown(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(sanitizeUnknown);
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, value]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[REDACTED]" : sanitizeUnknown(value)
      ])
    );
  }
  return sanitizeValue(input);
}

function parseMaybeJson(text?: string) {
  if (!text) return undefined;
  try {
    return sanitizeUnknown(JSON.parse(text));
  } catch {
    return sanitizeValue(text.slice(0, 5000));
  }
}

function sanitizeHeaders(headers: HarHeader[] = []) {
  return headers
    .filter((header) => !blockedHeaderNames.has(header.name.toLowerCase()))
    .map((header) => ({
      name: header.name,
      value: sensitiveKeyPattern.test(header.name) ? "[REDACTED]" : String(sanitizeValue(header.value))
    }));
}

function inferPurpose(method: string, pathName: string) {
  const lower = pathName.toLowerCase();
  if (lower.includes("upload")) return "Observed file upload endpoint";
  if (lower.includes("generate") || lower.includes("task")) return "Observed generation task endpoint";
  if (lower.includes("result") || lower.includes("status")) return "Observed result/status endpoint";
  if (lower.includes("balance") || lower.includes("credit")) return "Observed account/balance endpoint";
  return `${method} observed XHR/fetch endpoint`;
}

export class HARAnalyzer {
  analyze(har: unknown) {
    const entries = ((har as { log?: { entries?: HarEntry[] } })?.log?.entries ?? []).filter(Boolean);

    const requests = entries
      .filter((entry) => {
        const resourceType = entry._resourceType?.toLowerCase();
        const mime = entry.response?.content?.mimeType?.toLowerCase() || "";
        return resourceType === "xhr" || resourceType === "fetch" || mime.includes("json");
      })
      .map((entry) => {
        const method = entry.request?.method || "GET";
        const rawUrl = entry.request?.url || "";
        const url = new URL(rawUrl, "https://unknown.local");
        const query = Object.fromEntries(
          (entry.request?.queryString ?? []).map((item) => [
            item.name,
            sensitiveKeyPattern.test(item.name) ? "[REDACTED]" : sanitizeValue(item.value)
          ])
        );

        return {
          method,
          origin: url.origin === "https://unknown.local" ? "unknown" : url.origin,
          path: url.pathname,
          purpose: inferPurpose(method, url.pathname),
          request: {
            headers: sanitizeHeaders(entry.request?.headers),
            query,
            body: parseMaybeJson(entry.request?.postData?.text),
            mimeType: entry.request?.postData?.mimeType
          },
          response: {
            status: entry.response?.status,
            headers: sanitizeHeaders(entry.response?.headers),
            body: parseMaybeJson(entry.response?.content?.text),
            mimeType: entry.response?.content?.mimeType
          },
          riskLevel: "high",
          enabled: false,
          productionAllowed: false,
          notes: "Sanitized observed endpoint. Disabled by default and must not be used with cookies, session tokens, captcha bypass, credit bypass, payment bypass, or rate-limit bypass."
        };
      });

    return {
      generatedAt: new Date().toISOString(),
      requestCount: requests.length,
      redactionPolicy: [
        "Cookie and Authorization headers removed",
        "Tokens, API keys, sessions, CSRF values, emails, phones, and payment data redacted",
        "Observed APIs are disabled by default"
      ],
      requests
    };
  }
}
