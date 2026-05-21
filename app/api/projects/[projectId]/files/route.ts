import { prisma } from "@/lib/db";
import { saveUpload } from "@/lib/storage/files";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const form = await request.formData();
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  const sceneId = String(form.get("sceneId") || "") || null;
  const role = String(form.get("role") || "reference");

  if (files.length === 0) {
    return Response.json({ error: "Upload at least one file." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const assets = [];
  for (const file of files) {
    const saved = await saveUpload(projectId, file);
    assets.push(
      await prisma.asset.create({
        data: {
          projectId,
          sceneId,
          role,
          type: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file",
          filename: saved.filename,
          originalName: saved.originalName,
          mime: saved.mime,
          size: saved.size,
          path: saved.path
        }
      })
    );
  }

  return Response.json({ assets }, { status: 201 });
}
