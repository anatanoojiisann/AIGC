import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";

type ServeOptions = {
  path: string;
  mime?: string;
  filename: string;
  attachment?: boolean;
};

function contentDisposition(filename: string, attachment?: boolean) {
  const cleanName = filename.replace(/["\r\n]/g, "_");
  return `${attachment ? "attachment" : "inline"}; filename="${cleanName}"`;
}

export async function serveVideoFile(request: Request, options: ServeOptions) {
  const info = await stat(options.path);
  if (!info.isFile() || info.size <= 0) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INPUT_NOT_FOUND",
          message: "Video file is missing."
        }
      },
      { status: 404 }
    );
  }

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Type": options.mime || "video/mp4",
    "Content-Disposition": contentDisposition(options.filename, options.attachment)
  });

  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : info.size - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < info.size) {
        const boundedEnd = Math.min(end, info.size - 1);
        headers.set("Content-Length", String(boundedEnd - start + 1));
        headers.set("Content-Range", `bytes ${start}-${boundedEnd}/${info.size}`);
        return new Response(Readable.toWeb(createReadStream(options.path, { start, end: boundedEnd })) as BodyInit, {
          status: 206,
          headers
        });
      }
    }
  }

  headers.set("Content-Length", String(info.size));
  return new Response(Readable.toWeb(createReadStream(options.path)) as BodyInit, { headers });
}
