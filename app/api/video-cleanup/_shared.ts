import { apiErrorMessage, errorJson, isDatabaseError } from "@/lib/api-response";
import type { ApiErrorCode } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import {
  assertUnderStorage,
  createVideoCleanupOutputPath,
  storedFileInfo,
  storageRelativePath,
} from "@/lib/storage/files";
import {
  runVideoCleanupJob,
  VideoCleanupError,
  VIDEO_CLEANUP_MODES,
  type VideoCleanupMode,
  type ProPainterQuality,
  type ProPainterProcessingMode,
  type VideoCleanupRegion
} from "@/lib/video/ffmpeg";
import {
  cleanupDownloadUrl,
  cleanupOutputUrl,
  runUploadedVideoCleanup
} from "@/lib/video-cleanup/local-store";

type CleanupBody = {
  projectId?: string;
  assetId?: string;
  uploadedVideoId?: string;
  mode?: string;
  region?: Partial<VideoCleanupRegion>;
  confirmedRights?: boolean;
  coverColor?: string;
  quality?: string;
  processingMode?: string;
  allowFullFrame?: boolean;
};

export function cleanupErrorResponse(error: unknown) {
  if (error instanceof VideoCleanupError) {
    const statusByCode: Record<string, number> = {
      FFMPEG_NOT_FOUND: 503,
      INPUT_NOT_FOUND: 404,
      PROCESSING_FAILED: 500,
      PROPAINTER_DYLIB_CONFLICT: 503,
      PROPAINTER_ENV_INVALID: 503,
      PROPAINTER_INFERENCE_FAILED: 500,
      PROPAINTER_MASK_FAILED: 500,
      PROPAINTER_NOT_INSTALLED: 200,
      PROPAINTER_OUTPUT_INVALID: 500,
      PROPAINTER_TIMEOUT: 504
    };
    const status = statusByCode[error.code] || 400;
    return errorJson(error.code as ApiErrorCode, error.message, status, error.details);
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

function requireMode(mode: unknown, defaultMode?: VideoCleanupMode) {
  const value = (defaultMode || requireString(mode, "mode")).toLowerCase() as VideoCleanupMode;
  if (!VIDEO_CLEANUP_MODES.includes(value)) {
    throw new VideoCleanupError("VALIDATION_ERROR", `Unsupported mode "${value || "missing"}".`);
  }
  return value;
}

export async function runUploadedCleanup(body: CleanupBody, defaultMode?: VideoCleanupMode) {
  const uploadedVideoId = requireString(body.uploadedVideoId, "uploadedVideoId");
  const mode = requireMode(body.mode, defaultMode);
  const region = requireRegion(body.region);
  const data = await runUploadedVideoCleanup({
    uploadedVideoId,
    mode,
    region,
    coverColor: body.coverColor,
    quality: body.quality as ProPainterQuality | undefined,
    processingMode: body.processingMode as ProPainterProcessingMode | undefined,
    allowFullFrame: body.allowFullFrame === true
  });

  return {
    jobId: data.jobId,
    outputId: data.output.id,
    mode: data.output.mode,
    outputUrl: cleanupOutputUrl(data.output.id),
    downloadUrl: cleanupDownloadUrl(data.output.id),
    relativePath: storageRelativePath(data.output.path),
    fileSize: data.output.size,
    region: data.output.region,
    videoMetadata: data.output.metadata,
    ffmpegFilter: data.output.ffmpegFilter,
    inputPath: storageRelativePath(data.result.input),
    outputPath: storageRelativePath(data.result.output),
    inputSha256: data.output.inputSha256,
    outputSha256: data.output.outputSha256,
    hashesDifferent: data.output.hashesDifferent,
    engine: data.output.engine,
    quality: data.output.quality,
    processingMode: data.output.processingMode,
    roi: data.output.roi,
    propainterParams: data.output.propainterParams,
    maskPath: data.output.maskPath
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
  const mode = requireMode(body.mode, defaultMode);
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
      coverColor: body.coverColor,
      quality: body.quality as ProPainterQuality | undefined,
      processingMode: body.processingMode as ProPainterProcessingMode | undefined,
      allowFullFrame: body.allowFullFrame === true
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
