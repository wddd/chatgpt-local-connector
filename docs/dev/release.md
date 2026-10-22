# Release maintenance

[Development](development.md) · [Installation](../installation.md)

Public source and artifacts live in whzxc/agent-remote-control. Git tags define formal versions. GitHub Releases holds installers, updater archives, latest.json, Homebrew Cask, and checksums. No public npm package is published. Commit/push as needed for the task while respecting explicit restrictions. Tags, uploads, and public Releases require user authorization.

## Build and signing prerequisites

Default releases cover all platforms. Build macOS locally on Apple Silicon. release.yml builds Windows and Linux x86_64/aarch64. Local macOS requires Node.js 24.12+, Rust, full Xcode 26+, uv, npm dependencies, and authenticated gh. Windows/Linux-only releases need no macOS signing environment.

Updater Minisign keys MUST match desktop/tauri.conf.json's public key. Lookup order:

1. TAURI_SIGNING_PRIVATE_KEY: key contents or an existing file path.
2. TAURI_SIGNING_PRIVATE_KEY_FILE: an existing key file.
3. ~/.tauri/agent-remote-control.key.

Encrypted keys also use TAURI_SIGNING_PRIVATE_KEY_PASSWORD. Keys stay outside the repository. Scripts only read them and never generate, move, or print them. Ordinary desktop:build may omit updater signing. Releases and dry runs containing mac require it.

Packaged macOS builds, including debug desktop:build, release, dry-run, and release:stage, use the repository's fixed self-signed identity from tooling/macos-signing.mjs. APPLE_SIGNING_IDENTITY is optional but may only select that identity or its fingerprint. Selection uses the fingerprint. Missing certificate/private key, ad-hoc selection, or another identity fails immediately without choosing a company Team. Package checks validate Desktop/Core/screen-helper certificates and identifiers. stage rejects other identities.

Private keys remain in the build machine's keychain. Another build machine MUST securely import the same certificate and private key. A regenerated same-name certificate does not preserve authorization identity. Packages enable hardened runtime without Apple notarization or timestamping and clear unrelated APPLE_* credentials from child environments. Self-signing is not Developer ID or notarization. First launch may be blocked by Gatekeeper as described in Installation. npm run dev/build retain separate explicit APPLE_SIGNING_IDENTITY configuration and default to ad-hoc.

macOS packages are built and signed locally. Do not export the certificate/private key to GitHub Secrets. release.yml builds Windows/Linux only. Windows updater signing uses TAURI_SIGNING_PRIVATE_KEY and, if encrypted, its password. Updater Minisign and macOS code-signing identities are independent.

Bundle identifiers are com.whzxc.agent-remote-control for production App, .dev for development, .core for Core, and .screen for the Swift helper. Recheck system permissions after identity changes. Updater signatures do not establish system code-signing identity.

## Local checks and build

```sh
npm run check
npm run check:format
npm test
npm run desktop:build
npm run check:package
```

Run npm run cache:prune after direct Cargo builds/tests. Artifacts stay in build directories. Building does not replace the installed App. Check embedded versions, signatures, icons, absence of Node/npm runtime, and updater verification. Report platform acceptance separately. macOS success does not prove Windows/Linux runtime behavior.

## Release commands

After authorization, use a clean main branch that is not behind its remote:

```sh
npm run release
# When the corresponding checks already passed:
npm run release -- --skip-tests
# Explicit version:
npm run release -- --version X.Y.Z
# macOS only, without CI:
npm run release -- --platforms mac
# macOS and Linux, skipping Windows CI:
npm run release -- --platforms mac,linux
# CI platforms only:
npm run release -- --platforms windows,linux
```

The flow checks signing, workspace, branch, and gh permissions, fetches remote main/tags, selects a version after the previous public release, and builds the current feature commit. npm test runs by default. ARC_BUILD_VERSION injects the version into frontend, Core, Desktop, and installer. Source placeholders remain 0.0.0.

