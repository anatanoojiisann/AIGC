import JSZip from "jszip";
import { prisma } from "@/lib/db";
import { readStoredFile } from "@/lib/storage/files";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assets: true,
      scenes: { include: { assets: true, promptVersions: true, jobs: true } },
      jobs: true
    }
  });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const zip = new JSZip();
  zip.file("project.json", JSON.stringify(project, null, 2));
  const assetsFolder = zip.folder("assets");
  for (const asset of project.assets) {
    try {
      const bytes = await readStoredFile(asset.path);
      assetsFolder?.file(asset.filename, bytes);
    } catch {
      assetsFolder?.file(`${asset.filename}.missing.txt`, `Missing local file: ${asset.path}`);
    }
  }

  const content = await zip.generateAsync({ type: "uint8array" });
  return new Response(content, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${project.name.replace(/[^a-z0-9_-]/gi, "_")}_export.zip"`
    }
  });
}
