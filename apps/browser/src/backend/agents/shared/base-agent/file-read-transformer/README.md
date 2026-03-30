# File Read Transformer Pipeline

All file content entering the LLM model context flows through this pipeline.
This document describes **how**, **when**, and **with what parameters** files
are loaded, deduplicated, cached, and injected into model messages.

---

## Architecture Overview

```
User message / Tool result
        │
        ▼
  pathReferences          Record<mountedPath, sha256Hash>
        │                 populated by populate-path-references.ts
        ▼
  injectFileReferences()  (in utils.ts)
        │
        ├─ resolveReadParams()   per-path default heuristic
        ├─ SeenFilesTracker      coverage-aware deduplication
        │
        ▼
  fileReadTransformer()   (index.ts — single entry point)
        │
        ├─ Resolve path + stat
        ├─ Read content + compute hash
        ├─ Build cache key (hash + ext + readParams suffix)
        ├─ Cache lookup (current hash, then expected hash)
        ├─ Run per-type transformer if cache miss
        │    └─ text / image / pdf / svg / directory / archive / …
        ├─ Cache store (fire-and-forget)
        │
        ▼
  wrapResult()            XML envelope: <file path="…" [readParam attrs]>
        │
        ▼
  Model message parts     TextPart / ImagePart / FilePart
```

---

## ReadParams

`ReadParams` (defined in `types.ts`) controls how a file's content is read
and presented. These originate from the `readFile` tool's input schema and
flow through the entire pipeline — transformers, cache keys, XML output,
and deduplication.

```typescript
interface ReadParams {
  startLine?: number;   // 1-indexed inclusive (text files)
  endLine?: number;     // 1-indexed inclusive (text files)
  startPage?: number;   // 1-indexed inclusive (paginated content)
  endPage?: number;     // 1-indexed inclusive (paginated content)
  preview?: boolean;    // structural preview instead of full content
  depth?: number;       // tree depth for directories, archives, disk images
}
```

When no `ReadParams` are provided (`{}`), transformers produce the full
default representation of the file.

### Which transformers respect which params

| Param | Transformers | Behaviour |
|-------|-------------|-----------|
| `startLine` / `endLine` | text, svg, text-blob | Slice output to the requested line range |
| `startPage` / `endPage` | pdf | Only process pages in the requested range |
| `preview` | text, svg, text-blob, pdf, image, raw-image, directory, archive, disk-image | Produce a heavily truncated structural overview |
| `depth` | directory, archive, disk-image | Control tree rendering depth (see below) |

Params that are not applicable to a transformer are silently ignored.

### Depth parameter

The `depth` parameter controls how many levels of nested entries are
rendered in tree-like content. `0` = direct children only,
`1` = children + grandchildren, etc.

Each transformer defines its own default when `depth` is omitted:

| Transformer | Default depth | Description |
|------------|---------------|-------------|
| `directory` | 2 | Filesystem directory listing |
| `archive` | 4 | ZIP, TAR, TAR.GZ file tree |
| `disk-image` | 4 | ISO 9660, DMG, IMG file tree |

The depth is respected at **rendering** time (`formatDirectoryTree()`).
For disk images, the internal extraction depth (ISO parsing, DMG walk)
uses the transformer's default as a hard cap regardless of the requested
depth — this prevents expensive deep traversals while still allowing
the rendering layer to show fewer levels.

---

## File Origin Heuristics

Files enter the pipeline from three distinct sources. Each source applies
different default `ReadParams`:

### 1. User-mentioned workspace files

- **Source:** `path:` markdown links in user messages, file/workspace
  `@`-mentions, extracted by `extractPathLinksFromMessage()` and
  `collectPathsFromUserMessage()`.
- **Default ReadParams:** `{ preview: true }`
- **Rationale:** User mentions are contextual references. A structural
  preview is usually sufficient for the model to understand the file's
  role. The agent can request full content via the `readFile` tool if
  needed, which avoids bloating context with large files the user merely
  referenced.

### 2. User-uploaded attachments (`att/` prefix)

- **Source:** File/image attachments on user messages, stored in the
  `att/` blob directory.
- **Default ReadParams:** `undefined` (full content, no preview)
- **Rationale:** Attachments are explicit user-provided context. The user
  intentionally uploaded the file for the agent to process. Truncating or
  previewing would lose critical information.
- **Implementation:** `resolveReadParams()` returns `undefined` for any
  path starting with `att/`, overriding the caller's default.

### 3. Agent `readFile` tool calls

