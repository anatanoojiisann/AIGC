import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const existing = await prisma.capability.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Capability not found." }, { status: 404 });

  const capability = await prisma.capability.update({
    where: { id },
    data: {
      enabled: body.enabled,
      productionAllowed: body.productionAllowed,
      notes: body.notes
    }
  });
  return Response.json({ capability });
}
