# Pai.video / PixVerse Prompt Workflow MVP

Local Next.js App Router MVP for a PixVerse / Pai.video prompt and mock generation workflow.

## Features

- Create projects and scenes
- Upload reference images to local filesystem storage
- Enter scene description, platform, language, aspect ratio, style, and duration
- Generate editable mock image prompts and PixVerse video prompts
- Save reviewed prompt versions
- Replace files before generation
- Switch provider in the UI
- Create and retry mock generation jobs
- Analyze HAR files with sensitive values redacted
- Keep observed API capabilities disabled by default
- Export project metadata and assets as a zip
- Process a fixed watermark region locally with FFmpeg for owned or licensed videos

## Safety Defaults

- `official_pixverse` is the default provider.
- `observed_web_api` is disabled by default.
- `playwright_automation` is disabled by default.
- This first version uses mock services only.
- The app does not store cookies, session tokens, private credentials, or API keys.
- HAR analysis removes cookies, authorization headers, tokens, API keys, sessions, CSRF values, emails, phone numbers, and payment-like values.
- The app must not bypass captcha, credits, payment, login protection, anti-bot systems, rate limits, or account restrictions.
- Watermark-region processing is only for videos you own, licensed content, or videos where you accidentally added your own watermark.
- The app does not implement AI-based invisible watermark removal, third-party platform attribution bypassing, or batch removal from downloaded videos.

## Setup

```bash
npm install
cp .env.example .env.local
npx prisma generate
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

```bash
npm run lint
npm test
npm run typecheck
npm run build
```

## Local Video Watermark Region Processing

Install FFmpeg first and make sure `ffmpeg` and `ffprobe` are available in your terminal or PowerShell.

PowerShell-friendly CLI example:

```powershell
npm run video:watermark -- --input ./input.mp4 --output ./output.mp4 --mode delogo --x 20 --y 20 --w 160 --h 60
```

Supported modes:

- `preview` creates a short preview with the selected rectangle drawn on the video.
- `crop` crops away an edge watermark when the selected region is near a border.
- `cover` covers the region with a blurred rectangle.
- `delogo` uses FFmpeg's `delogo` filter for a small fixed logo.

The local UI is available at `/watermark`. It accepts an uploaded local video, region coordinates, and a processing mode, then writes output under `STORAGE_ROOT`.

## Environment

`.env.example` contains placeholder values only. Copy it to `.env.local` for local development. Keep `.env` and `.env.local` out of Git.

```bash
PIXVERSE_API_KEY=
OPENAI_API_KEY=
ENABLE_OBSERVED_WEB_API=false
ENABLE_PLAYWRIGHT_AUTOMATION=false
DATABASE_URL="file:./dev.db"
STORAGE_ROOT=./storage
REDIS_URL=
```

## Pages

- `/` Project List and workflow shell
- `/projects` Project List
- `/projects/[projectId]` Project Detail and Scene Editor
- `/settings` API Provider Settings
- `/har` HAR Analyzer
- `/capabilities` API Capability Registry
- `/jobs` Job Monitor
- `/watermark` Local watermark-region processor

## Repository

[https://github.com/anatanoojiisann/AIGC](https://github.com/anatanoojiisann/AIGC)