A unique release-artifacts/v<version>-<suffix> directory holds artifacts, latest.json, release-notes.md, Cask, and SHA256SUMS.txt. Notes derive from the previous formal ancestor tag through the current commit. With mac selected, local build/signature checks precede tagging and an atomic main/tag push. --platforms defaults to mac,windows,linux and accepts a nonduplicated comma-separated subset. Windows/Linux selections trigger release.yml for that tag using only selected jobs. mac-only releases never trigger CI. CI never creates or publishes Releases. The local flow waits for the matching SHA's selected CI jobs, downloads selected artifacts, computes checksums, uploads a draft with gh, and publishes it.

latest.json includes only this build's macOS/Windows updater entries. It never reuses unselected platforms or versions. Linux packages and installer scripts are separate assets outside Tauri updater platforms. Linux-only manifests have empty platforms. Cask is generated only with mac. Partial-platform publication still uses a new version without appending to existing public releases. Unpublished platforms stay on their prior version. Desktop treats a missing platform in the latest manifest as no update. Linux installation selects the latest formal release containing the current architecture's tarball.

CI/upload failure stops the flow while preserving local artifacts and pushed tags. Inspect the failure before recovery. Do not automatically retrigger or publish incomplete platform sets. Existing tags MUST identify the same source. Draft artifacts may be completed at the same version. Public versions cannot be overwritten. Source changes require a new version. Do not create version-only commits or a source CHANGELOG.

## Dry runs and stages

```sh
npm run release -- --dry-run
```

A dry run builds macOS and generates local release files without Windows/Linux CI, commit, tag, push, upload, or automatic tests. It MUST include mac. Other selected platforms do not participate. It still requires the updater key and fixed macOS self-signed identity. No Apple notarization runs. Links use the chosen version. Formal publication requires rebuilding for its target version.

stage/finalize organize and verify existing artifacts. finalize builds the current manifest from platform fragments and Linux packages in the same directory without merging old manifests. tooling/release.mjs owns parameters. Complete selected artifacts before publishing the manifest. Download URLs, manifest URLs, signatures, and embedded versions MUST agree.

## Identity migration

The first release from a legacy identity to ARC checks the prior public tag's state-directory definitions and adds one-time manual migration commands to release notes. Later ARC-to-ARC releases omit them. Product and installer do not migrate identities automatically or add compatibility aliases.

Instructions require disabling old login startup and quitting the App before moving production, development, preview, and XDG state. Maintainers also move updater keys. Install the new App afterward. Never overwrite existing destination directories. Windows users move corresponding LOCALAPPDATA directories, remove old login entries, and enable new ones. macOS users reauthorize Screen Recording, Accessibility, Full Disk Access, and login items as prompted.

After cross-identity updates, read connection and permission state from the new installation. macOS/Windows installer registration, executable names, and bundle identities use the new name. Users handle old installations according to release notes.

Prefer archives for old macOS App backups to avoid discoverable duplicate .app identities. If an unpacked copy is necessary, inspect and unregister its LaunchServices entry and register the current installation. Do not delete backups or edit TCC grants. If system toggles disagree with helper preflight, inspect the granted bundle ID and system-log request/writer identities. Never override preflight with old grants. Fully quit System Settings. Only restart the authorization-prompt process when logs prove stale identity retention. The user then authorizes and readback verifies. Ordinary same-identity updates do not use this cleanup.

## Readback

Verify tag/source SHA, workflows, public assets, checksums, updater signatures, latest.json, and embedded versions. Within authorization, verify installed startup, connections, real client tools, and tasks. Source builds, public artifacts, and installed apps are separate evidence layers. State untested layers explicitly. Keep personal paths, accounts, secrets, Tunnel identities, real tasks, and acceptance records outside the repository.

The first migration to guide/query/act requires a one-time client refresh and reauthorization notice. Later capability changes use ops and guide.
