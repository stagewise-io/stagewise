---
name: create-video
description: Create or edit video with Remotion. Use only with Remotion project or fresh new one. Use when project has `spec.yaml` and `progress.md`.
user-invocable: false
agent-invocable: true
---

At start of create/edit, tell user you use known Remotion process. If user says no, do not use it.

## Process

Video work has process. Store progress in project-root `progress.md`.

### Overview

0. Create project
   - Clean standalone Remotion project inside its own folder
   - Minimal starter video with simple file
   - If user has no structure, ask where project should go
   - NOT workspace root unless user says so
   - Install deps with workspace package manager. If fresh, prefer pnpm. npm fallback. Follow user prefs from skills/chat.
   - Keep code, assets, story, copy all in this folder
   - Start dev server in shell. ALWAYS open in new browser tab
1. Create `spec.yaml` and `progress.md` in project folder
2. Spec video type and content
   - purpose + content
   - publishing channels, maybe many
   - length
3. Define style with `./references/styleguides/howto.md`
   - If already, use it. Else ask as needed.
   - Can use examples as baseline if user unsure or wants to explore.
   - Do NOT continue without knowing which styleguide to use.
   - MUST keep correct styleguide in mind, as long as video editing is ongoing.
   - Define styleguide in `spec.yaml`
   - If user requests changes to typography in video etc., FIRST update styleguide, then update video. Update all places using styleguide definitions.
   - Use shared TS file for all colors, typography, etc.
      - File MUST include all specs from `DESIGN.md` in styleguide skill. Changes can be propagated only to this file.
4. Create video structure with empty/prefilled sequences using storyboards
   - Prefer storyboard templates from styleguide. If no templates exist, create new ones.
      - New storyboard templates MUST be defined in styleguide skill using `./references/styleguides/howto-storyboard-templates.md` (update main SKILL.md as well)
      - First create template, then create code
      - On user requests for changes to storyboard, FIRST update definition of template in styleguide, then update code
   - For sequences, use definitions from layouts in styleguide. If required layout doesn't exist, create new one.
      - ALWAYS define new layouts in styleguide skill using `./references/styleguides/howto-layouts.md` (update main SKILL.md as well)
      - First create layout spec, then create code
      - On change requests, FIRST update definition of template in styleguide, then update code.
   - For reusable elements in video (logos, etc.), use elements from styleguide.
      - Newly introduced reusable elements MUST be added to styleguide using guide in `./references/styleguides/howto-elements.md`
   - Show user, iterate if needed
   - Storyboard ALWAYS source of truth for structure

5. Collect assets
   - Tell user what assets needed
   - If you can build asset yourself, do it
   - Tell user what they must collect FIRST
   - Can reuse React components from other monorepo parts
6. Build video
   - MUST use `./references/remotion/basics.md` and linked rules
   - Iterate until video compiles clean
   - Check website logs for issues. If website closed, reopen and check
   - After every video change, check logs again. MUST be clean
7. Iterate on video
   - Ask user to watch all variants: portrait, landscape, etc.
   - If style change conflicts with style guide, ask: update guide or one-off?
   - Always update storyboard if scene order, length, etc. changes
   - After feedback, improve and ask for rewatch
8. Channel copy and thumbnails
   - Create platform copy for all relevant channels in project-root `publishing.md`
   - Create thumbnails for all channels
9. Render videos and thumbnails
   - Tell user to start Render in Remotion Studio
   - Tell user which render-setting overrides needed
     - Prefer high quality
     - Standard HQ: `CRF=5`, `JPEG=95`
     - Help tune if user unhappy

User may not know all details. Make good suggestions when needed, but ALWAYS ask if user likes proposal.

## Special files

### `progress.md`

Shows process progress + key decisions. For each step, mark: not started, in progress, finished. Keep compact.
Note key decisions and issues per step.
Use it to see how far process is done.

### `spec.yaml`

Defines content, purpose, length, channels, style, music style, voiceover. This is high-level guideline for project. Details live in code.
When `spec.yaml` changes, ALWAYS refactor video code to match.

Examples:

```yaml
title: Feature launch for new credit card
length: 25-35 seconds
content: real life scenes, text overlay, 3d-style animated card in intro, animated outro
voiceover: no
music: like normal video style
channels: youtube, youtube-shorts, tiktok, linkedin, instagram
transparent-bg: no
style: reuse from skill `my-company-video-style`
```

```yaml
title: Mini animation with car
length: 5 seconds
content: 360° rotation around 3d car model
voiceover: no
music: none
channels: none
transparent-bg: yes
style: none
```

## Publishing channels

Build for channels user wants. If many channels, find shared settings. If settings conflict, create multiple composition variants.

Best practices and formats in `./references/channels/`: `facebook.md`, `instagram.md`, `linkedin.md`, `tiktok.md`, `x.md`, `youtube-shorts.md`, `youtube.md`.
Follow them unless user gives different guideline.

## Optimize for landscape/portrait

Video may ship in portrait and landscape. Create multiple composition variants. Keep storyboard in sync. Optimize layout for each aspect ratio.

## Background music

If fitting, ask the user if they want bg music for the video. Suggest royalty free music form the internet, or Suno for music generation.

## Thumbnails

Some publishing channels need thumbnails. Sometimes even multiple for A/B testing. Channel defines format.

Use Remotion static composition for thumbnails.

Two approaches:

1. Use scene from video; overlay/resize scene text if needed.
   - Thumbnails are small. Make text big enough to read.
2. Fresh scene
   - Reuse style/assets, but make clean scene.
