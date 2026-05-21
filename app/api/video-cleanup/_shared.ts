import { apiErrorMessage, errorJson, isDatabaseError } from "@/lib/api-response";
import type { ApiErrorCode } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import {
  assertUnderStorage,
  createVideoCleanupOutputPath,
  storedFileInfo,
  storageRelativePath
} from "@/lib/storage/files";
import {
  runVideoCleanupJob,
  VideoCleanupError,
  type VideoCleanupMode,
  type VideoCleanupRegion
} from "@/lib/video/ffmpeg";

type CleanupBody = {
  projectId?: string;
  assetId?: string;
  mode?: string;
  region?: Partial<VideoCleanupRegion>;
  confirmedRights?: boolean;
  coverColor?: string;
};

export function cleanupErrorResponse(error: unknown) {
  if (error instanceof VideoCleanupError) {
    const status =
      error.code === "INPUT_NOT_FOUND"
        ? 404
        : error.code === "FFMPEG_NOT_FOUND"
          ? 503
          : error.code === "PROCESSING_FAILED"
            ? 500
            : 400;
    return errorJson(error.code as ApiErrorCode, error.message, status);
  }

  const code = isDatabaseError(error) ? "DATABASE_ERROR" : "INTERNAL_ERROR";
  const message = isDatabaseError(error)
    ? `${apiErrorMessage(error)} Run npx prisma generate and npx prisma migrate dev.`
    : apiErrorMessage(error);
  return errorJson(code, message, isDatabaseError(error) ? 503 : 500);
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new VideoCleanupError("VALIDATION_ERROR", `${label} is required.`);
  }
  return value.trim();
}

function requireRegion(region: CleanupBody["region"]) {
  if (!region || typeof region !== "object") {
    throw new VideoCleanupError("INVALID_COORDINATES", "region is required.");
  }
  return {
    x: Number(region.x),
    y: Number(region.y),
    w: Number(region.w),
    h: Number(region.h)
  };
}

export async function runAssetCleanup(body: CleanupBody, defaultMode?: VideoCleanupMode) {
  if (body.confirmedRights !== true) {
    throw new VideoCleanupError(
      "VALIDATION_ERROR",
      "Confirm that you own this video or have permission to edit it before processing."
    );
  }

  const projectId = requireString(body.projectId, "projectId");
  const assetId = requireString(body.assetId, "assetId");
  const mode = (defaultMode || requireString(body.mode, "mode")) as VideoCleanupMode;
  const region = requireRegion(body.region);

  const sourceAsset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      projectId
    }
  });
  if (!sourceAsset) {
    throw new VideoCleanupError("INPUT_NOT_FOUND", "Video asset not found.");
  }
  if (sourceAsset.type !== "video" && !sourceAsset.mime.startsWith("video/")) {
    throw new VideoCleanupError("VALIDATION_ERROR", "Selected asset is not a local video asset.");
  }

  const inputPath = assertUnderStorage(sourceAsset.path);
  const initialJob = await prisma.videoCleanupJob.create({
    data: {
      projectId,
      sourceAssetId: sourceAsset.id,
      mode,
      region: JSON.stringify(region),
      status: "queued"
    }
  });

  const outputPath = await createVideoCleanupOutputPath(projectId, initialJob.id, `${mode}-output.mp4`);

  try {
    await prisma.videoCleanupJob.update({
      where: { id: initialJob.id },
      data: { status: "running", outputPath }
    });

    const result = await runVideoCleanupJob({
      input: inputPath,
      output: outputPath,
      mode,
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
      coverColor: body.coverColor
    });
    const info = await storedFileInfo(outputPath);
    const outputAsset = await prisma.asset.create({
      data: {
        projectId,
        role: mode === "preview" ? "video_cleanup_preview" : "video_cleanup_output",
        type: "video",
        filename: `${initialJob.id}-${mode}-output.mp4`,
        originalName: `${mode}-output.mp4`,
        mime: "video/mp4",
        size: info.size,
        path: info.path
      }
    });
    const job = await prisma.videoCleanupJob.update({
      where: { id: initialJob.id },
      data: {
        status: "success",
        outputAssetId: outputAsset.id,
        outputPath
      },
      include: {
        sourceAsset: true,
        outputAsset: true
      }
    });

    return {
      job,
      outputAsset,
      result: {
        ...result,
        relativeOutputPath: storageRelativePath(outputPath)
      }
    };
  } catch (error) {
    await prisma.videoCleanupJob.update({
      where: { id: initialJob.id },
      data: {
        status: "failed",
        errorMessage: apiErrorMessage(error),
        outputPath
      }
    });
    throw error;
  }
}
