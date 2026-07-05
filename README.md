# AIGC Video Workflow

Local-first workspace for planning AI video scenes, generating structured prompts,
managing provider settings, inspecting generation jobs, and cleaning user-owned
video assets with FFmpeg or an optional local ProPainter worker.

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-SQLite-2d3748)](https://www.prisma.io/)

## Why This Project Exists

AI video production usually spans several fragile steps: scene planning,
reference image handling, prompt iteration, provider configuration, generation
tracking, and post-processing. This project brings those steps into one local
web app so a creator or engineer can prototype an end-to-end workflow without
storing private platform credentials in the frontend or relying on unofficial
automation by default.

The app is intentionally conservative:

- Local mock generation is the default source.
- Official API integration is represented through a provider settings layer.
- Browser-login flows are manual and local-only.
- Observed or automated web capabilities are disabled unless explicitly enabled.
- Video cleanup is limited to content you own, generated, licensed, or have
  permission to edit.

## Highlights

- Project and scene workspace for AI video planning.
- Reference asset uploads stored on the local filesystem.
- Prompt generation for image prompts, negative prompts, first-frame prompts,
  PixVerse-style video prompts, and camera/action notes.
- Prompt versioning with review state.
- Provider settings for mock, PixVerse official API, PixVerse browser session,
  and pai.video browser session.
- Job monitor with retry support for mock generation jobs.
- HAR analyzer with sensitive value redaction.
- Capability registry for tracking provider actions and risk levels.
- Project export as a zip containing metadata and local assets.
- Local video cleanup UI and CLI powered by FFmpeg.
- Optional ProPainter AI inpaint mode with local environment diagnostics.

## Product Surface

| Area | Purpose |
| --- | --- |
| Projects | Create projects, organize scenes, upload reference assets, and export work. |
| Scene Editor | Edit scene direction, generate prompt sets, review versions, and create jobs. |
| Provider Settings | Manage local provider source selection, API key status, and manual browser login sessions. |
| Jobs | Inspect queued, completed, failed, and retried generation jobs. |
| HAR Analyzer | Review HAR files with credentials, tokens, cookies, emails, phones, and payment-like values redacted. |
| Capabilities | Track provider capabilities, risk level, production allowance, and enabled state. |
| Video Cleanup | Upload a local video, select a region, preview it, and process it with safe local modes. |

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Prisma
- SQLite for local development
- Local filesystem storage
- FFmpeg / FFprobe for video processing
- Playwright for optional local browser profiles
- ProPainter as an optional external local worker

## Quick Start

```bash
npm install
cp .env.example .env.local
npx prisma generate
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

`.env.example` contains placeholders only. Copy it to `.env.local` and keep
local environment files out of Git.

```bash
PIXVERSE_API_KEY=
OPENAI_API_KEY=
ENABLE_OBSERVED_WEB_API=false
ENABLE_PLAYWRIGHT_AUTOMATION=false
DATABASE_URL="file:./dev.db"
STORAGE_ROOT=./storage
REDIS_URL=
PROPAINTER_ENABLED=false
PROPAINTER_REPO_PATH=
PROPAINTER_PYTHON=
```

## Common Commands

```bash
npm run dev
npm run lint
npm test
npm run typecheck
npm run build
```

## Video Cleanup

Video Cleanup supports both a browser UI and a CLI. Install FFmpeg first and
make sure `ffmpeg` and `ffprobe` are available in your shell.

```bash
npm run video:cleanup -- \
  --input ./input.mp4 \
  --output ./output.mp4 \
  --mode preview \
  --x 20 --y 20 --w 160 --h 60
```

Supported modes:

- `preview`: draw the selected rectangle on a short preview.
- `crop`: crop/rescale when the selected region is near a border.
- `blur`: blur the selected region.
- `cover`: cover the region with a solid color.
- `delogo`: apply FFmpeg's `delogo` filter to a small fixed logo area.
- `ai-inpaint-propainter`: optional local ProPainter inpainting mode.

Create a synthetic local test video:

```bash
npm run video:cleanup:test-fixture
```

The legacy `video:watermark` command remains as a compatibility alias for the
cleanup CLI.

## Optional ProPainter Worker

ProPainter support is optional. If it is not installed, the app still builds
and the FFmpeg modes continue to work. Only `ai-inpaint-propainter` reports a
clean `PROPAINTER_NOT_INSTALLED` result.

Useful commands:

```bash
bash workers/propainter/setup-macos.sh
bash workers/propainter/check-env.sh
bash workers/propainter/test-worker.sh
npm run video:diagnose-propainter
```

Read the full setup notes in
[workers/propainter/README.md](workers/propainter/README.md).

## Provider Settings

Provider Settings are available at `/settings`.

Supported source options:

- `mock`
- `pixverse_official_api`
- `pixverse_web_browser`
- `pai_video_web_browser`

The app stores PixVerse API keys only server-side under ignored local storage
and never returns raw keys to the browser. Browser login sessions use local
Playwright profiles under `storage/browser-profiles/`.

This repository does not include private web API calls, captcha bypassing,
credit bypassing, protected content downloading, or automated account
restriction evasion.

## Safety And Compliance

This project is an independent local workflow tool. It is not affiliated with
PixVerse, pai.video, ProPainter, or their owners.

The project is designed around these boundaries:

- Do not store passwords, cookies, session tokens, or private credentials in
  source control.
- Do not bypass captcha, payment, credits, login protection, rate limits,
  anti-bot systems, or account restrictions.
- Do not use HAR analysis to recover secrets or automate protected endpoints.
- Do not use video cleanup to remove attribution, copyright marks, platform
  marks, paywalls, or third-party ownership signals.
- Only process videos you own, generated yourself, licensed, or have explicit
  permission to edit.
- Review third-party model and code licenses before using optional AI workers.

## Repository Layout

```text
app/                  Next.js routes and dashboard UI
components/ui/        Shared UI primitives
lib/                  Services, provider adapters, storage, video helpers
prisma/               SQLite schema and migrations
scripts/              CLI utilities for cleanup and diagnostics
tests/                Node test suite
workers/propainter/   Optional local ProPainter setup and checks
```

## Additional Guides

- [VideoFactory Import Guide](README_VideoFactory_Import_Guide.md)
- [VideoFactory Workflow Guide](VideoFactory_README_IMPORT_GUIDE.md)
- [ProPainter Worker Setup](workers/propainter/README.md)

## Development Status

This is a local-first MVP. It is useful for prompt workflow prototyping,
provider configuration experiments, local job orchestration, and safe video
cleanup tests. Production deployment, real provider billing flows, multi-user
auth, and durable cloud storage should be added deliberately before using it as
a shared production system.

## Repository

[https://github.com/anatanoojiisann/AIGC](https://github.com/anatanoojiisann/AIGC)
