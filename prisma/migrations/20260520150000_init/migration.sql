-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'pixverse',
    "language" TEXT NOT NULL DEFAULT 'English',
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "style" TEXT NOT NULL DEFAULT 'cinematic',
    "duration" INTEGER NOT NULL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Scene',
    "description" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'pixverse',
    "language" TEXT NOT NULL DEFAULT 'English',
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "style" TEXT NOT NULL DEFAULT 'cinematic',
    "duration" INTEGER NOT NULL DEFAULT 5,
    "promptReviewed" BOOLEAN NOT NULL DEFAULT false,
    "currentPromptVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Scene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sceneId" TEXT,
    "type" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'reference',
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Asset_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "imagePrompt" TEXT NOT NULL,
    "negativePrompt" TEXT NOT NULL,
    "videoReferenceImagePrompt" TEXT NOT NULL,
    "pixverseVideoPrompt" TEXT NOT NULL,
    "motionCameraActionPrompt" TEXT NOT NULL,
    "sourceMetadata" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromptVersion_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Capability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "requestSchema" TEXT,
    "responseSchema" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "productionAllowed" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "capabilityId" TEXT,
    "request" TEXT NOT NULL,
    "response" TEXT,
    "externalTaskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "resultUrl" TEXT,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GenerationJob_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
