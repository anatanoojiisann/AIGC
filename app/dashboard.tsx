"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  FolderPlus,
  ImagePlus,
  Play,
  RefreshCcw,
  RotateCcw,
  Save,
  Settings,
  Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Asset = {
  id: string;
  role: string;
  type: string;
  originalName: string;
  mime: string;
  size: number;
  createdAt: string;
};

type PromptVersion = {
  id: string;
  version: number;
  imagePrompt: string;
  negativePrompt: string;
  videoReferenceImagePrompt: string;
  pixverseVideoPrompt: string;
  motionCameraActionPrompt: string;
  reviewedAt: string | null;
  createdAt: string;
};

type Job = {
  id: string;
  provider: string;
  status: string;
  resultUrl: string | null;
  error: string | null;
  request: string;
  response: string | null;
  retryCount: number;
  createdAt: string;
  project?: { name: string };
  scene?: { title: string };
};

type Scene = {
  id: string;
  title: string;
  description: string;
  platform: string;
  language: string;
  aspectRatio: string;
  style: string;
  duration: number;
  promptReviewed: boolean;
  assets: Asset[];
  promptVersions: PromptVersion[];
  jobs: Job[];
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  platform: string;
  language: string;
  aspectRatio: string;
  style: string;
  duration: number;
  scenes: Scene[];
  assets: Asset[];
  jobs: Job[];
  updatedAt: string;
};

type Capability = {
  id: string;
  provider: string;
  source: string;
  method: string;
  path: string;
  purpose: string;
  riskLevel: string;
  productionAllowed: boolean;
  enabled: boolean;
  notes: string | null;
};

type SettingsPayload = {
  officialPixVerseConfigured: boolean;
  observedWebApiEnabled: boolean;
  playwrightAutomationEnabled: boolean;
  storageRoot: string;
  redisConfigured: boolean;
};

type View = "projects" | "editor" | "settings" | "har" | "capabilities" | "jobs";

const emptyPrompt = {
  imagePrompt: "",
  negativePrompt: "",
  videoReferenceImagePrompt: "",
  pixverseVideoPrompt: "",
  motionCameraActionPrompt: ""
};

