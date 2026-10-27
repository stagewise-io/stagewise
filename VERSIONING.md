# Versioning

This document describes the versioning strategy for the stagewise monorepo.

## Commit Message Format

All commits MUST follow the Conventional Commits specification with a **mandatory** scope:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | minor |
| `fix` | Bug fix | patch |
| `docs` | Documentation only | - |
| `style` | Code style changes | - |
| `refactor` | Code refactoring | patch |
| `perf` | Performance improvement | patch |
| `test` | Adding/updating tests | - |
| `chore` | Maintenance tasks | - |

### Scopes

Scopes are auto-detected from workspace packages. Use the **exact** package name:

- `stagewise` - The desktop browser app (apps/browser, package name is `stagewise`)
- `karton` - The karton package (packages/karton)
- `website` - The website (apps/website)
- `stage-ui` - Stage UI components (packages/stage-ui)

**Important:** Sub-scopes like `stagewise-ui` are NOT valid. Use the parent package scope. Use `stagewise` (not `browser`) for changes to the Electron app — the folder is still `apps/browser` but the package, tag prefix, and scope are all `stagewise`.

### Examples

```bash
# Good
feat(stagewise): add dark mode toggle
fix(karton): resolve connection timeout issue
docs(stagewise): update installation guide

# Bad - will be rejected
feat(stagewise-ui): add button component  # Sub-scope not allowed
feat: add new feature                     # Missing scope
```

### Breaking Changes

Add `BREAKING CHANGE:` in the commit footer or `!` after the type:

```
feat(stagewise)!: redesign navigation

BREAKING CHANGE: Navigation API has changed. Update your code accordingly.
```

## Version Format

### Release Versions

Standard semver: `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

### Nightly Versions

Nightly versions are generated dynamically by CI and are **not committed** to `apps/browser/package.json`.

Format: `MAJOR.MINOR.PATCH-nightlyYYYYMMDDcNNN` (e.g. `1.0.1-nightly20260525c001`). The base version is the next patch after the current stable package version. For example, if `apps/browser/package.json` is `1.0.0`, the nightly base is `1.0.1`.

The nightly suffix is a single SemVer prerelease identifier so the version remains compatible with Squirrel.Windows. `YYYYMMDD` is the UTC date and `NNN` is a 3-digit per-day counter. The `c` separator prevents Squirrel.Windows' embedded NuGet parser from reading `YYYYMMDDNNN` as one integer, which overflows Int32.

Example: `1.0.1-nightly20260525c001` is a nightly build for the upcoming 1.0.1 release.

## Release Channels

| Channel | Purpose |
|---------|---------|
| nightly | Scheduled/manual nightly builds from `main` |
| release | Production releases |

There are no other channels. Releases always bump the stable version directly.

## Versioning Commands

### Local Development

```bash
# Bump version and update the changelog
pnpm version:stagewise
pnpm version:karton

# Dry run - preview without making changes
pnpm tsx scripts/release/index.ts --package stagewise --dry-run
```

### CI (GitHub Actions)

Releases are driven by a two-step workflow:

1. **Prepare Release** (manual, `.github/workflows/prepare-release.yml`) — run from the Actions tab and pick the `package` (`stagewise` or `karton`).

   This opens a release PR that bumps the version and updates the changelog.

2. **Auto Release** (automatic, `.github/workflows/auto-release.yml`) — fires when the release PR merges to `main`. It detects which packages need a release (based on tag absence), then invokes the reusable `_Release Browser` or `_Release Karton` workflow to build artifacts and publish.

Nightly releases are separate from the release PR flow. `.github/workflows/nightly-release.yml` runs daily and can be triggered manually. It computes a dynamic nightly version without modifying package.json.

**Prerequisites for release:**

1. Must be on `main` branch
2. CI must have passed for the current commit
3. Must have commits with the package scope since last release

**The workflow will:**

1. Verify CI passed for current commit
2. Check for releasable commits
3. Bump version in package.json
4. Generate/update CHANGELOG.md
5. Commit and tag the release
6. Build artifacts (cross-platform for stagewise)
7. Create GitHub Release (stagewise) or publish to npm (karton)

### Recovery: Failed Release Builds

If a release fails after the version bump (e.g., build fails on one platform):

**Option 1: Retry the release** (recommended)

1. Fix the issue in a new commit
2. Go to **Actions** > **Retry Failed Release**
3. Enter the tag name (e.g., `stagewise@1.0.1`)
4. Click **Run workflow**

This will rebuild and publish without bumping the version again.

**Option 2: Delete tag and re-release**

```bash
# Delete the tag locally and remotely
git tag -d stagewise@1.0.1
git push origin :refs/tags/stagewise@1.0.1