- **Source:** Completed `readFile` tool-call parts on assistant messages,
  extracted by `extractReadFilePathsFromAssistantMessage()`.
- **Default ReadParams:** `undefined` (full content)
- **Rationale:** The agent explicitly requested this file. Tool-call args
  (`start_line`, `end_line`, `start_page`, `end_page`, `depth`, `preview`)
  from the `readFile` input schema map to `ReadParams` and flow through
  as the transformer's context.

---

## Deduplication

Deduplication policy is split by file origin:

| Origin | Dedup rule |
|--------|------------|
| **User mentions** | Deduplicated by `(path, hash)`. Same hash = same preview output → re-injection adds no value. |
| **Attachments (`att/`)** | Deduplicated by `(path, hash)`. Same hash = same full-content output. |
| **Agent `readFile` calls** | **Never deduplicated.** The agent explicitly decided to read the file. The pipeline always produces output. |

### `SeenFilesTracker` (coverage.ts)

Tracks which `(path, hash)` pairs have already been injected within the
current conversation window. Implemented as a plain `Set<"path:hash">`.

**API:**

- `isCovered(path, hash)` — returns `true` if this pair was already injected.
- `record(path, hash)` — records that this pair was injected.

User mentions are always `preview` mode — the same hash always produces the
same output, so a simple equality check is sufficient. Agent reads bypass
this tracker entirely (no `isCovered()` call in that branch).

---

## Cache Key Structure

Cache keys encode content identity + format + read parameters:

```
<sha256Hash>:<ext>@<readParamsSuffix>
```

The key is built by `FileReadCacheService.buildCacheKey()` using the
suffix from `buildReadParamsSuffix()`.

### Suffix format

Segments are appended in fixed order, only for non-`undefined` params:

| Param | Suffix segment | Example |
|-------|---------------|---------|
| `startLine` | `sl=N` | `sl=10` |
| `endLine` | `el=N` | `el=50` |
| `startPage` | `sp=N` | `sp=2` |
| `endPage` | `ep=N` | `ep=5` |
| `preview` | `pv=1` | `pv=1` |
| `depth` | `d=N` | `d=3` |

Segments are joined with `,`. An empty suffix (no params set) means
full content — no `@` separator is appended.

### Examples

| Params | Cache key |
|--------|-----------|
| `{}` (full file) | `a1b2c3…f0:.ts` |
| `{ startLine: 1, endLine: 50 }` | `a1b2c3…f0:.ts@sl=1,el=50` |
| `{ preview: true }` | `a1b2c3…f0:.ts@pv=1` |
| `{ startPage: 2, endPage: 5 }` | `a1b2c3…f0:.pdf@sp=2,ep=5` |
| `{ depth: 3 }` | `a1b2c3…f0:@d=3` |
| `{ startLine: 10, depth: 2 }` | `a1b2c3…f0:.ts@sl=10,d=2` |

### Stability note

`depth: undefined` and `depth: DEFAULT_DEPTH` produce **different** cache
keys even when they yield identical output (because the suffix omits
`undefined` values). This means the same content may be cached under two
entries. The coverage tracker compensates at the dedup layer within a
conversation. The cache inefficiency is minor and intentional — normalising
would require the cache layer to know each transformer's default, breaking
separation of concerns.

---

## XML Output Format

Each file is wrapped in an XML envelope for the model:

```xml
<file path="w1/src/app.tsx" startLine="10" endLine="50">
<metadata>language:tsx|lines:142|size:4.2KB|modified:2024-01-15T10:30:00Z</metadata>
<content>
… file content or preview …
</content>
</file>
```

**Tag selection:**
- `<dir>` for directories
- `<file>` for everything else

**Read-param attributes** are included on `<file>` tags only (not `<dir>`):
- `startLine`, `endLine` — when a line range was requested
- `startPage`, `endPage` — when a page range was requested
- `preview="true"` — when preview mode was used
- `depth="N"` — when a specific depth was requested

Directories use `<dir>` tags and never receive read-param attributes
because depth is reflected in the tree output itself.

---

## Transformers Reference

### Routing

The entry point (`index.ts`) routes files to transformers by extension:

1. **Compound extensions** are checked first (e.g. `.tar.gz` → archive).
2. **Simple extensions** are looked up in `TRANSFORMER_BY_EXT`.
3. **Directories** always use the directory transformer.
4. **Fallback** is the text transformer for unknown extensions.

### Per-transformer details

