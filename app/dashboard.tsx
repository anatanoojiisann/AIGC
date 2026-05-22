"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  Film,
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

type VideoCleanupJob = {
  id: string;
  projectId: string;
  sourceAssetId: string;
  outputAssetId: string | null;
  mode: string;
  region: string;
  status: string;
  errorMessage: string | null;
  outputPath: string | null;
  createdAt: string;
  updatedAt: string;
  sourceAsset?: Asset;
  outputAsset?: Asset | null;
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
  cleanupJobs?: VideoCleanupJob[];
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

type ProviderSource = "mock" | "pixverse_official_api" | "pixverse_web_browser" | "pai_video_web_browser";
type LoginBrowser = "chrome" | "safari";

type ProviderSettingsData = {
  activeSource: ProviderSource;
  pixverseOfficialApi: {
    enabled: boolean;
    apiKeyConfigured: boolean;
    maskedKey: string | null;
  };
  pixverseWebBrowser: {
    enabled: boolean;
    loginStatus: string;
    profilePath: string;
    browserProfiles?: Record<LoginBrowser, string>;
  };
  paiVideoWebBrowser: {
    enabled: boolean;
    loginStatus: string;
    profilePath: string;
    browserProfiles?: Record<LoginBrowser, string>;
  };
  sources: Record<ProviderSource, string>;
};

type View = "projects" | "editor" | "settings" | "har" | "capabilities" | "jobs" | "cleanup";

const emptyPrompt = {
  imagePrompt: "",
  negativePrompt: "",
  videoReferenceImagePrompt: "",
  pixverseVideoPrompt: "",
  motionCameraActionPrompt: ""
};

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error?: {
        code?: string;
        message?: string;
      };
    };

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Something went wrong.";
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload: unknown = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid response from ${url}.`);
  }

  if (!response.ok) {
    if (payload && typeof payload === "object" && "ok" in payload) {
      const envelope = payload as ApiEnvelope<T>;
      if (!envelope.ok) {
        throw new Error(envelope.error?.message || `Request failed (${response.status}): ${url}`);
      }
    }
    throw new Error(`Request failed (${response.status}): ${url}`);
  }

  if (payload && typeof payload === "object" && "ok" in payload) {
    const envelope = payload as ApiEnvelope<T>;
    if (!envelope.ok) {
      throw new Error(envelope.error?.message || `Request failed: ${url}`);
    }
    return envelope.data;
  }

  return payload as T;
}

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
  const [cleanupJobs, setCleanupJobs] = useState<VideoCleanupJob[]>([]);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [providerSettings, setProviderSettings] = useState<ProviderSettingsData | null>(null);
  const [newProjectName, setNewProjectName] = useState("PixVerse Project");
  const [provider, setProvider] = useState<ProviderSource>("mock");
  const [capabilityId, setCapabilityId] = useState("");
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [harReport, setHarReport] = useState<unknown>(null);
  const [promptFields, setPromptFields] = useState(emptyPrompt);

  const selectedScene = useMemo(
    () => project?.scenes.find((scene) => scene.id === selectedSceneId) || project?.scenes[0],
    [project, selectedSceneId]
  );

  const observedCapabilities = capabilities.filter((capability) => capability.provider === "observed_web_api");

  const loadProject = useCallback(async (id: string) => {
    try {
      const data = await apiRequest<{ project: Project }>(`/api/projects/${id}`);
      setProject(data.project);
      setSelectedSceneId((current) => current || data.project.scenes[0]?.id || "");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(errorText(error));
    }
  }, []);

  const loadProjects = useCallback(async (projectIdToLoad?: string) => {
    try {
      const data = await apiRequest<{ projects: Project[] }>("/api/projects");
      setProjects(data.projects);
      const id = projectIdToLoad || initialProjectId || data.projects[0]?.id;
      if (id) await loadProject(id);
      setErrorMessage("");
    } catch (error) {
      setProjects([]);
      setErrorMessage(errorText(error));
    }
  }, [initialProjectId, loadProject]);

  const loadMeta = useCallback(async () => {
    try {
      const [capabilityData, jobData, settingsData, cleanupJobData, providerSettingsData] = await Promise.all([
        apiRequest<{ capabilities: Capability[] }>("/api/capabilities"),
        apiRequest<{ jobs: Job[] }>("/api/jobs"),
        apiRequest<{ settings: SettingsPayload }>("/api/settings"),
        apiRequest<{ jobs: VideoCleanupJob[] }>("/api/video-cleanup/jobs"),
        apiRequest<{ settings: ProviderSettingsData }>("/api/provider-settings")
      ]);
      setCapabilities(capabilityData.capabilities);
      setJobs(jobData.jobs);
      setSettings(settingsData.settings);
      setCleanupJobs(cleanupJobData.jobs);
      setProviderSettings(providerSettingsData.settings);
      setProvider(providerSettingsData.settings.activeSource);
      setErrorMessage("");
    } catch (error) {
      setCapabilities([]);
      setJobs([]);
      setCleanupJobs([]);
      setProviderSettings(null);
      setErrorMessage(errorText(error));
    }
  }, []);

  useEffect(() => {
    void loadProjects(initialProjectId);
    void loadMeta();
  }, [initialProjectId, loadMeta, loadProjects]);

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
    try {
      const data = await apiRequest<{ project: Project }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName })
      });
      setNotice("Project created.");
      setErrorMessage("");
      setView("editor");
      await loadProjects(data.project.id);
    } catch (error) {
      setNotice("");
      setErrorMessage(errorText(error));
    }
  }

  async function createScene() {
    if (!project) return;
    try {
      const data = await apiRequest<{ scene: Scene }>("/api/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          title: `Scene ${project.scenes.length + 1}`,
          description: "A cinematic product moment with clear subject action."
        })
      });
      setSelectedSceneId(data.scene.id);
      setNotice("Scene created.");
      setErrorMessage("");
      await loadProject(project.id);
    } catch (error) {
      setNotice("");
      setErrorMessage(errorText(error));
    }
  }

  async function updateScene(field: keyof Scene, value: string | number) {
    if (!selectedScene || !project) return;
    try {
      await apiRequest<{ scene: Scene }>(`/api/scenes/${selectedScene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value })
      });
      setErrorMessage("");
      await loadProject(project.id);
    } catch (error) {
      setErrorMessage(errorText(error));
    }
  }

  async function uploadFiles(files: FileList | null, role = "reference") {
    if (!files || !project || !selectedScene) return;
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("files", file));
    form.append("sceneId", selectedScene.id);
    form.append("role", role);
    try {
      await apiRequest<{ assets: Asset[] }>(`/api/projects/${project.id}/files`, { method: "POST", body: form });
      setNotice(role === "replacement" ? "Replacement file uploaded." : "Reference file uploaded.");
      setErrorMessage("");
      await loadProject(project.id);
    } catch (error) {
      setNotice("");
      setErrorMessage(errorText(error));
    }
  }

  async function generatePrompts() {
    if (!selectedScene || !project) return;
    try {
      const data = await apiRequest<{ prompt: PromptVersion }>(`/api/scenes/${selectedScene.id}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedScene)
      });
      setPromptFields({
        imagePrompt: data.prompt.imagePrompt,
        negativePrompt: data.prompt.negativePrompt,
        videoReferenceImagePrompt: data.prompt.videoReferenceImagePrompt,
        pixverseVideoPrompt: data.prompt.pixverseVideoPrompt,
        motionCameraActionPrompt: data.prompt.motionCameraActionPrompt
      });
      setNotice("Draft prompts generated.");
      setErrorMessage("");
      await loadProject(project.id);
    } catch (error) {
      setNotice("");
      setErrorMessage(errorText(error));
    }
  }

  async function savePrompts() {
    if (!selectedScene || !project) return;
    try {
      await apiRequest<{ prompt: PromptVersion }>(`/api/scenes/${selectedScene.id}/prompts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...promptFields,
          previousPromptVersionId: selectedScene.promptVersions[0]?.id
        })
      });
      setNotice("Prompt version saved and marked reviewed.");
      setErrorMessage("");
      await loadProject(project.id);
    } catch (error) {
      setNotice("");
      setErrorMessage(errorText(error));
    }
  }

  async function submitJob() {
    if (!selectedScene || !project) return;
    if (provider !== "mock") {
      setNotice("");
      setErrorMessage("Only mock generation is enabled for this MVP. Use Provider Settings to connect accounts and test API keys.");
      return;
    }
    try {
      await apiRequest<{ job: Job }>("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: selectedScene.id,
          provider: "official_pixverse",
          capabilityId: null
        })
      });
      setNotice("Generation job submitted.");
      setErrorMessage("");
      await Promise.all([loadProject(project.id), loadMeta()]);
    } catch (error) {
      setNotice("");
      setErrorMessage(errorText(error));
    }
  }

  async function retryJob(jobId: string, nextProvider?: string) {
    try {
      await apiRequest<{ job: Job }>(`/api/jobs/${jobId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: nextProvider })
      });
      setNotice("Retry submitted.");
      setErrorMessage("");
      if (project) await loadProject(project.id);
      await loadMeta();
    } catch (error) {
      setNotice("");
      setErrorMessage(errorText(error));
    }
  }

  async function analyzeHar(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const data = await apiRequest<{ report?: unknown }>("/api/har/analyze", { method: "POST", body: form });
      setHarReport(data.report || data);
      setNotice("HAR report sanitized and capabilities stored disabled.");
      setErrorMessage("");
      await loadMeta();
    } catch (error) {
      setNotice("");
      setErrorMessage(errorText(error));
    }
  }

  async function updateCapability(capability: Capability, patch: Partial<Capability>) {
    try {
      await apiRequest<{ capability: Capability }>(`/api/capabilities/${capability.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      setErrorMessage("");
      await loadMeta();
    } catch (error) {
      setErrorMessage(errorText(error));
    }
  }

  function exportProject() {
    if (!project) return;
    window.location.href = `/api/projects/${project.id}/export`;
  }

  async function refreshProviderSettings() {
    const data = await apiRequest<{ settings: ProviderSettingsData }>("/api/provider-settings");
    setProviderSettings(data.settings);
    setProvider(data.settings.activeSource);
    return data.settings;
  }

  async function saveActiveProviderSource(activeSource: ProviderSource) {
    const data = await apiRequest<{ settings: ProviderSettingsData }>("/api/provider-settings/active-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeSource })
    });
    setProviderSettings(data.settings);
    setProvider(data.settings.activeSource);
    setNotice("Active source saved.");
    setErrorMessage("");
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
              ["jobs", "Jobs"],
              ["cleanup", "Video Cleanup"]
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

        {errorMessage ? (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-white px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {errorMessage}
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

        {view === "settings" ? (
          <ProviderSettings
            settings={settings}
            providerSettings={providerSettings}
            refreshProviderSettings={refreshProviderSettings}
            saveActiveProviderSource={saveActiveProviderSource}
            setNotice={setNotice}
            setErrorMessage={setErrorMessage}
          />
        ) : null}
        {view === "har" ? <HarAnalyzerView analyzeHar={analyzeHar} report={harReport} /> : null}
        {view === "capabilities" ? (
          <CapabilityRegistry capabilities={capabilities} updateCapability={updateCapability} />
        ) : null}
        {view === "jobs" ? <JobMonitor jobs={jobs} retryJob={retryJob} /> : null}
        {view === "cleanup" ? (
          <VideoCleanupTool
            project={project}
            cleanupJobs={cleanupJobs}
            reloadProject={loadProject}
            reloadMeta={loadMeta}
          />
        ) : null}
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
  provider: ProviderSource;
  setProvider: (provider: ProviderSource) => void;
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
              <Select value={props.provider} onChange={(event) => props.setProvider(event.target.value as ProviderSource)}>
                <option value="mock">mock</option>
                <option value="pixverse_official_api">pixverse_official_api</option>
                <option value="pixverse_web_browser">pixverse_web_browser</option>
                <option value="pai_video_web_browser">pai_video_web_browser</option>
              </Select>
            </Field>
            <div className="rounded-md border bg-muted/60 p-3 text-sm">
              {props.provider === "mock"
                ? scene?.promptReviewed
                  ? "Reviewed prompt version ready for mock generation."
                  : "Save reviewed prompts before submission."
                : "This source can be configured now. Generation remains mock-only in this MVP."}
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

function ProviderSettings({
  settings,
  providerSettings,
  refreshProviderSettings,
  saveActiveProviderSource,
  setNotice,
  setErrorMessage
}: {
  settings: SettingsPayload | null;
  providerSettings: ProviderSettingsData | null;
  refreshProviderSettings: () => Promise<ProviderSettingsData>;
  saveActiveProviderSource: (activeSource: ProviderSource) => Promise<void>;
  setNotice: (message: string) => void;
  setErrorMessage: (message: string) => void;
}) {
  const [activeSourceDraft, setActiveSourceDraft] = useState<ProviderSource>("mock");
  const [apiKey, setApiKey] = useState("");
  const [pixverseLoginMethod, setPixverseLoginMethod] = useState("email");
  const [pixverseBrowser, setPixverseBrowser] = useState<LoginBrowser>("chrome");
  const [paiBrowser, setPaiBrowser] = useState<LoginBrowser>("chrome");
  const [phoneHint, setPhoneHint] = useState("");
  const [loadingAction, setLoadingAction] = useState("");

  useEffect(() => {
    if (providerSettings?.activeSource) setActiveSourceDraft(providerSettings.activeSource);
  }, [providerSettings?.activeSource]);

  async function runSettingsAction(label: string, action: () => Promise<void>) {
    setLoadingAction(label);
    setErrorMessage("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setLoadingAction("");
    }
  }

  async function saveApiKey() {
    await apiRequest("/api/provider-settings/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey })
    });
    setApiKey("");
    await refreshProviderSettings();
    setNotice("PixVerse API key saved.");
  }

  async function clearApiKey() {
    await apiRequest("/api/provider-settings/api-key", { method: "DELETE" });
    await refreshProviderSettings();
    setNotice("PixVerse API key cleared.");
  }

  async function testApiKey() {
    const data = await apiRequest<{ message: string }>("/api/provider-settings/test-pixverse-api-key", { method: "POST" });
    await refreshProviderSettings();
    setNotice(data.message);
  }

  async function startPixverseLogin() {
    await apiRequest("/api/provider-settings/pixverse-web/start-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: pixverseLoginMethod, browser: pixverseBrowser })
    });
    await refreshProviderSettings();
    setNotice(`PixVerse ${pixverseBrowser === "safari" ? "Safari" : "Chrome"} login opened.`);
  }

  async function startPaiLogin() {
    await apiRequest("/api/provider-settings/pai-video/start-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browser: paiBrowser })
    });
    await refreshProviderSettings();
    setNotice(`pai.video ${paiBrowser === "safari" ? "Safari" : "Chrome"} login opened.`);
  }

  const status = providerSettings?.sources || {
    mock: "available",
    pixverse_official_api: "needs_api_key",
    pixverse_web_browser: "needs_login",
    pai_video_web_browser: "needs_login"
  };
  const selectedStatus = status[activeSourceDraft];
  const sourceLabels: Record<ProviderSource, string> = {
    mock: "mock",
    pixverse_official_api: "pixverse_official_api",
    pixverse_web_browser: "pixverse_web_browser",
    pai_video_web_browser: "pai_video_web_browser"
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="xl:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        Web login opens the official website in a local browser session. This app does not collect passwords, Google
        credentials, phone verification codes, cookies, or session tokens.
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active API Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Current source">
            <Select value={activeSourceDraft} onChange={(event) => setActiveSourceDraft(event.target.value as ProviderSource)}>
              {(Object.keys(sourceLabels) as ProviderSource[]).map((source) => (
                <option key={source} value={source}>
                  {sourceLabels[source]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {(Object.keys(sourceLabels) as ProviderSource[]).map((source) => (
              <div key={source} className="rounded-md border bg-white p-2">
                <div className="font-medium">{sourceLabels[source]}</div>
                <div className="text-xs text-muted-foreground">{status[source]}</div>
              </div>
            ))}
          </div>
          {selectedStatus !== "available" && selectedStatus !== "connected" ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-950">
              Selected source is not ready: {selectedStatus}.
            </div>
          ) : null}
          <Button
            onClick={() => runSettingsAction("active-source", () => saveActiveProviderSource(activeSourceDraft))}
            disabled={loadingAction === "active-source"}
          >
            Save Active Source
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PixVerse Official API Key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-white p-3 text-sm">
            <div className="text-xs text-muted-foreground">Configured</div>
            <div className="font-medium">{String(providerSettings?.pixverseOfficialApi.apiKeyConfigured || false)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {providerSettings?.pixverseOfficialApi.maskedKey || "No key saved"}
            </div>
          </div>
          <Field label="API Key">
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Paste PixVerse official API key"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runSettingsAction("save-api-key", saveApiKey)} disabled={loadingAction !== ""}>
              Save API Key
            </Button>
            <Button variant="outline" onClick={() => runSettingsAction("test-api-key", testApiKey)} disabled={loadingAction !== ""}>
              Test API Key
            </Button>
            <Button variant="outline" onClick={() => runSettingsAction("clear-api-key", clearApiKey)} disabled={loadingAction !== ""}>
              Clear API Key
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PixVerse Web Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusBadge label="Status" value={providerSettings?.pixverseWebBrowser.loginStatus || "not_connected"} />
          <Field label="Login Method">
            <Select value={pixverseLoginMethod} onChange={(event) => setPixverseLoginMethod(event.target.value)}>
              <option value="email">Email login</option>
              <option value="google">Google login</option>
            </Select>
          </Field>
          <Field label="Browser">
            <Select value={pixverseBrowser} onChange={(event) => setPixverseBrowser(event.target.value as LoginBrowser)}>
              <option value="chrome">Chrome Login</option>
              <option value="safari">Safari Login</option>
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runSettingsAction("pixverse-start", startPixverseLogin)} disabled={loadingAction !== ""}>
              Open PixVerse Login
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                runSettingsAction("pixverse-check", async () => {
                  const data = await apiRequest<{ status: string; browser: LoginBrowser }>(
                    "/api/provider-settings/pixverse-web/check-login",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ browser: pixverseBrowser })
                    }
                  );
                  await refreshProviderSettings();
                  setNotice(
                    data.status === "connected"
                      ? "Connected"
                      : data.status === "not_connected"
                        ? "Not connected"
                        : "Login status unknown"
                  );
                })
              }
              disabled={loadingAction !== ""}
            >
              Check Login Status
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                runSettingsAction("pixverse-disconnect", async () => {
                  await apiRequest("/api/provider-settings/pixverse-web/disconnect", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ browser: pixverseBrowser })
                  });
                  await refreshProviderSettings();
                  setNotice("PixVerse local browser session disconnected.");
                })
              }
              disabled={loadingAction !== ""}
            >
              Disconnect Local Browser Session
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>pai.video Web Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusBadge label="Status" value={providerSettings?.paiVideoWebBrowser.loginStatus || "not_connected"} />
          <div className="rounded-md border bg-muted/50 p-2 text-sm text-muted-foreground">
            Enter your phone number and verification code on the pai.video page. The app will not collect or store your
            code.
          </div>
          <Field label="Browser">
            <Select value={paiBrowser} onChange={(event) => setPaiBrowser(event.target.value as LoginBrowser)}>
              <option value="chrome">Chrome Login</option>
              <option value="safari">Safari Login</option>
            </Select>
          </Field>
          <Field label="Phone Number Hint">
            <Input value={phoneHint} onChange={(event) => setPhoneHint(event.target.value)} placeholder="Optional local note only" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runSettingsAction("pai-start", startPaiLogin)} disabled={loadingAction !== ""}>
              Open pai.video Login
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                runSettingsAction("pai-check", async () => {
                  const data = await apiRequest<{ status: string; browser: LoginBrowser }>(
                    "/api/provider-settings/pai-video/check-login",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ browser: paiBrowser })
                    }
                  );
                  await refreshProviderSettings();
                  setNotice(
                    data.status === "connected"
                      ? "Connected"
                      : data.status === "not_connected"
                        ? "Not connected"
                        : "Login status unknown"
                  );
                })
              }
              disabled={loadingAction !== ""}
            >
              Check Login Status
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                runSettingsAction("pai-disconnect", async () => {
                  await apiRequest("/api/provider-settings/pai-video/disconnect", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ browser: paiBrowser })
                  });
                  await refreshProviderSettings();
                  setNotice("pai.video local browser session disconnected.");
                })
              }
              disabled={loadingAction !== ""}
            >
              Disconnect Local Browser Session
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Local Runtime</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
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
    </div>
  );
}

function StatusBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-3 text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
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

function VideoCleanupTool({
  project,
  cleanupJobs,
  reloadProject,
  reloadMeta
}: {
  project: Project | null;
  cleanupJobs: VideoCleanupJob[];
  reloadProject: (id: string) => Promise<void>;
  reloadMeta: () => Promise<void>;
}) {
  const videoAssets = useMemo(
    () => project?.assets.filter((asset) => asset.type === "video" || asset.mime.startsWith("video/")) || [],
    [project?.assets]
  );
  const projectCleanupJobs = useMemo(
    () => cleanupJobs.filter((job) => job.projectId === project?.id),
    [cleanupJobs, project?.id]
  );
  const [assetId, setAssetId] = useState("");
  const [mode, setMode] = useState("preview");
  const [x, setX] = useState(20);
  const [y, setY] = useState(20);
  const [w, setW] = useState(80);
  const [h, setH] = useState(30);
  const [coverColor, setCoverColor] = useState("black@0.85");
  const [confirmedRights, setConfirmedRights] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [outputPath, setOutputPath] = useState("");
  const [outputAssetId, setOutputAssetId] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!assetId || !videoAssets.some((asset) => asset.id === assetId)) {
      setAssetId(videoAssets[0]?.id || "");
    }
  }, [assetId, videoAssets]);

  async function uploadVideo(files: FileList | null) {
    const file = files?.[0];
    if (!file || !project) return;

    const form = new FormData();
    form.append("files", file);
    form.append("role", "video_cleanup_source");

    try {
      const data = await apiRequest<{ assets: Asset[] }>(`/api/projects/${project.id}/files`, {
        method: "POST",
        body: form
      });
      const uploadedVideo = data.assets.find((asset) => asset.type === "video" || asset.mime.startsWith("video/"));
      if (uploadedVideo) setAssetId(uploadedVideo.id);
      setLocalError("");
      await reloadProject(project.id);
    } catch (error) {
      setLocalError(errorText(error));
    }
  }

  async function processVideo(nextMode = mode) {
    if (!project) {
      setLocalError("Create or open a project first.");
      return;
    }
    if (!assetId) {
      setLocalError("Select or upload a local video asset first.");
      return;
    }
    if (!confirmedRights) {
      setLocalError("Confirm that you own this video or have permission to edit it before processing.");
      return;
    }

    setProcessing(true);
    setLocalError("");
    setOutputPath("");
    setOutputAssetId("");

    try {
      const data = await apiRequest<{
        job: VideoCleanupJob;
        outputAsset: Asset;
        result: {
          outputPath: string;
          relativeOutputPath: string;
        };
      }>(nextMode === "preview" ? "/api/video-cleanup/preview" : "/api/video-cleanup/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          assetId,
          mode: nextMode,
          region: { x, y, w, h },
          coverColor,
          confirmedRights
        })
      });
      setOutputPath(data.result.relativeOutputPath || data.result.outputPath);
      setOutputAssetId(data.outputAsset.id);
      await Promise.all([reloadProject(project.id), reloadMeta()]);
    } catch (error) {
      setLocalError(errorText(error));
    } finally {
      setProcessing(false);
    }
  }

  if (!project) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Create or open a project to use Video Cleanup.</CardContent>
      </Card>
    );
  }

  const selectedAsset = videoAssets.find((asset) => asset.id === assetId);

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(420px,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Video Asset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Use Video Cleanup only for videos you own, generated yourself, or have permission to edit.
          </div>
          <Field label="Select Video">
            <Select value={assetId} onChange={(event) => setAssetId(event.target.value)}>
              <option value="">Select a video asset</option>
              {videoAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.originalName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Upload Local Video">
            <Label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background text-sm text-foreground">
              <Film className="h-4 w-4" />
              Upload Video
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(event) => uploadVideo(event.target.files)}
              />
            </Label>
          </Field>
          {selectedAsset ? (
            <video src={`/api/assets/${selectedAsset.id}`} controls className="aspect-video w-full rounded-md border bg-black" />
          ) : (
            <div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">No video asset selected.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Region Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Mode">
            <Select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="preview">preview</option>
              <option value="delogo">delogo</option>
              <option value="blur">blur</option>
              <option value="cover">cover</option>
              <option value="crop">crop</option>
            </Select>
          </Field>
          {mode === "cover" ? (
            <Field label="Cover Color">
              <Input value={coverColor} onChange={(event) => setCoverColor(event.target.value)} />
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="X">
              <Input type="number" min={1} value={x} onChange={(event) => setX(Number(event.target.value))} />
            </Field>
            <Field label="Y">
              <Input type="number" min={1} value={y} onChange={(event) => setY(Number(event.target.value))} />
            </Field>
            <Field label="W">
              <Input type="number" min={1} value={w} onChange={(event) => setW(Number(event.target.value))} />
            </Field>
            <Field label="H">
              <Input type="number" min={1} value={h} onChange={(event) => setH(Number(event.target.value))} />
            </Field>
          </div>
          <Label className="flex items-start gap-2 rounded-md border bg-white p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmedRights}
              onChange={(event) => setConfirmedRights(event.target.checked)}
            />
            <span>I confirm I own this video or have permission to edit it.</span>
          </Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => processVideo("preview")} disabled={processing}>
              Run Preview
            </Button>
            <Button onClick={() => processVideo(mode)} disabled={processing}>
              Process Video
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {localError ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-white px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {localError}
            </div>
          ) : null}
          {outputPath ? (
            <div className="rounded-md border bg-white p-3 text-sm">
              <div className="text-xs text-muted-foreground">Generated file</div>
              <div className="mt-1 break-all font-medium">{outputPath}</div>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
              Generated preview or processed video path will appear here.
            </div>
          )}
          {outputAssetId ? (
            <div className="space-y-2">
              <video src={`/api/assets/${outputAssetId}`} controls className="aspect-video w-full rounded-md border bg-black" />
              <Button asChild variant="outline" className="w-full">
                <a href={`/api/assets/${outputAssetId}`} download>
                  <Download className="h-4 w-4" />
                  Download Output
                </a>
              </Button>
            </div>
          ) : null}
          <div className="space-y-2">
            <div className="text-sm font-medium">Job Log</div>
            {projectCleanupJobs.slice(0, 6).map((job) => (
              <div key={job.id} className="rounded-md border bg-white p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{job.mode}</span>
                  <span className="rounded-sm bg-muted px-2 py-1">{job.status}</span>
                </div>
                <div className="mt-1 truncate text-muted-foreground">{job.outputPath || job.id}</div>
                {job.errorMessage ? <div className="mt-1 text-destructive">{job.errorMessage}</div> : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
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
