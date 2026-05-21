import { access, mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";

export function storageRoot() {
  return path.resolve(process.cwd(), process.env.STORAGE_ROOT || "./storage");
}

function assertSafeSegment(value: string, label: string) {
  if (!value || value.includes("/") || value.includes("\\") || value === "." || value === "..") {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

export function assertUnderStorage(absPath: string) {
  const root = storageRoot();
  const resolved = path.resolve(absPath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside the configured storage root.");
  }
  return resolved;
}

function projectStoragePath(projectId: string) {
  return assertUnderStorage(path.join(storageRoot(), "projects", assertSafeSegment(projectId, "project id")));
}

function assetsStoragePath(projectId: string) {
  return path.join(projectStoragePath(projectId), "assets");
}

async function ensureProjectStorage(projectId: string) {
  await mkdir(assetsStoragePath(projectId), { recursive: true });
}

function safeFileName(name: string) {
  const clean = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return clean.slice(0, 120) || "upload.bin";
}

export async function saveUpload(projectId: string, file: File) {
  await ensureProjectStorage(projectId);
  const originalName = safeFileName(file.name);
  const filename = `${Date.now()}_${crypto.randomUUID()}_${originalName}`;
  const absPath = assertUnderStorage(path.join(assetsStoragePath(projectId), filename));
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absPath, buffer);
  return {
    filename,
    originalName,
    mime: file.type || "application/octet-stream",
    size: buffer.length,
    path: absPath
  };
}

export async function createProjectStorageFilePath(projectId: string, folder: string, filename: string) {
  const safeFolder = assertSafeSegment(folder, "folder");
  const safeName = safeFileName(filename);
  const directory = assertUnderStorage(path.join(projectStoragePath(projectId), safeFolder));
  await mkdir(directory, { recursive: true });
  return assertUnderStorage(path.join(directory, safeName));
}

export async function createVideoCleanupOutputPath(projectId: string, jobId: string, filename = "output.mp4") {
  const directory = assertUnderStorage(
    path.join(
      projectStoragePath(projectId),
      "video-cleanup",
      assertSafeSegment(jobId, "video cleanup job id")
    )
  );
  await mkdir(directory, { recursive: true });
  return assertUnderStorage(path.join(directory, safeFileName(filename)));
}

export async function storedFileInfo(absPath: string) {
  const resolved = assertUnderStorage(absPath);
  const info = await stat(resolved);
  if (!info.isFile()) {
    throw new Error("Stored path is not a file.");
  }
  return {
    path: resolved,
    size: info.size
  };
}

export function storageRelativePath(absPath: string) {
  return path.relative(process.cwd(), assertUnderStorage(absPath));
}

export async function readStoredFile(absPath: string) {
  const resolved = assertUnderStorage(absPath);
  try {
    await access(resolved);
  } catch {
    throw new Error("Stored file does not exist or is not readable.");
  }
  const info = await stat(resolved);
  if (!info.isFile()) {
    throw new Error("Stored asset is not a file.");
  }
  return readFile(resolved);
}
