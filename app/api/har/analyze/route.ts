import { prisma } from "@/lib/db";
import { HARAnalyzer } from "@/lib/services/har-analyzer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Upload a HAR file." }, { status: 400 });
  }

  const text = await file.text();
  const har = JSON.parse(text);
  const report = new HARAnalyzer().analyze(har);

  for (const observed of report.requests) {
    await prisma.capability.create({
      data: {
        provider: "observed_web_api",
        source: "observed_har",
        method: observed.method,
        path: observed.path,
        purpose: observed.purpose,
        requestSchema: JSON.stringify(observed.request),
        responseSchema: JSON.stringify(observed.response),
        riskLevel: observed.riskLevel,
        productionAllowed: false,
        enabled: false,
        notes: observed.notes
      }
    });
  }

  return Response.json({ report });
}
