import { prisma } from "@/lib/db";
import { readStoredFile } from "@/lib/storage/files";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return Response.json({ error: "Asset not found." }, { status: 404 });
  const file = await readStoredFile(asset.path);
  return new Response(file, {
    headers: {
      "Content-Type": asset.mime,
      "Content-Disposition": `inline; filename="${asset.originalName}"`
    }
  });
}
