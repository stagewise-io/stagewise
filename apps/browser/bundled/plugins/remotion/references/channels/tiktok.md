## Video formats

Limits: min `360px` per side, max `4096px` per side. Vertical `9:16` primary.

### Portrait 1

- Res: `1080x1920`
- Aspect: `9:16`
- Best default for organic HQ posts

### Square

- Res: `1080x1080`, ads min `640x640`
- Aspect: `1:1`
- Keep key text in center `1080x1080` for grid

### Landscape

- Res: `1920x1080`, ads min `960x540`
- Aspect: `16:9`

## Safe area

Safe zones shift with caption length + UI.

- Subject/action safe: center `90%`, `972x1728` on `1080p`
- Text/logo safe: center `80%`, `864x1536` on `1080p`
- Avoid top `10%`, right `10-15%`, bottom `20-25%`

## Encoding

- Container: `MP4` best, also `WebM`, `MOV`
- Video codec: `H.264` best, also `H.265`, `VP8`, `VP9`
- Audio codec: `AAC`
- FPS: `23-60`, use `30`, use `60` for motion-heavy
- Bitrate: `516 kbps` standard ads to `2500 kbps` TopView. Organic: enough for clean `1080p`

## Limits

- File: `4 GB` developer API, `500 MB` ads. Legacy `72MB` Android / `287.6MB` iOS
- Native length: up to `10 min` recorded, `60 min` uploaded
- Ads length: `5-60s`, TopView best `9-15s`
- Min length: about `1s`

## Style

- Made-for-TikTok: vertical, sound-on, people-led, authentic/DIY
- Hook in first `3-6s`
- Fast motion/cuts, camera shifts, expressive voiceover
- Story: problem -> solution -> benefit
- Use on-screen text + auto-captions
- Organic loop: spark trends, adapt native form, fuel responses, act collabs

## Description / captions

- Limit: `2200` UTF-16 chars
- Display often truncates after `4` lines
- Front-load hook/value
- Put hashtags + mentions at end
- Use spaces/new lines to split metadata
- Clickable organic links need `1000+` followers or verified business. Raw URLs usually not clickable

## Thumbnails / covers

- Pick cover in-app before post. API defaults to first frame if unset
- Design on `1080x1920`. Keep text inside `1:1` center crop for profile grid
- A/B test official only for paid ads, not organic

## Engagement

- Primary signals: likes, shares, comments, completion/full watch, low skip
- Use trending sounds, relevant hashtags, localized metadata
- Likes/shares weighted more than views
- Discovery driven by recency, country popularity, user prefs like length/creator
