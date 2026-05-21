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
- Manage local provider source settings, PixVerse API key status, and manual web-login browser sessions
- Create and retry mock generation jobs
- Analyze HAR files with sensitive values redacted
- Keep observed API capabilities disabled by default
- Export project metadata and assets as a zip
- Process a selected video region locally with FFmpeg through Video Cleanup

## Safety Defaults

- `official_pixverse` is the default provider.
- `observed_web_api` is disabled by default.
- `playwright_automation` is disabled by default.
- This first version uses mock services only.
- The app does not store cookies, session tokens, private credentials, or API keys.
- PixVerse API keys, when saved locally, are stored only server-side under ignored local storage and are never returned raw to the frontend.
- Web login opens official sites in local Playwright browser profiles under ignored storage. The app does not collect passwords, Google credentials, phone verification codes, cookies, or session tokens.
- HAR analysis removes cookies, authorization headers, tokens, API keys, sessions, CSRF values, emails, phone numbers, and payment-like values.
- The app must not bypass captcha, credits, payment, login protection, anti-bot systems, rate limits, or account restrictions.
- Video Cleanup is only for videos you own, generated yourself, licensed content, or videos you have permission to edit.
- The app does not implement scraping, protected video downloading, AI-based invisible watermark removal, third-party platform attribution bypassing, or batch removal from downloaded videos.

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

## Video Cleanup

Install FFmpeg first and make sure `ffmpeg` and `ffprobe` are available in your terminal or PowerShell.

PowerShell-friendly CLI example:

```powershell
npm run video:cleanup -- --input ./input.mp4 --output ./output.mp4 --mode preview --x 20 --y 20 --w 160 --h 60
```

Supported modes:

- `preview` creates a short preview with the selected rectangle drawn on the video.
- `crop` crops away an edge watermark when the selected region is near a border.
- `blur` blurs the selected region.
- `cover` covers the selected region with a solid color.
- `delogo` uses FFmpeg's `delogo` filter for a small fixed logo.

Create a synthetic local test video:

```powershell
npm run video:cleanup:test-fixture
```

`video:watermark` remains as a compatibility alias for the cleanup CLI. The local UI is available at `/video-cleanup` and in the top navigation as `Video Cleanup`. It requires the confirmation checkbox before processing and writes outputs under `STORAGE_ROOT` without overwriting the original asset.

## Provider Settings

Provider Settings are available in the top navigation and at `/settings`.

- Active source defaults to `mock`.
- Supported source options are `mock`, `pixverse_official_api`, `pixverse_web_browser`, and `pai_video_web_browser`.
- PixVerse official API key can be saved, tested, masked, and cleared. The raw key is never returned to the browser.
- PixVerse web login opens PixVerse in a local Playwright browser session for manual email or Google login.
- pai.video web login opens pai.video in a local Playwright browser session for manual phone verification.
- Browser profiles are local only under `storage/browser-profiles/`.
- This MVP does not add real PixVerse generation calls or private web API calls.

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
- `/video-cleanup` Video Cleanup
- `/watermark` Compatibility route that opens Video Cleanup

## Repository

[https://github.com/anatanoojiisann/AIGC](https://github.com/anatanoojiisann/AIGC)
