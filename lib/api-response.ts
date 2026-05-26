export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "DATABASE_ERROR"
  | "BAD_REQUEST"
  | "INPUT_NOT_FOUND"
  | "UPLOAD_FAILED"
  | "INVALID_COORDINATES"
  | "UNSUPPORTED_VIDEO_FORMAT"
  | "FFMPEG_NOT_FOUND"
  | "PROCESSING_FAILED"
  | "PROPAINTER_ENV_INVALID"
  | "INVALID_API_KEY"
  | "INVALID_BROWSER"
  | "PLAYWRIGHT_CHROMIUM_NOT_INSTALLED"
  | "PLAYWRIGHT_WEBKIT_NOT_INSTALLED"
  | "PROPAINTER_NOT_INSTALLED"
  | "PROPAINTER_OUTPUT_INVALID"
  | "PROPAINTER_TIMEOUT"
  | "PROPAINTER_INFERENCE_FAILED"
  | "PROPAINTER_MASK_FAILED"
  | "PROPAINTER_DYLIB_CONFLICT"
  | "INTERNAL_ERROR";

type ApiErrorPayload = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export function okJson<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data }, init);
}

export function errorJson(code: ApiErrorCode, message: string, status = 400, details?: unknown) {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details })
      }
    } satisfies ApiErrorPayload,
    { status }
  );
}

export function apiErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unexpected server error.";
}

export function isDatabaseError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /prisma|database|sqlite|table .* does not exist|no such table|P20\d{2}/i.test(error.message);
}
