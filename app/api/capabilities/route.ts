import { ensureDefaultCapabilities, prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  await ensureDefaultCapabilities();
  const capabilities = await prisma.capability.findMany({ orderBy: [{ provider: "asc" }, { createdAt: "desc" }] });
  return Response.json({ capabilities });
}
