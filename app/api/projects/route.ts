import { ensureDefaultCapabilities, prisma } from "@/lib/db";
import { apiErrorMessage, errorJson, isDatabaseError, okJson } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureDefaultCapabilities();
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: { scenes: true, assets: true, jobs: true }
    });
    return okJson({ projects });
  } catch (error) {
    const code = isDatabaseError(error) ? "DATABASE_ERROR" : "INTERNAL_ERROR";
    const message = isDatabaseError(error)
      ? `${apiErrorMessage(error)} Run npx prisma generate and npx prisma migrate dev, then restart npm run dev.`
      : apiErrorMessage(error);
    return errorJson(code, message, 503);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return errorJson("VALIDATION_ERROR", "Project name is required.", 400);
    }

    await ensureDefaultCapabilities();

    const projectWithRelations = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name,
          description: typeof body.description === "string" ? body.description : "",
          platform: typeof body.platform === "string" ? body.platform : "pixverse",
          language: typeof body.language === "string" ? body.language : "English",
          aspectRatio: typeof body.aspectRatio === "string" ? body.aspectRatio : "16:9",
          style: typeof body.style === "string" ? body.style : "cinematic",
          duration: Number.isFinite(Number(body.duration)) ? Number(body.duration) : 5
        }
      });

      await tx.scene.create({
        data: {
          projectId: project.id,
          title: "Scene 1",
          description: "",
          platform: project.platform,
          language: project.language,
          aspectRatio: project.aspectRatio,
          style: project.style,
          duration: project.duration
        }
      });

      return tx.project.findUniqueOrThrow({
        where: { id: project.id },
        include: { scenes: true, assets: true, jobs: true }
      });
    });

    return okJson({ project: projectWithRelations }, { status: 201 });
  } catch (error) {
    const code = isDatabaseError(error) ? "DATABASE_ERROR" : "INTERNAL_ERROR";
    const message = isDatabaseError(error)
      ? `${apiErrorMessage(error)} Run npx prisma generate and npx prisma migrate dev, then restart npm run dev.`
      : apiErrorMessage(error);
    return errorJson(code, message, 503);
  }
}
