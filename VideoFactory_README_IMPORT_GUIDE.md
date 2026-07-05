# VideoFactory Import and Workflow Guide

## Overview

VideoFactory is a standalone Node.js workflow project for generating and submitting daily vertical social media image/video assets.

It is not designed to be imported as a JavaScript library. Instead, it is meant to be integrated into a workflow by running its shell script or npm scripts from the command line.

The project creates prompt packs, submits image-generation jobs to an Aurax PixVerse bridge, optionally submits image-to-video jobs, downloads generated image bundles, and stores run logs locally.

The default creative direction is mature, stylish, romantic, sensual, and non-explicit. The included personas are fictional adults, and the prompt templates include safety boundaries against minors, school settings, nudity, sexual acts, coercion, intoxication, voyeuristic framing, celebrity faces, and deepfakes.

## Main Features

- Daily prompt generation for multiple fictional adult personas.
- Local dry-run mode for testing without remote submissions.
- AI prompt generation using the local Codex CLI.
- Support for manually prepared prompt folders.
- Batch image submission to the Aurax PixVerse bridge.
- Optional one-request-per-image submission mode.
- Image-to-video submission support after public image URLs are prepared.
- Automatic output folder creation by date.
- Run manifests, logs, prompt files, story notes, and submission result files.
- Relax Images download and optional remote cleanup after successful download.
- Configurable persona list, model list, bridge URL, quality, duration, aspect ratio, and safety prompt.
- Built-in seed prompt library with hundreds of example prompt files.
- Persona head images for identity/style consistency.

## Included Personas

VideoFactory includes six default personas:

- Lune
- Nya
- Vera
- Elise
- Yuna
- Aiko

Each persona has:

- name
- age
- series label
- visual DNA
- emotional tone
- wardrobe options
- signature scenes
- forbidden directions
- local head image

Persona configuration is stored in:

```text
personas/personas.json
```

Persona head images are stored in:

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
│   ├── Aiko.png
│   ├── Elise.png
│   ├── Lune.png
│   ├── Nya.png
│   ├── Vera.png
│   └── Yuna.png
├── personas/
│   ├── personas.json
│   └── *.md
├── scripts/
│   ├── check-config.mjs
│   ├── generate-ai-prompts.mjs
│   ├── generate-day.mjs
│   ├── lib.mjs
│   ├── submit-images.mjs
│   ├── submit-videos.mjs
│   └── sync-relax-images.mjs
├── test1_prompt/
│   └── *.txt
├── runs/
│   └── YYYY-MM-DD/
└── output/
    └── downloaded image bundles
```

## Important Scripts

### `start.sh`

Main workflow entry point.

It can:

- generate AI prompts
- submit image jobs
- submit to a remote Aurax bridge
- download Relax Images
- delete downloaded remote batches

Use this for normal workflow integration.

### `scripts/generate-ai-prompts.mjs`

Generates new prompt files using the local Codex CLI.

Default output:

```text
runs/YYYY-MM-DD/ai-prompts/
```

### `scripts/generate-day.mjs`

Creates a structured daily run using the seed prompt library and persona configuration.

Default output:

```text
runs/YYYY-MM-DD/prompts/
runs/YYYY-MM-DD/stories/
runs/YYYY-MM-DD/manifest.json
```

### `scripts/submit-images.mjs`

Submits prompt files to the Aurax bridge image endpoint.

Supports:

- `--prompt-dir`
- `--manifest`
- `--dry-run`
- `--limit`
- `--model-limit`
- `--models`
- `--ultra-models`
- `--batch`
- `--no-batch`

### `scripts/submit-videos.mjs`

Submits image-to-video jobs after a public image URL map is configured.

Requires:

```text
config/head-image-urls.json
```

### `scripts/sync-relax-images.mjs`

Downloads generated Relax Images from the Aurax bridge.

Can also delete remote batches after local download validation.

### `scripts/check-config.mjs`

Checks local configuration and confirms persona head images exist.

## Configuration

Main configuration file:

```text
config/factory.config.json
```

Important settings include:

- daily prompt count
- default timezone
- image models
- ultra image models
- image quality
- video model
- video quality
- duration
- aspect ratio
- off-peak flag
- bridge URL
- bridge API key environment variable
- safety negative prompt

Default bridge API key environment variable:

```text
PIXVERSE_WEB_PROVIDER_API_KEY
```

Default local bridge URL:

```text
http://127.0.0.1:8787
```

Default remote bridge URL used by `start.sh`:

```text
https://admin666.aurax.one
```

## How To Import This Into A Workflow

VideoFactory should be imported as a runnable workflow step, not as a code module.

### Step 1: Unzip the Project

```bash
unzip VideoFactory.zip
cd VideoFactory
```

If the project is already unzipped in Documents:

```bash
cd /Users/steven-mac2/Documents/VideoFactory
```

### Step 2: Check the Local Setup

```bash
npm run check
```

This verifies the config and included persona head images.

### Step 3: Set the Bridge API Key

Generate a bridge key in Aurax Admin, then set it in the terminal:

```bash
export PIXVERSE_WEB_PROVIDER_API_KEY=your_real_bridge_key
```

Do not type `your_real_bridge_key` literally. Replace it with the actual bridge key.

Recommended security cleanup:

```bash
BRIDGE_API_KEY="PASTE_ADMIN_GENERATED_BRIDGE_KEY_HERE"
```

If `start.sh` contains a real hardcoded key, replace it with the placeholder above and use the environment variable instead.

### Step 4: Run a Safe Local Dry Run

```bash
bash start.sh
```

This generates prompts and prepares submissions without calling the remote bridge.

### Step 5: Run a Real Remote Workflow

```bash
bash start.sh --remote
```

This runs the full remote flow:

1. Generate prompt files.
2. Submit image jobs to the Aurax bridge.
3. Download Relax Images into `output/`.
4. Delete remote downloaded batches unless `--keep-remote` is used.

## Fast Test Submission

To avoid submitting a large batch, use a small test:

```bash
export PIXVERSE_WEB_PROVIDER_API_KEY=your_real_bridge_key
bash start.sh --remote --prompt-dir runs/2026-05-27/ai-prompts --skip-ai --limit 1 --model-limit 1
```

This skips new prompt generation and submits only one prompt with one model.

## Use an Existing Prompt Folder

VideoFactory can read any folder containing `.txt` or `.md` prompt files.

Flat folder example:

```text
my-prompts/
├── prompt-01.txt
├── prompt-02.txt
└── prompt-03.md
```

Persona-grouped folder example:

```text
my-prompts/
├── Lune/
│   └── 01.txt
├── Nya/
│   └── 01.txt
└── Vera/
    └── 01.txt
