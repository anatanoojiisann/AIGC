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

## Safety Defaults

- `official_pixverse` is the default provider.
- `observed_web_api` is disabled by default.
- `playwright_automation` is disabled by default.
- This first version uses mock services only.
- The app does not store cookies, session tokens, private credentials, or API keys.
- HAR analysis removes cookies, authorization headers, tokens, API keys, sessions, CSRF values, emails, phone numbers, and payment-like values.
- The app must not bypass captcha, credits, payment, login protection, anti-bot systems, rate limits, or account restrictions.

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
npm run typecheck
npm run build
```

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

## Repository

[https://github.com/anatanoojiisann/AIGC](https://github.com/anatanoojiisann/AIGC)
