export type WatermarkMode = "crop" | "cover" | "delogo" | "preview";

export type WatermarkRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type WatermarkVideoMetadata = {
  width: number;
  height: number;
};

export type WatermarkProcessOptions = WatermarkRegion & {
  input: string;
  output: string;
  mode: WatermarkMode;
};

export type WatermarkProcessResult = {
  inputPath: string;
  outputPath: string;
  mode: WatermarkMode;
  region: WatermarkRegion;
  video: WatermarkVideoMetadata;
  command: "ffmpeg";
  args: string[];
};

export const WATERMARK_MODES: readonly WatermarkMode[];

export class WatermarkProcessingError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown);
}

export function assertFfmpegAvailable(): Promise<void>;
export function probeVideo(inputPath: string): Promise<WatermarkVideoMetadata>;
export function buildWatermarkCommand(options: {
  inputPath: string;
  outputPath: string;
  mode: WatermarkMode;
  region: WatermarkRegion;
  video: WatermarkVideoMetadata;
}): string[];
export function processWatermarkVideo(options: WatermarkProcessOptions): Promise<WatermarkProcessResult>;
