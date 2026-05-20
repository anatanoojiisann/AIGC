import { Provider } from "@/lib/adapters/types";
import { GenerationJobManager } from "@/lib/services/generation-job-manager";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const job = await new GenerationJobManager().retry(jobId, body.provider as Provider | undefined);
    return Response.json({ job }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Retry failed." }, { status: 400 });
  }
}
