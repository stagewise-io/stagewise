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

- `browser` - The browser app (apps/browser)
- `karton` - The karton package (packages/karton)
- `website` - The website (apps/website)
- `stage-ui` - Stage UI components (packages/stage-ui)

**Important:** Sub-scopes like `browser-ui` are NOT valid. Use the parent package scope.

### Examples

```bash
# Good
feat(browser): add dark mode toggle
fix(karton): resolve connection timeout issue
docs(browser): update installation guide

# Bad - will be rejected
feat(browser-ui): add button component  # Sub-scope not allowed
feat: add new feature                    # Missing scope
```

### Breaking Changes

Add `BREAKING CHANGE:` in the commit footer or `!` after the type:

```
feat(browser)!: redesign navigation

BREAKING CHANGE: Navigation API has changed. Update your code accordingly.
```

## Version Format

### Release Versions

Standard semver: `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

### Prerelease Versions

Format: `MAJOR.MINOR.PATCH-<channel>.<number>`

Examples:

- `1.0.1-alpha.1` - First alpha for upcoming 1.0.1
- `1.0.1-alpha.2` - Second alpha
- `1.0.1-beta.1` - First beta (after alpha phase)
- `1.0.1` - Final release

### Version Transitions

| Current | Target Channel | New Version |
|---------|----------------|-------------|
| `1.0.0` | alpha | `1.0.1-alpha.1` (bump applied) |
| `1.0.1-alpha.1` | alpha | `1.0.1-alpha.2` |
| `1.0.1-alpha.5` | beta | `1.0.1-beta.1` |
| `1.0.1-beta.3` | release | `1.0.1` |
| `1.0.1` | beta | `1.0.2-beta.1` (bump applied) |

## Release Channels

| Channel | npm Tag | Purpose |
|---------|---------|---------|
| alpha | `alpha` | Early testing, unstable |
| beta | `beta` | Feature complete, testing |
| release | `latest` | Production ready |

## Versioning Commands

### Local Development

```bash
# Interactive mode - prompts for channel selection
pnpm version:browser
pnpm version:karton

# Direct channel specification
pnpm version:browser:alpha
pnpm version:browser:beta
pnpm version:browser:release

pnpm version:karton:alpha
pnpm version:karton:beta
pnpm version:karton:release

# Dry run - preview without making changes
pnpm tsx scripts/release/index.ts --package browser --dry-run

# Abandon current prerelease and start new version cycle
pnpm tsx scripts/release/index.ts --package browser --channel alpha --new-cycle
```

### CI (GitHub Actions)

Release workflows are available in the Actions tab. Each package has separate workflows for each channel:

**Browser:**

- `Release Browser: Alpha` - Release alpha version
- `Release Browser: Beta` - Release beta version
- `Release Browser: Production` - Release stable version
- `Release Browser: Alpha (New Cycle)` - Abandon prerelease, start new alpha

**Karton:**

- `Release Karton: Alpha` - Release alpha version
- `Release Karton: Beta` - Release beta version
- `Release Karton: Production` - Release stable version
- `Release Karton: Alpha (New Cycle)` - Abandon prerelease, start new alpha

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
6. Build artifacts (cross-platform for browser)
7. Create GitHub Release (browser) or publish to npm (karton)

### Recovery: Failed Release Builds

If a release fails after the version bump (e.g., build fails on one platform):

**Option 1: Retry the release** (recommended)

1. Fix the issue in a new commit
2. Go to **Actions** > **Retry Failed Release**
3. Enter the tag name (e.g., `browser@1.0.0-alpha.1`)
4. Click **Run workflow**

This will rebuild and publish without bumping the version again.

**Option 2: Delete tag and re-release**

```bash
# Delete the tag locally and remotely
git tag -d browser@1.0.0-alpha.1
git push origin :refs/tags/browser@1.0.0-alpha.1

# Revert the version bump commit
git revert HEAD

# Push the revert
git push

# Now you can run the release workflow again
```

**Option 3: Skip the failed version**
Just run another release - it will create the next version (e.g., `alpha.2` instead of retrying `alpha.1`).

## Package-Specific Behavior

### browser (Electron App)

- **Distribution:** GitHub Releases with release notes
- **npm:** Not published (desktop app)
- **Tags:** `browser@<version>`

### karton (npm Package)

- **Distribution:** npm registry
- **npm tags:** `alpha`, `beta`, or `latest`
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

When promoting from beta to release, prerelease changelog entries are consolidated into a single release entry.

## Troubleshooting

### "No commits with scope found"

This error occurs when there are no commits with the specified package scope since the last release. Make sure:

1. Your commits use the correct scope: `feat(browser): ...`
2. There are actual changes to release
3. Sub-scopes like `browser-ui` need to be changed to `browser`

### "Cannot downgrade channel"

You cannot go from `beta` back to `alpha` for the same base version. The progression must be:
`alpha` → `beta` → `release`

If you need to add new features during beta, use `--new-cycle` to abandon the current prerelease and start fresh:

```bash
# Current: 1.0.1-beta.1, want to start fresh alpha
pnpm version:browser --channel alpha --new-cycle

# Result: 1.1.0-alpha.1 (or 1.0.2-alpha.1 depending on commit types)
```

This abandons the `1.0.1` release cycle entirely and starts a new version.

### Commitlint rejecting commits

If your commits are being rejected:

1. Check the scope matches a workspace package name exactly
2. Ensure the format is `type(scope): description`
3. Run `pnpm commitlint --from HEAD~1` to test locally