```

Run it:

```bash
bash start.sh --remote --prompt-dir my-prompts --skip-ai
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

Use exact models:

```bash
npm run submit-images -- --prompt-dir runs/2026-05-28/ai-prompts --models qwen-image,seedream-4.0
```

Use only the first configured model:

```bash
npm run submit-images -- --prompt-dir runs/2026-05-28/ai-prompts --model-limit 1
```

## Submit Image-to-Video Jobs

Image-to-video submission requires public HTTPS image URLs.

Create the URL map:

```bash
cp config/head-image-urls.example.json config/head-image-urls.json
```

Edit `config/head-image-urls.json` so each persona points to a public HTTPS image URL:

```json
{
  "Lune": "https://your-public-domain.example/head/Lune.png",
  "Nya": "https://your-public-domain.example/head/Nya.png",
  "Vera": "https://your-public-domain.example/head/Vera.png",
  "Elise": "https://your-public-domain.example/head/Elise.png",
  "Yuna": "https://your-public-domain.example/head/Yuna.png",
  "Aiko": "https://your-public-domain.example/head/Aiko.png"
}
```

Dry run:

```bash
npm run submit-videos -- --prompt-dir runs/2026-05-28/ai-prompts --image-url-map config/head-image-urls.json --dry-run --limit 1
```

Real submission:

```bash
export PIXVERSE_WEB_PROVIDER_API_KEY=your_real_bridge_key
npm run submit-videos -- --prompt-dir runs/2026-05-28/ai-prompts --image-url-map config/head-image-urls.json --limit 3
```

## Download Existing Relax Images

Download all matching remote batches for today:

```bash
npm run sync-relax-images -- --all --date today --bridge-url https://admin666.aurax.one
```

Download and delete remote batches after validation:

```bash
npm run sync-relax-images -- --all --date today --bridge-url https://admin666.aurax.one --delete-remote
```

## Common Problems

### `cd: no such file or directory: /path/to/VideoFactory`

`/path/to/VideoFactory` is only a placeholder.

Use the real folder:

```bash
cd /Users/steven-mac2/Documents/VideoFactory
```

### `zsh: operation not permitted: ./start.sh`

Run the script with bash:

```bash
bash start.sh --remote
```

Or make it executable:

```bash
chmod +x start.sh
./start.sh --remote
```

### It Looks Stuck While Generating Prompts

This line can take several minutes:

```text
node scripts/generate-ai-prompts.mjs --date today --count 5
```

It is calling the local Codex CLI and may not print progress while prompts are being generated.

For a faster test, skip prompt generation:

```bash
bash start.sh --remote --prompt-dir runs/2026-05-27/ai-prompts --skip-ai --limit 1 --model-limit 1
```

### Remote Submission Fails

Check that the API key is real:

```bash
echo $PIXVERSE_WEB_PROVIDER_API_KEY
```

If it prints `YOUR_ACTUAL_BRIDGE_KEY` or `your_real_bridge_key`, the key was not replaced.

Set the real key:

```bash
export PIXVERSE_WEB_PROVIDER_API_KEY=actual_key_from_aurax_admin
```

## Recommended Production Workflow

For daily automation, schedule this command:

```bash
cd /Users/steven-mac2/Documents/VideoFactory
export PIXVERSE_WEB_PROVIDER_API_KEY=your_real_bridge_key
bash start.sh --remote
```

For a smaller controlled production test:

```bash
cd /Users/steven-mac2/Documents/VideoFactory
export PIXVERSE_WEB_PROVIDER_API_KEY=your_real_bridge_key
bash start.sh --remote --limit 3 --model-limit 1
```

## Integration Summary

Use VideoFactory as a command-line workflow component:

```bash
bash start.sh --remote
```

Inputs:

- persona config
- head images
- seed prompts or generated prompts
- bridge API key
- optional public image URL map

Outputs:

- generated prompt folders
- daily run manifests
- submission logs
- image submission result JSON
- video submission result JSON
- downloaded Relax Images zip files
- extracted generated images

Best import style:

```text
Scheduler / Admin Button / Manual Terminal
        ↓
cd VideoFactory
        ↓
export PIXVERSE_WEB_PROVIDER_API_KEY=...
        ↓
bash start.sh --remote
        ↓
Aurax PixVerse Bridge
        ↓
PixVerse account pool and generated assets
```
