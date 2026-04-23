---
name: create-remotion-video
description: Create or edit video with Remotion. First-party stagewise + Remotion skill. Contains full video-making process.
user-invocable: false
agent-invocable: true
---

## Prerequisites

- Need at least one connected workspace where styleguide + video project can live. If none, ask user to connect one.
- Need multiple workspaces if styleguide lives elsewhere or user wants cross-workspace references.

## Process

Video work has process. Keep progress in project-root `progress.md`. ALWAYS FOLLOW EXACTLY THIS PROCESS!

### Overview

0. Select styleguide for video
   - Find skills for styleguides for remotion videos.
   - ALWAYS ask user which one to use.
   - If none exists, create new one. ALWAYS follow `./references/styleguides/howto.md` in detail.
   - Do NOT continue until styleguide choice is known.
   - Keep correct styleguide in mind for whole editing session.
   - Store chosen styleguide in `spec.yaml`.
   - If user asks for global style changes like typography/colors, FIRST update styleguide, THEN update video.
   - Keep all colors, typography, etc. in shared TS file.
   - Shared TS file MUST include all specs from styleguide `DESIGN.md`. Global changes should flow from this file.

1. Create project
   - Make clean standalone Remotion project in own folder.
   - ALWAYS Follow guide in `./references/remotion/basics.md`. IGNORE `remotion-best-practices` skill.
   - Start with minimal simple video.
   - If user gave no structure, ask where project should go.
   - Do NOT use workspace root unless user says so.
   - Install deps with workspace package manager. If fresh, prefer pnpm. npm only fallback. Respect user prefs from chat/skills.
   - Keep code, assets, story, copy in this folder.
   - Start dev server in shell. ALWAYS open it in new browser tab.

2. Create `spec.yaml` + `progress.md` in project folder.

3. Spec video
   - Define purpose + content.
   - Define publishing channels. Can be many.
   - Define target length.

4. Create video structure with empty/prefilled sequences from storyboards
   - Prefer storyboard templates from styleguide. If none exist, create them.
   - New storyboard templates MUST be added to styleguide using `./references/styleguides/howto-storyboard-templates.md`.
   - Update main styleguide `SKILL.md` too.
   - First create template spec. Then create code.
   - If user changes storyboard, FIRST update template in styleguide, THEN update code.
   - For sequences, use layout definitions from styleguide. If missing, create new layout.
   - ALWAYS define new layouts with `./references/styleguides/howto-layouts.md`.
   - Update main styleguide `SKILL.md` too.
   - First create layout spec. Then create code.
   - On layout/template change requests, FIRST update styleguide definition, THEN update code.
   - For reusable elements like logos, use elements from styleguide.
   - New reusable elements MUST be added with `./references/styleguides/howto-elements.md`.
   - Show user. Iterate if needed.
   - Storyboard ALWAYS source of truth for structure.

5. Collect assets
   - Tell user what assets are needed.
   - If asset can be built directly, build it.
   - Tell user what they must gather FIRST.
   - Can reuse React components from other monorepo parts.

6. Build video
   - MUST use `./references/remotion/basics.md` and included rules.
   - Iterate until video compiles clean.
   - Check website logs for issues. If website closed, reopen and check.
   - After EVERY video change, check logs again. Logs MUST stay clean.

7. Iterate on video
   - Ask user to watch all variants: portrait, landscape, etc.
   - If requested style change conflicts with styleguide, ask: update guide or make one-off?
   - Always update storyboard if scene order, length, or structure changes.
   - After feedback, improve and ask user to rewatch.

8. Channel copy + thumbnails
   - Create platform copy for all relevant channels in project-root `publishing.md`.
   - Create thumbnails for all relevant channels.

9. Render videos + thumbnails
   - Tell user to start render in Remotion Studio.
   - Tell user which render-setting overrides are needed.
   - Prefer high quality.
   - Standard HQ: `CRF=5`, `JPEG=95`.
   - Help tune if user unhappy.

User may not know all details. Make good suggestions when useful, but ALWAYS ask if user likes proposal.

Guide user step by step. Always explain what you will do before doing it.

## Special files

### `progress.md`

- Tracks progress + key decisions.
- For each step, mark: not started, in progress, finished.
- Keep compact.
- Note important decisions + blockers.
- Use it to see what remains.

### `spec.yaml`

Defines high-level project intent: content, purpose, length, channels, style, music style, voiceover. Details live in code.

If `spec.yaml` changes, ALWAYS refactor video code to match.

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

- Build for channels user wants.
- If many channels share settings, reuse shared setup.
- If channel settings conflict, create multiple composition variants.
- Best practices + formats live in `./references/channels/`: `facebook.md`, `instagram.md`, `linkedin.md`, `tiktok.md`, `x.md`, `youtube-shorts.md`, `youtube.md`.
- Follow those files unless user gives different rules.

## Optimize for landscape/portrait

- Video may ship in portrait and landscape.
- Create multiple composition variants when needed.
- Keep storyboard in sync.
- Optimize layout for each aspect ratio.

## Background music

- If fitting, ask user if bg music is wanted.
- Suggest royalty-free music from internet, or Suno for music generation.

## Thumbnails

- Some channels need thumbnails.
- Sometimes need multiple thumbnails for A/B tests.
- Channel decides format.
- Use Remotion static composition for thumbnails.

Two paths:

1. Reuse scene from video.
   - Overlay/resize scene text if needed.
   - Thumbnail text must stay readable at small size.
2. Make fresh scene.
   - Reuse style + assets.
   - Keep scene clean.

## Completion

Video work is done when videos, thumbnails, and platform copy all exist and are worked out.

- ALWAYS check what work remains when finishing part of process.
- ALWAYS keep `progress.md` updated.
- ALWAYS keep `spec.yaml` in sync.
- ALWAYS update styleguide if global style changes happen, or new layouts/storyboards get created.