export default function Dashboard({
  initialView = "projects",
  initialProjectId
}: {
  initialView?: View;
  initialProjectId?: string;
}) {
  const [view, setView] = useState<View>(initialView);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string>("");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [newProjectName, setNewProjectName] = useState("PixVerse Project");
  const [provider, setProvider] = useState("official_pixverse");
  const [capabilityId, setCapabilityId] = useState("");
  const [notice, setNotice] = useState("");
  const [harReport, setHarReport] = useState<unknown>(null);
  const [promptFields, setPromptFields] = useState(emptyPrompt);

  const selectedScene = useMemo(
    () => project?.scenes.find((scene) => scene.id === selectedSceneId) || project?.scenes[0],
    [project, selectedSceneId]
  );

  const observedCapabilities = capabilities.filter((capability) => capability.provider === "observed_web_api");

  async function loadProjects(projectIdToLoad?: string) {
    const response = await fetch("/api/projects");
    const data = (await response.json()) as { projects: Project[] };
    setProjects(data.projects);
    const id = projectIdToLoad || initialProjectId || project?.id || data.projects[0]?.id;
    if (id) await loadProject(id);
  }

  async function loadProject(id: string) {
    const response = await fetch(`/api/projects/${id}`);
    const data = (await response.json()) as { project: Project };
    setProject(data.project);
    setSelectedSceneId((current) => current || data.project.scenes[0]?.id || "");
  }

  async function loadMeta() {
    const [capabilityResponse, jobsResponse, settingsResponse] = await Promise.all([
      fetch("/api/capabilities"),
      fetch("/api/jobs"),
      fetch("/api/settings")
    ]);
    setCapabilities(((await capabilityResponse.json()) as { capabilities: Capability[] }).capabilities);
    setJobs(((await jobsResponse.json()) as { jobs: Job[] }).jobs);
    setSettings(((await settingsResponse.json()) as { settings: SettingsPayload }).settings);
  }

  useEffect(() => {
    void loadProjects(initialProjectId);
    void loadMeta();
  }, [initialProjectId]);

  useEffect(() => {
    const latest = selectedScene?.promptVersions[0];
    setPromptFields(
      latest
        ? {
            imagePrompt: latest.imagePrompt,
            negativePrompt: latest.negativePrompt,
            videoReferenceImagePrompt: latest.videoReferenceImagePrompt,
            pixverseVideoPrompt: latest.pixverseVideoPrompt,
            motionCameraActionPrompt: latest.motionCameraActionPrompt
          }
        : emptyPrompt
    );
  }, [selectedScene?.id, selectedScene?.promptVersions]);

  async function createProject() {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newProjectName })
    });
    const data = (await response.json()) as { project: Project };
    setNotice("Project created.");
    setView("editor");
    await loadProjects(data.project.id);
  }

  async function createScene() {
    if (!project) return;
    const response = await fetch("/api/scenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        title: `Scene ${project.scenes.length + 1}`,
        description: "A cinematic product moment with clear subject action."
      })
    });
    const data = (await response.json()) as { scene: Scene };
    setSelectedSceneId(data.scene.id);
    setNotice("Scene created.");
    await loadProject(project.id);
  }

  async function updateScene(field: keyof Scene, value: string | number) {
    if (!selectedScene || !project) return;
    await fetch(`/api/scenes/${selectedScene.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value })
    });
    await loadProject(project.id);
  }

  async function uploadFiles(files: FileList | null, role = "reference") {
    if (!files || !project || !selectedScene) return;
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("files", file));
    form.append("sceneId", selectedScene.id);
    form.append("role", role);
    await fetch(`/api/projects/${project.id}/files`, { method: "POST", body: form });
    setNotice(role === "replacement" ? "Replacement file uploaded." : "Reference file uploaded.");
    await loadProject(project.id);
  }

  async function generatePrompts() {
    if (!selectedScene || !project) return;
    const response = await fetch(`/api/scenes/${selectedScene.id}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selectedScene)
    });
    const data = (await response.json()) as { prompt: PromptVersion };
    setPromptFields({
      imagePrompt: data.prompt.imagePrompt,
      negativePrompt: data.prompt.negativePrompt,
      videoReferenceImagePrompt: data.prompt.videoReferenceImagePrompt,
      pixverseVideoPrompt: data.prompt.pixverseVideoPrompt,
      motionCameraActionPrompt: data.prompt.motionCameraActionPrompt
    });
    setNotice("Draft prompts generated.");
    await loadProject(project.id);
  }

  async function savePrompts() {
    if (!selectedScene || !project) return;
    await fetch(`/api/scenes/${selectedScene.id}/prompts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...promptFields,
        previousPromptVersionId: selectedScene.promptVersions[0]?.id
      })
    });
    setNotice("Prompt version saved and marked reviewed.");
    await loadProject(project.id);
  }

  async function submitJob() {
    if (!selectedScene || !project) return;
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sceneId: selectedScene.id,
        provider,
        capabilityId: provider === "observed_web_api" ? capabilityId : null
      })
    });
    const data = await response.json();
    setNotice(response.ok ? "Generation job submitted." : data.error);
    await Promise.all([loadProject(project.id), loadMeta()]);
  }

  async function retryJob(jobId: string, nextProvider?: string) {
    const response = await fetch(`/api/jobs/${jobId}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: nextProvider })
    });
    const data = await response.json();
    setNotice(response.ok ? "Retry submitted." : data.error);
    if (project) await loadProject(project.id);
    await loadMeta();
  }

  async function analyzeHar(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/har/analyze", { method: "POST", body: form });
    const data = await response.json();
    setHarReport(data.report || data);
    setNotice(response.ok ? "HAR report sanitized and capabilities stored disabled." : data.error);
    await loadMeta();
  }

  async function updateCapability(capability: Capability, patch: Partial<Capability>) {
    await fetch(`/api/capabilities/${capability.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    await loadMeta();
  }

  function exportProject() {
    if (!project) return;
    window.location.href = `/api/projects/${project.id}/export`;
  }

  return (
    <main className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-xl font-semibold">Pai.video / PixVerse Workflow</h1>
            <p className="text-sm text-muted-foreground">Local MVP</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {[
              ["projects", "Projects"],
              ["editor", "Scene Editor"],
              ["settings", "Provider Settings"],
              ["har", "HAR Analyzer"],
              ["capabilities", "Registry"],
              ["jobs", "Jobs"]
            ].map(([id, label]) => (
              <Button
                key={id}
                variant={view === id ? "default" : "outline"}
                size="sm"
                onClick={() => setView(id as View)}
              >
                {label}
              </Button>
            ))}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-4 py-4">
        {notice ? (
          <div className="mb-4 flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {notice}
          </div>
        ) : null}

        {view === "projects" ? (
          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Create Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label>Name</Label>
                <Input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} />
                <Button onClick={createProject} className="w-full">
                  <FolderPlus className="h-4 w-4" />
                  Create
                </Button>
              </CardContent>
            </Card>
            <ProjectList
              projects={projects}
              selectedProjectId={project?.id}
              onOpen={async (id) => {
                await loadProject(id);
                setView("editor");
              }}
            />
          </div>
        ) : null}

        {view === "editor" ? (
          <SceneEditor
            project={project}
            selectedScene={selectedScene}
            selectedSceneId={selectedSceneId}
            setSelectedSceneId={setSelectedSceneId}
            createScene={createScene}
            updateScene={updateScene}
            uploadFiles={uploadFiles}
            generatePrompts={generatePrompts}
            savePrompts={savePrompts}
            promptFields={promptFields}
            setPromptFields={setPromptFields}
            provider={provider}
            setProvider={setProvider}
            capabilities={observedCapabilities}
            capabilityId={capabilityId}
            setCapabilityId={setCapabilityId}
            submitJob={submitJob}
            retryJob={retryJob}
            exportProject={exportProject}
          />
        ) : null}

        {view === "settings" ? <ProviderSettings settings={settings} /> : null}
        {view === "har" ? <HarAnalyzerView analyzeHar={analyzeHar} report={harReport} /> : null}
        {view === "capabilities" ? (
          <CapabilityRegistry capabilities={capabilities} updateCapability={updateCapability} />
        ) : null}
        {view === "jobs" ? <JobMonitor jobs={jobs} retryJob={retryJob} /> : null}
      </section>
    </main>
  );
}

function ProjectList({
  projects,
  selectedProjectId,
  onOpen
}: {
  projects: Project[];
  selectedProjectId?: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <Card key={project.id} className={cn(project.id === selectedProjectId && "ring-2 ring-ring")}>
          <CardHeader>
            <CardTitle>{project.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 text-muted-foreground">
              <span>{project.scenes.length} scenes</span>
              <span>{project.assets.length} files</span>
              <span>{project.jobs.length} jobs</span>
            </div>
            <Button variant="outline" className="w-full" onClick={() => onOpen(project.id)}>
              Open
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SceneEditor(props: {
  project: Project | null;
  selectedScene?: Scene;
  selectedSceneId: string;
  setSelectedSceneId: (id: string) => void;
  createScene: () => void;
  updateScene: (field: keyof Scene, value: string | number) => void;
  uploadFiles: (files: FileList | null, role?: string) => void;
  generatePrompts: () => void;
  savePrompts: () => void;
  promptFields: typeof emptyPrompt;
  setPromptFields: (fields: typeof emptyPrompt) => void;
  provider: string;
  setProvider: (provider: string) => void;
  capabilities: Capability[];
  capabilityId: string;
  setCapabilityId: (id: string) => void;
  submitJob: () => void;
  retryJob: (jobId: string, provider?: string) => void;
  exportProject: () => void;
}) {
  const scene = props.selectedScene;
  if (!props.project) {
    return (
      <Card>
        <CardContent className="p-6">
          <Button onClick={props.createScene}>Create a project first</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(420px,1fr)_360px]">
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Project Detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm font-medium">{props.project.name}</div>
            <Select value={scene?.id || ""} onChange={(event) => props.setSelectedSceneId(event.target.value)}>
              {props.project.scenes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={props.createScene}>
                <FolderPlus className="h-4 w-4" />
                Scene
              </Button>
              <Button variant="outline" className="flex-1" onClick={props.exportProject}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reference Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background text-sm text-foreground">
              <ImagePlus className="h-4 w-4" />
              Upload
              <input
                type="file"
                className="hidden"
                multiple
                accept="image/*"
                onChange={(event) => props.uploadFiles(event.target.files)}
              />
            </Label>
            <Label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background text-sm text-foreground">
              <Upload className="h-4 w-4" />
              Replace File
              <input
                type="file"
                className="hidden"
                multiple
                onChange={(event) => props.uploadFiles(event.target.files, "replacement")}
              />
            </Label>
            <div className="grid gap-3">
              {(scene?.assets || []).map((asset) => (
                <div key={asset.id} className="rounded-md border bg-white p-2">
                  {asset.mime.startsWith("image/") ? (
                    <img
                      src={`/api/assets/${asset.id}`}
                      alt={asset.originalName}
                      className="mb-2 aspect-video w-full rounded object-cover"
                    />
                  ) : null}
                  <div className="truncate text-xs font-medium">{asset.originalName}</div>
                  <div className="text-xs text-muted-foreground">{asset.role}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        {scene ? (
          <Card>
            <CardHeader>
              <CardTitle>Scene Description</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Field label="Title">
                <Input value={scene.title} onChange={(event) => props.updateScene("title", event.target.value)} />
              </Field>
              <Field label="Platform">
                <Input value={scene.platform} onChange={(event) => props.updateScene("platform", event.target.value)} />
              </Field>
              <Field label="Language">
                <Input value={scene.language} onChange={(event) => props.updateScene("language", event.target.value)} />
              </Field>
              <Field label="Aspect Ratio">
                <Select
                  value={scene.aspectRatio}
                  onChange={(event) => props.updateScene("aspectRatio", event.target.value)}
                >
                  <option>16:9</option>
                  <option>9:16</option>
                  <option>1:1</option>
                  <option>4:5</option>
                  <option>21:9</option>
                </Select>
              </Field>
              <Field label="Style">
                <Input value={scene.style} onChange={(event) => props.updateScene("style", event.target.value)} />
              </Field>
              <Field label="Duration">
                <Input
                  type="number"
                  min={1}
                  value={scene.duration}
                  onChange={(event) => props.updateScene("duration", Number(event.target.value))}
                />
              </Field>
              <Field label="Description" className="md:col-span-2">
                <Textarea
                  value={scene.description}
                  onChange={(event) => props.updateScene("description", event.target.value)}
                />
              </Field>
              <Button onClick={props.generatePrompts} className="md:col-span-2">
                <RefreshCcw className="h-4 w-4" />
                Generate Prompts
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Prompt Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PromptField
              label="Image Prompt"
              value={props.promptFields.imagePrompt}
              onChange={(value) => props.setPromptFields({ ...props.promptFields, imagePrompt: value })}
            />
            <PromptField
              label="Negative Prompt"
              value={props.promptFields.negativePrompt}
              onChange={(value) => props.setPromptFields({ ...props.promptFields, negativePrompt: value })}
            />
            <PromptField
              label="Video Reference Image Prompt"
              value={props.promptFields.videoReferenceImagePrompt}
              onChange={(value) => props.setPromptFields({ ...props.promptFields, videoReferenceImagePrompt: value })}
            />
            <PromptField
              label="PixVerse Video Prompt"
              value={props.promptFields.pixverseVideoPrompt}
              onChange={(value) => props.setPromptFields({ ...props.promptFields, pixverseVideoPrompt: value })}
            />
            <PromptField
              label="Motion / Camera / Action Prompt"
              value={props.promptFields.motionCameraActionPrompt}
              onChange={(value) => props.setPromptFields({ ...props.promptFields, motionCameraActionPrompt: value })}
            />
            <Button onClick={props.savePrompts} className="w-full">
              <Save className="h-4 w-4" />
              Save Reviewed Version
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Generate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Provider">
              <Select value={props.provider} onChange={(event) => props.setProvider(event.target.value)}>
                <option value="official_pixverse">official_pixverse</option>
                <option value="observed_web_api">observed_web_api</option>
                <option value="playwright_automation">playwright_automation</option>
              </Select>
            </Field>
            {props.provider === "observed_web_api" ? (
              <Field label="Observed Capability">
                <Select value={props.capabilityId} onChange={(event) => props.setCapabilityId(event.target.value)}>
                  <option value="">Select manually enabled capability</option>
                  {props.capabilities.map((capability) => (
                    <option key={capability.id} value={capability.id}>
                      {capability.method} {capability.path}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <div className="rounded-md border bg-muted/60 p-3 text-sm">
              {scene?.promptReviewed ? "Reviewed prompt version ready." : "Save reviewed prompts before submission."}
            </div>
            <Button className="w-full" onClick={props.submitJob} disabled={!scene?.promptReviewed}>
              <Play className="h-4 w-4" />
              Submit Job
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(scene?.jobs || []).map((job) => (
              <JobRow key={job.id} job={job} retryJob={props.retryJob} />
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
  className
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function PromptField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-28" />
    </Field>
  );
}

function ProviderSettings({ settings }: { settings: SettingsPayload | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>API Provider Settings</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {settings
          ? Object.entries(settings).map(([key, value]) => (
              <div key={key} className="rounded-md border bg-white p-3">
                <div className="text-xs text-muted-foreground">{key}</div>
                <div className="mt-1 font-medium">{String(value)}</div>
              </div>
            ))
          : null}
      </CardContent>
    </Card>
  );
}

function HarAnalyzerView({ analyzeHar, report }: { analyzeHar: (files: FileList | null) => void; report: unknown }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>HAR Analyzer</CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background text-sm text-foreground">
            <FileJson className="h-4 w-4" />
            Upload HAR
            <input type="file" accept=".har,application/json" className="hidden" onChange={(e) => analyzeHar(e.target.files)} />
          </Label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sanitized Report</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[650px] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
            {report ? JSON.stringify(report, null, 2) : "{}"}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function CapabilityRegistry({
  capabilities,
  updateCapability
}: {
  capabilities: Capability[];
  updateCapability: (capability: Capability, patch: Partial<Capability>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>API Capability Registry</CardTitle>
      </CardHeader>
      <CardContent className="overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2">Provider</th>
              <th>Source</th>
              <th>Method</th>
              <th>Path</th>
              <th>Risk</th>
              <th>Enabled</th>
              <th>Production</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {capabilities.map((capability) => (
              <tr key={capability.id} className="border-b align-top">
                <td className="py-2 font-medium">{capability.provider}</td>
                <td>{capability.source}</td>
                <td>{capability.method}</td>
                <td className="max-w-[280px] truncate">{capability.path}</td>
                <td>{capability.riskLevel}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={capability.enabled}
                    onChange={(event) => updateCapability(capability, { enabled: event.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={capability.productionAllowed}
                    onChange={(event) => updateCapability(capability, { productionAllowed: event.target.checked })}
                  />
                </td>
                <td className="max-w-[320px] text-xs text-muted-foreground">{capability.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function JobMonitor({ jobs, retryJob }: { jobs: Job[]; retryJob: (jobId: string, provider?: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Monitor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} retryJob={retryJob} />
        ))}
      </CardContent>
    </Card>
  );
}

function JobRow({ job, retryJob }: { job: Job; retryJob: (jobId: string, provider?: string) => void }) {
  return (
    <div className="rounded-md border bg-white p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{job.provider}</div>
        <span className="rounded-sm bg-muted px-2 py-1 text-xs">{job.status}</span>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div>{job.id}</div>
        {job.resultUrl ? <div>{job.resultUrl}</div> : null}
        {job.error ? (
          <div className="flex gap-1 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {job.error}
          </div>
        ) : null}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs">Request / Response</summary>
        <pre className="mt-2 max-h-52 overflow-auto rounded bg-slate-950 p-2 text-[11px] text-slate-50">
          {JSON.stringify({ request: parseJsonText(job.request), response: parseJsonText(job.response) }, null, 2)}
        </pre>
      </details>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => retryJob(job.id)}>
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </Button>
        <Button variant="outline" size="sm" onClick={() => retryJob(job.id, "official_pixverse")}>
          <Settings className="h-3.5 w-3.5" />
          Official
        </Button>
      </div>
    </div>
  );
}

function parseJsonText(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
