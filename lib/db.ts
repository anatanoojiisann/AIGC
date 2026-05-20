import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function ensureDefaultCapabilities() {
  const count = await prisma.capability.count();
  if (count > 0) return;

  await prisma.capability.createMany({
    data: [
      {
        provider: "official_pixverse",
        source: "official",
        method: "POST",
        path: "/v2/image/upload",
        purpose: "Upload a reference image through the official PixVerse API.",
        requestSchema: JSON.stringify({ file: "multipart image file" }),
        responseSchema: JSON.stringify({ image_id: "string", url: "string" }),
        riskLevel: "low",
        productionAllowed: true,
        enabled: true,
        notes: "Default mock production provider for this MVP. Real API calls are not implemented yet."
      },
      {
        provider: "official_pixverse",
        source: "official",
        method: "POST",
        path: "/v2/video/img/generate",
        purpose: "Create an image-to-video generation task through the official PixVerse API.",
        requestSchema: JSON.stringify({ prompt: "string", image_id: "string", aspect_ratio: "string", duration: "number" }),
        responseSchema: JSON.stringify({ task_id: "string", status: "string" }),
        riskLevel: "low",
        productionAllowed: true,
        enabled: true,
        notes: "Review is required before submission."
      },
      {
        provider: "official_pixverse",
        source: "official",
        method: "POST",
        path: "/v2/video/text/generate",
        purpose: "Create a text-to-video generation task through the official PixVerse API.",
        requestSchema: JSON.stringify({ prompt: "string", aspect_ratio: "string", duration: "number" }),
        responseSchema: JSON.stringify({ task_id: "string", status: "string" }),
        riskLevel: "low",
        productionAllowed: true,
        enabled: true,
        notes: "Review is required before submission."
      },
      {
        provider: "playwright_automation",
        source: "ui_automation",
        method: "UI",
        path: "https://app.pixverse.ai",
        purpose: "Fallback automation of normal browser UI steps after manual login.",
        requestSchema: JSON.stringify({ prompt: "string", files: "uploaded by browser UI" }),
        responseSchema: JSON.stringify({ downloaded_file: "local path or URL" }),
        riskLevel: "medium",
        productionAllowed: false,
        enabled: false,
        notes: "Never bypass captcha, anti-bot checks, credits, payment, login protection, or rate limits."
      }
    ]
  });
}
