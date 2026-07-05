# VideoFactory Import Guide

## What VideoFactory Is

VideoFactory is a standalone Node.js workflow project for generating and submitting daily vertical image/video assets.

It is not a JavaScript library that you import with `import` or `require`. Instead, you “import” it into a workflow by running its command-line scripts, usually through `start.sh`.

The project is designed to work with an Aurax PixVerse bridge. VideoFactory creates prompts and sends jobs to the bridge, while the bridge manages PixVerse accounts, tokens, queues, and generation tasks.

## Main Features

- Generates daily prompt packs.
- Uses fictional adult personas with predefined styles.
- Supports local dry runs before real submission.
- Uses local Codex CLI to generate AI prompt files.
- Can also use existing `.txt` or `.md` prompt folders.
- Submits image-generation jobs to the Aurax bridge.
- Supports batch image submission.
- Supports image-to-video submission after public image URLs are configured.
- Downloads generated Relax Images into the local `output/` folder.
- Can delete downloaded remote batches after local validation.
- Stores run logs, manifests, prompt files, and result JSON files.
- Supports multiple image models and model limits for testing.

## Included Personas

The project includes six default personas:

- `Lune`
- `Nya`
- `Vera`
- `Elise`
- `Yuna`
- `Aiko`

Persona data lives in:

```text
personas/personas.json
```

Persona head images live in:

```text
head/
```

## Technical Structure

```text
VideoFactory/
├── README.md
├── package.json
├── start.sh
├── config/
│   ├── factory.config.json
│   └── head-image-urls.example.json
├── docs/
│   └── ARCHITECTURE.md
├── head/
│   └── persona head images
├── personas/
│   ├── personas.json
│   └── persona notes
├── scripts/
│   ├── check-config.mjs
│   ├── generate-ai-prompts.mjs
│   ├── generate-day.mjs
│   ├── lib.mjs
│   ├── submit-images.mjs
│   ├── submit-videos.mjs
│   └── sync-relax-images.mjs
├── test1_prompt/
│   └── seed prompt files
├── runs/
│   └── daily generated runs
└── output/
    └── downloaded generated assets
```

## Important Files

### `start.sh`

This is the main workflow entry point.

Use it to:

- generate prompts
- submit image jobs
- send jobs to the remote Aurax bridge
- download results
- clean up remote image batches

### `package.json`

Defines the npm commands:

```bash
npm run check
npm run make-today
npm run ai-prompts
npm run submit-images
npm run submit-videos
npm run sync-relax-images
```

### `config/factory.config.json`

Controls:

- daily prompt count
- timezone
- image models
- video model
- quality
- duration
- aspect ratio
- bridge URL
- safety negative prompt

### `config/head-image-urls.example.json`

Template for public HTTPS image URLs used by image-to-video generation.

## How To Import VideoFactory Into A Workflow

Use VideoFactory as a runnable command-line step.

### 1. Go To The Project Folder

If it is already unzipped in Documents:

```bash
cd /Users/steven-mac2/Documents/VideoFactory
```

### 2. Check The Setup

```bash
npm run check
```

This checks whether the config and persona head images are available.

### 3. Set The Bridge API Key

Get a bridge key from Aurax Admin, then run:

```bash
export PIXVERSE_WEB_PROVIDER_API_KEY=your_real_bridge_key
```

Important: replace `your_real_bridge_key` with the real key. Do not type that placeholder literally.

### 4. Run A Dry Test

```bash
bash start.sh
```

This runs locally and does not submit real remote jobs.

### 5. Run The Remote Workflow

```bash
bash start.sh --remote
```

This runs the real workflow:

1. Generates prompt files.
2. Submits image jobs to the Aurax bridge.
3. Downloads generated Relax Images.
4. Deletes remote downloaded batches unless configured otherwise.

## Fast Test Command

To avoid submitting a large batch, run only one prompt and one model:

```bash
cd /Users/steven-mac2/Documents/VideoFactory
export PIXVERSE_WEB_PROVIDER_API_KEY=your_real_bridge_key
bash start.sh --remote --prompt-dir runs/2026-05-27/ai-prompts --skip-ai --limit 1 --model-limit 1
```

This is the safest real remote test.

## Use Existing Prompts