#### `text.ts` — Text fallback
- **Extensions:** All unknown extensions (fallback)
- **Output:** `TextPart` with line-numbered content (`1|`, `2|`, …)
- **Metadata:** `language` (inferred from extension), `lines`
- **ReadParams:**
  - `startLine` / `endLine` — slice to specific line range
  - `preview` — first 30 lines with truncation indicator

#### `image.ts` — Raster images
- **Extensions:** `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.avif`, `.ico`
- **Output:** `ImagePart` (WebP at quality 80 via sharp)
- **Metadata:** `dimensions`, `format`, `originalFormat`
- **ReadParams:**
  - `preview` — metadata-only summary (dimensions, format) without image data

#### `svg.ts` — SVG images
- **Extensions:** `.svg`
- **Output:** `TextPart` (raw XML source — models benefit from seeing markup)
- **Metadata:** `format: svg`, `language: xml`, `lines`
- **ReadParams:**
  - `startLine` / `endLine` — slice to specific line range
  - `preview` — first 30 lines with truncation indicator

#### `pdf.ts` — PDF documents
- **Extensions:** `.pdf`
- **Output:** `TextPart` per page (`<page>` XML) + `ImagePart` for embedded rasters
- **Metadata:** `pages`, `format: pdf`
- **Limits:** Max 30 pages, 10 images/page, 50 total images
- **ReadParams:**
  - `startPage` / `endPage` — only process pages in the requested range
  - `preview` — first page text only, no images

#### `text-blob.ts` — Browser-captured blobs
- **Extensions:** `.textclip`, `.swdomelement`
- **Output:** `TextPart` (raw UTF-8 content)
- **Metadata:** `type` (text-clip or dom-element), `lines`
- **ReadParams:**
  - `startLine` / `endLine` — slice to specific line range
  - `preview` — first 30 lines with truncation indicator

#### `directory.ts` — Filesystem directories
- **Extensions:** N/A (detected by stat)
- **Output:** `TextPart` (indented tree listing via `formatDirectoryTree()`)
- **Metadata:** `type: directory`, `entries`, `depth`
- **Default depth:** 2
- **ReadParams:**
  - `depth` — controls both fs traversal depth and tree rendering depth
  - `preview` — shallow listing (depth 0, direct children only)
- **Limits:** Max 200 entries, per-depth caps `[20, 10, 5]`

#### `archive.ts` — Archive files
- **Extensions:** `.zip`, `.jar`, `.war`, `.tar`, `.tgz`, `.tar.gz`
- **Output:** `TextPart` (indented tree with file sizes via `formatDirectoryTree()`)
- **Metadata:** `format`, `files`, `directories`, `totalEntries`, `uncompressedSize`
- **Default depth:** 4
- **ReadParams:**
  - `depth` — controls tree rendering depth
  - `preview` — shallow tree (depth 0, top-level entries only)
- **Limits:** Max 2000 entries extracted, 500 displayed
- **Formats:** ZIP via yauzl, TAR via manual header parsing, TAR.GZ via zlib+TAR

#### `raw-image.ts` — Raw camera images
- **Extensions:** `.nef`, `.cr2`, `.cr3`, `.arw`, `.dng`, `.orf`, `.rw2`, `.raf`,
  `.pef`, `.srw`, `.erf`, `.3fr`, `.rwl`, `.mrw`, `.nrw`, `.raw`
- **Output:** EXIF metadata as `TextPart` + embedded JPEG preview as `ImagePart`
- **Metadata:** Camera/lens info, exposure settings, dimensions
- **ReadParams:**
  - `preview` — EXIF metadata only, no embedded preview image

#### `disk-image.ts` — Disk images
- **Extensions:** `.iso`, `.img`, `.dmg`
- **Output:** `TextPart` (indented tree with file sizes via `formatDirectoryTree()`)
- **Metadata:** `format`, `files`, `directories`, `totalEntries`, `volumeId` (ISO)
- **Default depth:** 4
- **ReadParams:**
  - `depth` — controls tree rendering depth (extraction depth is fixed)
  - `preview` — shallow tree (depth 0, top-level entries only)
- **ISO 9660:** Parsed from Primary Volume Descriptor + directory records
- **DMG:** Mounted read-only via `hdiutil` (macOS only), contents walked
- **IMG:** Attempts ISO 9660, falls back to metadata-only
- **Limits:** Max 500 entries

### `formatDirectoryTree()` (format-directory-tree.ts)

