# Electron Auto-Update server

Build a auto-update / download server that responds to certain request paths with a specified format. The server should be a simple node.js + express app inside this folder that includes a simple Dockerfile that makes deploying of this app possible.

## App configuration

- The app should be fully configurable through env vars

## Functionality

- The server acts as a update file URL feed for auto-updates of our app as well as links for first-time downloaders.
  - The app name should be configurable with an env var (`APP_NAME`).
  - The app is released and files are hosted in a github repo. Make this configurable as well (`APP_GITHUB_ORG` and `APP_GITHUB_REPO`)
- The server offers multiple update channels:
  - Release updates (returns only stable versions) under channel `release`
  - Pre-Release updates (returns newest versions, including pre-release)
    - Alpha channel (returns the latest pre-release, including pre-releases with alpha and beta version suffix) under channel `alpha`
    - Beta channel (returns the latest pre-release, including pre-releases with beta version suffix, but no alpha versions) under channel `beta`.
  - The channel param in URLs can be `release`, `beta` or `alpha`.
- The releases that are available should be fetched from github releases of the repository. Always fetch all releases (including pre-releases) that begin with the configured app name (like `${APP_NAME}@1.0.0-beta.1`) and ignore other releases.
  - The release assets include all the files that are needed in order to generate all responses.
  - The list of releases should be fetched once on start and then every 15 minutes again. Cache the fetched list until a refresh from github releases happens.
  - If a release doesn't include the needed files that are needed to serve the update/download for the requested platform and arch, the server should respond with an older release. If there is no older release that matches the requirements, the server should respond different (according to endpoint spec).
- The server should offer an update endpoint for macOS that is hosted under the URL `/update/${APP_NAME}/${CHANNEL}/macos/${ARCH}/${VERSION}`
  - The response structure and request/response headers are explained below.
- The server should offer an update endpoint for windows that is hosted under the URL `/update/${APP_NAME}/${CHANNEL}/win/${ARCH}/${VERSION}/RELEASES`
  - The response structure and request/respons eheaders are explained below.
- The server should offer a download endpoint for macOS, windows, debian-linux and rpm-linux under the following endpoints:
  - These endpoints should simply (temporary) redirect to the given URL of the github release asset.
  - If there is no matching release, the endpoints should return 404.
  - macOS: `/download/${APP_NAME}/${CHANNEL}/macos/${ARCH}`
  - Windows: `/download/${APP_NAME}/${CHANNEL}/win/${ARCH}`
  - Linux(deb): `/download/${APP_NAME}/${CHANNEL}/linux/deb/${ARCH}`
  - Linux(rpm): `/download/${APP_NAME}/${CHANNEL}/linux/rpm/${ARCH}`

## App release format

The versioning of the app is in semver with optional suffixes for pre-release versions. Examples: `1.2.3`, `1.1.0-alpha.2`, `2.2.0-beta.5`.

Release versions don't have suffixes, pre-releases always have a suffix with either "alpha" or "beta".

Beta versions are newer than Alpha versions if the semver version is equal.

## GitHub releases file format

Every release of the app that the update server should offer a feed SHOULD (but may not, or only partially) offer the following files in the release:

- `RELEASES-win32-${ARCH}`: Plaintext file(s) including hash, relative file path and timestamp for the windows update file located in the release
- `${APP_NAME}${?-prerelease?}-${VERSION}-${ARCH}-setup.exe`: A win32 setup file for the given release version and architecture.
- `${APP_NAME}${?-prerelease?}-${VERSION}-${ARCH}-full.nupkg`: A win32 update file for the given release version and architecture. This is the file that is linked to within the `RELEASES*` files.
- `${APP_NAME}${?-prerelease?}-${VERSION}-${ARCH}.dmg`: A macos download file for the version and arch as DMG. This is what should be offered to users that want to download the app for macos.
- `${APP_NAME}${?-prerelease?}-darwin-${ARCH}-${VERSION}.zip`: A macos file for the version and arch as ZIP. This is what should be offered to users that want to update the app for macos.
- `${APP_NAME}${?-prerelease?}_${VERSION}_${ARCH}.deb`: A debian package file for the version and arch. This is what should be offered to users that want to download the app for linux with debian package handling. (Notice that debian package uses underscores to split name, version and arch.)
- `${APP_NAME}${?-prerelease?}-${VERSION}-${ARCH}.rpm`: A rpm package file for the version and arch. This is what should be offered to users that want to download the app for linux with rpm package handling.

Note that release files may either start with `${APP_NAME}` or `${APP_NAME}-prerelease` depending on if it's a release or a pre-release build. Ignore these and be compatible with both, as the version also signifies the channel of the release. It could also be that the suffix may change so a general handling for this would be nice.

## macOS update endpoint handling

The update endpoint for macOS should offer the latest update for the given arch, channel and version. If there is no release at all available for the given arch, respond with HTTP code 204 (No content).

- If the channel is alpha, offer the latest beta or alpha pre-release. Don't offer production releases for this channel.
- If the channel is beta, only offer the latest beta pre-release.
- If the channel is release, only offer the latest release.
- The request will most likely include the request header set to type `application/json`. Always set the response header to `application/json` unless nothing is available (then it's plaintext).
- If the latest release is equal to or lower than the user-given version, the server should also respond with 204 (No content). Make sure that versions are properly compared, including the beta and alpha release.

The update response should look like this:

```
{
 "url": "https://mycompany.example.com/myapp/releases/myrelease",
 "name": "My Release Name",
 "notes": "Theses are some release notes innit",
 "pub_date": "2013-09-18T12:29:53+01:00"
}
```

- `url`: A link for direct download of the update zip for macOS and given arch on github releases.
- `name`: The version of the release (like "1.0.0-alpha.1")
- `notes`: The release notes of the release (max. first 512 chracters)
- `pub_date`: The timestamp of the release (formatted like in the example)

## Windows update endpoint handling

The update endpoint for Windows should offer the latest update for the given arch, channel and version. If there is no release at all available for the given arch, respond with an rempty response.

- If the channel is alpha, offer the latest beta or alpha pre-release. Don't offer production releases for this channel.
- If the channel is beta, only offer the latest beta pre-release.
- If the channel is release, only offer the latest release.
- Always set the response header datatype to plaintext.
- If the latest release is equal to or lower than the user-given version, the server should also respond with an empty response. Make sure that versions are properly compared, including the beta and alpha release.

The update response should look like this:

```
HASH FILE_URL SIZE
```

- `HASH`: The hash of the nupkg update file. This hash is included in the GitHub releases provided "RELEASE*" file for the given arch. Keep it as is.
- `FILE_URL`: The URL to the update file. The GitHub releases povided "RELEASE*" files will only include the filename. Replace with full path to the nupkg artifact asset of the given release.
- `SIZE`: Size of the update file. Keep it as is from the "RELEAES*" file.