VideoFactory can use any folder with `.txt` or `.md` prompt files.

Example:

```bash
bash start.sh --remote --prompt-dir my-prompts --skip-ai
```

Persona-grouped prompts are also supported:

```text
my-prompts/
├── Lune/
│   └── 01.txt
├── Nya/
│   └── 01.txt
└── Vera/
    └── 01.txt
```

## Submit Images Manually

Dry run:

```bash
npm run submit-images -- --prompt-dir test1_prompt --dry-run --limit 1
```

Real submission:

```bash
export PIXVERSE_WEB_PROVIDER_API_KEY=your_real_bridge_key
npm run submit-images -- --prompt-dir runs/2026-05-28/ai-prompts --limit 6
```

Use only one model:

```bash
npm run submit-images -- --prompt-dir runs/2026-05-28/ai-prompts --model-limit 1
```

Use specific models:

```bash
npm run submit-images -- --prompt-dir runs/2026-05-28/ai-prompts --models qwen-image,seedream-4.0
```

## Submit Image-To-Video Jobs

First create the URL map:

```bash
cp config/head-image-urls.example.json config/head-image-urls.json
```

Then edit `config/head-image-urls.json` with public HTTPS image URLs:

```json
{
  "Lune": "https://your-domain.example/head/Lune.png",
  "Nya": "https://your-domain.example/head/Nya.png",
  "Vera": "https://your-domain.example/head/Vera.png",
  "Elise": "https://your-domain.example/head/Elise.png",
  "Yuna": "https://your-domain.example/head/Yuna.png",
  "Aiko": "https://your-domain.example/head/Aiko.png"
}
```

Dry run:

```bash
npm run submit-videos -- --prompt-dir runs/2026-05-28/ai-prompts --image-url-map config/head-image-urls.json --dry-run --limit 1
```

Real run:

```bash
export PIXVERSE_WEB_PROVIDER_API_KEY=your_real_bridge_key
npm run submit-videos -- --prompt-dir runs/2026-05-28/ai-prompts --image-url-map config/head-image-urls.json --limit 3
```

## Download Existing Relax Images

Download today’s batches:

```bash
npm run sync-relax-images -- --all --date today --bridge-url https://admin666.aurax.one
```

Download and delete remote batches:

```bash
npm run sync-relax-images -- --all --date today --bridge-url https://admin666.aurax.one --delete-remote
```

## Common Problems

### `/path/to/VideoFactory` Not Found

That was only a placeholder. Use the real path:

```bash
cd /Users/steven-mac2/Documents/VideoFactory
```

### `operation not permitted: ./start.sh`

Run it with bash:

```bash
bash start.sh --remote
```

Or make it executable:

```bash
chmod +x start.sh
./start.sh --remote
```

### It Looks Stuck During Prompt Generation

This step can take several minutes:

```text
node scripts/generate-ai-prompts.mjs --date today --count 5
```

It calls the local Codex CLI and may not print progress while working.

For a faster test:

```bash
bash start.sh --remote --prompt-dir runs/2026-05-27/ai-prompts --skip-ai --limit 1 --model-limit 1
```

### API Key Is Wrong

Check it:

```bash
echo $PIXVERSE_WEB_PROVIDER_API_KEY
```

If it prints `YOUR_ACTUAL_BRIDGE_KEY` or `your_real_bridge_key`, you still need to replace it with the real Aurax bridge key.

## Recommended Workflow

For daily production:

```bash
cd /Users/steven-mac2/Documents/VideoFactory
export PIXVERSE_WEB_PROVIDER_API_KEY=your_real_bridge_key
bash start.sh --remote
```

For a small controlled test:

```bash
cd /Users/steven-mac2/Documents/VideoFactory
export PIXVERSE_WEB_PROVIDER_API_KEY=your_real_bridge_key
bash start.sh --remote --limit 3 --model-limit 1
```

## Summary

Best way to import VideoFactory:

```text
Workflow scheduler or manual terminal
        ↓
cd /Users/steven-mac2/Documents/VideoFactory
        ↓
export PIXVERSE_WEB_PROVIDER_API_KEY=...
        ↓
bash start.sh --remote
        ↓
Aurax PixVerse Bridge
        ↓
Generated image/video assets
```

