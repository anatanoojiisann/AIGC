export type Provider = "official_pixverse" | "observed_web_api" | "playwright_automation" | "manual_required";

export type GenerationRequest = {
  jobId: string;
  projectId: string;
  sceneId: string;
  capabilityId?: string | null;
  promptVersionId: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  duration: number;
  referenceAssetIds: string[];
};

export type GenerationResult = {
  status: "queued" | "running" | "completed" | "failed" | "manual_required";
  externalTaskId?: string;
  resultUrl?: string;
  response: Record<string, unknown>;
  error?: string;
};
