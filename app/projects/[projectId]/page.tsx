import Dashboard from "@/app/dashboard";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <Dashboard initialView="editor" initialProjectId={projectId} />;
}
