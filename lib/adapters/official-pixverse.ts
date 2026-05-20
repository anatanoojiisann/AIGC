import { GenerationRequest, GenerationResult } from "@/lib/adapters/types";

export class OfficialPixVerseAdapter {
  async getBalance() {
    return { mode: "mock", balance: null, note: "Real PixVerse API calls are not implemented in this MVP." };
  }

  async uploadImage() {
    return { mode: "mock", image_id: `mock_image_${crypto.randomUUID()}` };
  }

  async imageToVideo(request: GenerationRequest): Promise<GenerationResult> {
    return {
      status: "completed",
      externalTaskId: `mock_official_${request.jobId}`,
      resultUrl: `mock://official-pixverse/${request.jobId}`,
      response: {
        mode: "mock",
        provider: "official_pixverse",
        note: "Real PixVerse API calls are intentionally not implemented in this first version.",
        request
      }
    };
  }

  async textToVideo(request: GenerationRequest) {
    return this.imageToVideo(request);
  }

  async getResult(taskId: string) {
    return { mode: "mock", task_id: taskId, status: "completed" };
  }
}