# Revert the version bump commit
git revert HEAD

# Push the revert
git push

# Now you can run the release workflow again
```

**Option 3: Skip the failed version**
Just run another release - it will create the next version (e.g., `1.0.2` instead of retrying `1.0.1`).

## Package-Specific Behavior

### stagewise (Electron App)

- **Source path:** `apps/browser/` (folder name preserved for historical reasons; the package itself is `stagewise`)
- **Distribution:** GitHub Releases with release notes
- **npm:** Not published (desktop app)
- **Tags:** `stagewise@<version>`
- **Commit scope:** `stagewise`

### karton (npm Package)

- **Distribution:** npm registry
- **npm tag:** `latest`
- **Git tags:** `@stagewise/karton@<version>`

## Adding New Packages

To add a new package to the versioning system:

1. Add package config in `scripts/release/config.ts`:

   ```typescript
   {
     name: 'new-package',
     path: 'packages/new-package/package.json',
     scope: 'new-package',
     publishToNpm: true,
     createGithubRelease: false,
     tagPrefix: '@stagewise/new-package@'
   }
   ```

2. Create `CHANGELOG.md` in the package directory

3. Create initial git tag:

   ```bash
   git tag @stagewise/new-package@0.0.1
   git push --tags
   ```

4. Add version scripts to root `package.json` (optional)

5. Update `.github/workflows/release-package.yml` to include the new package in the dropdown

## Custom Release Notes

You can add custom content to a release that won't be derived from commit messages. This is useful for:

- Migration guides
- Detailed feature descriptions
- Links to documentation
- Acknowledgements

### Usage

1. Create a markdown file in `.release-notes/`:

   ```
   .release-notes/stagewise.md   # For browser releases
   .release-notes/karton.md    # For karton releases
   ```

2. Write your custom content:

   ```markdown
   This release includes a major redesign of the navigation system.

   ### Migration Guide

   Update your navigation configuration:
   - Old: `nav.configure({ ... })`
   - New: `nav.setup({ ... })`

   See the [migration docs](https://docs.example.com/migration) for details.
   ```

3. Run the release command - the content will be merged into the changelog
4. The file is automatically deleted after the release

### Example Output

```markdown
## 1.0.1 (2024-01-15)

This release includes a major redesign of the navigation system.

### Migration Guide

Update your navigation configuration:
- Old: `nav.configure({ ... })`
- New: `nav.setup({ ... })`

### Features

* add dark mode support (def5678)
...
```

## Changelog Format

Changelogs are automatically generated from conventional commits and follow this structure:

```markdown
## 1.0.1 (2024-01-15)

### Breaking Changes

* **BREAKING** redesign API interface (abc1234)
  - Migration guide: update all calls to use new signature

### Features

* add dark mode support (def5678)
* implement search functionality (ghi9012)

### Bug Fixes

* resolve memory leak in connection handler (jkl3456)

### Other Changes

* improve performance of data processing (mno7890)
```

## Troubleshooting

### "No commits with scope found"

This error occurs when there are no commits with the specified package scope since the last release. Make sure:

1. Your commits use the correct scope: `feat(stagewise): ...`
2. There are actual changes to release
3. Sub-scopes like `stagewise-ui` need to be changed to `stagewise`
4. The commit actually reached `main`. GitHub's rebase merge drops empty commits, so a `git commit --allow-empty` PR merges without adding anything

### Commitlint rejecting commits

If your commits are being rejected:

1. Check the scope matches a workspace package name exactly
2. Ensure the format is `type(scope): description`
3. Run `pnpm commitlint --from HEAD~1` to test locally