Shared utility used by directory, archive, and disk-image transformers.
Renders a `TreeEntry[]` tree into compact indented text.

**Options:**
- `maxTotalEntries` — Global entry cap across the entire tree
- `maxEntriesPerDepth` — Per-depth caps (array, e.g. `[20, 10, 5]`)
- `maxDepth` — Maximum depth to render (0-indexed)
- `metadataKeys` — Optional keys to render inline (e.g. `['size']`)

**Output format:**
```
src/
  components/
    button.tsx  (size:1.2KB)
    modal.tsx  (size:3.4KB)
  index.ts  (size:200B)
README.md  (size:800B)
```

Directories sorted first, then files, both alphabetical within group.

---

## Truncation Safety

Transformers may deliver less content than requested (e.g. capping large
files at a maximum line count). The pipeline handles this via
`effectiveReadParams`:

1. **`FileTransformResult.effectiveReadParams`** — Set by transformers that
   truncate output. Describes what was actually delivered (e.g.
   `{ startLine: 1, endLine: 300 }` when a 500-line file was capped).

2. **Serialized into cache** — `SerializedTransformResult` includes
   `effectiveReadParams` so cache hits preserve truncation info.

3. **XML envelope** — `effectiveReadParams` drives the `truncated="true"`
   attribute on `<file>` tags, informing the model when its request was
   not fully delivered.

4. **Fallback** — When the transformer does not set `effectiveReadParams`
   (i.e. delivered everything asked for), the originally requested params
   are used as the effective params.

---

## Integration Point: `utils.ts`

The `buildModelMessages()` function in `utils.ts` is the consumer:

1. Creates a `SeenFilesTracker` instance (scoped to the conversation window).
2. For **user messages**: calls `injectFileReferences()` with
   `defaultReadParams = { preview: true }`.
3. For **assistant messages**: calls `injectFileReferences()` with no
   `defaultReadParams` (full content).
4. Inside `injectFileReferences()`:
   - `resolveReadParams()` overrides per path (e.g. `att/` → full).
   - **Agent reads:** `fileReadTransformer()` is called unconditionally —
     no `isCovered()` gate. `seenFiles.record(path, hash)` is called after
     so user-mention dedup is aware of what was injected.
   - **User mentions / attachments:** `seenFiles.isCovered(path, hash)` is
     checked first; skipped if already seen. `seenFiles.record()` on inject.

### `resolveReadParams()` heuristic

```
att/* paths    → undefined (always full — override any caller default)
All other paths → caller's defaultReadParams (preview for user, {} for assistant)
```

### `populatePathReferences()` (populate-path-references.ts)

Collects mount-prefixed paths from a message and hashes them:

**Sources (deduplicated):**
- `path:` markdown links in text parts
- `metadata.attachments[].path`
- `metadata.mentions[]` — file mentions (`mountedPath`), workspace mentions (`prefix`)

**Output:** `message.metadata.pathReferences = { path: sha256Hash }`

For assistant messages, `extractReadFilePathsFromAssistantMessage()` extracts
paths from completed `readFile` tool-call parts (state `output-available` or
`output-error`).

---

## File Listing

| File | Role |
|------|------|
| `index.ts` | Central entry point — `fileReadTransformer()`, XML wrapping, cache key building, extension→transformer routing |
| `types.ts` | Core types: `ReadParams`, `TransformerContext`, `FileTransformResult`, `FileTransformer`, serialization types |
| `coverage.ts` | `SeenFilesTracker` — `(path, hash)` dedup for user mentions and attachments |
| `path-references.ts` | Extract referenced paths from user/assistant messages (`path:` links, `readFile` tool-call parts) |
| `populate-path-references.ts` | Hash files and populate `pathReferences` on message metadata |
| `hash.ts` | SHA-256 hashing for files (content) and directories (child names+sizes) |
| `resolve-path.ts` | Mount-prefix → absolute path resolution |
| `serialization.ts` | Cache (de)serialization for `FileTransformResult` (including `effectiveReadParams`) |
| `serialization.test.ts` | Tests for serialization round-tripping (17 cases) |
| `file-read-transformer.test.ts` | Integration tests for the full pipeline (21 cases, including no-dedup regression tests) |
| `format-utils.ts` | Human-readable size formatting (`formatBytes`), language inference from extension |
| `format-directory-tree.ts` | Generic tree formatter — used by directory, archive, and disk-image transformers |
| `transformers/` | Per-type transformer implementations (10 files) |
| `transformers/index.ts` | Barrel re-export of all transformers |
