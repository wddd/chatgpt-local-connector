# Release maintenance

[Development](development.md) · [Installation](../installation.md)

Public source and artifacts live in whzxc/agent-remote-control. Git tags define formal versions. GitHub Releases holds installers, updater archives, latest.json, Homebrew Cask, and checksums. No public npm package is published. Commit/push as needed for the task while respecting explicit restrictions. Tags, uploads, and public Releases require user authorization.

## Build and signing prerequisites

Default releases cover all platforms. Build macOS locally on Apple Silicon. The on-demand Windows worker builds x64 NSIS installers. release.yml builds Linux x86_64/aarch64 only. Local macOS requires Node.js 24.12+, Rust, full Xcode 26+, uv, npm dependencies, and authenticated gh. Any release containing Windows requires the Mac coordinator and updater key. Linux-only releases need no signing environment.

Updater Minisign keys MUST match desktop/tauri.conf.json's public key. Lookup order:

1. TAURI_SIGNING_PRIVATE_KEY: key contents or an existing file path.
2. TAURI_SIGNING_PRIVATE_KEY_FILE: an existing key file.
3. ~/.tauri/agent-remote-control.key.

Encrypted keys also use TAURI_SIGNING_PRIVATE_KEY_PASSWORD. Keys stay outside the repository. Scripts only read them and never generate, move, or print them. Ordinary desktop:build may omit updater signing. Releases and dry runs containing mac or windows require it on the Mac coordinator.

Packaged macOS builds, including debug desktop:build, release, dry-run, and release:stage, use the repository's fixed self-signed identity from tooling/macos-signing.mjs. APPLE_SIGNING_IDENTITY is optional but may only select that identity or its fingerprint. Selection uses the fingerprint. Missing certificate/private key, ad-hoc selection, or another identity fails immediately without choosing a company Team. Package checks validate Desktop/Core/screen-helper certificates and identifiers. stage rejects other identities.

Private keys remain in the build machine's keychain. Another build machine MUST securely import the same certificate and private key. A regenerated same-name certificate does not preserve authorization identity. Packages enable hardened runtime without Apple notarization or timestamping and clear unrelated APPLE_* credentials from child environments. Self-signing is not Developer ID or notarization. First launch may be blocked by Gatekeeper as described in Installation. npm run dev/build retain separate explicit APPLE_SIGNING_IDENTITY configuration and default to ad-hoc.

macOS packages are built and signed locally. Do not export the certificate/private key to GitHub Secrets. The Windows worker does not hold updater keys, code-signing certificates, or upload credentials. The previous CI installer step only created updater Minisign signatures; it did not perform Authenticode signing. The Mac signs the collected Windows EXE using TAURI_SIGNING_PRIVATE_KEY and, if encrypted, its password. Updater Minisign and macOS code-signing identities are independent.

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
# macOS and Linux:
npm run release -- --platforms mac,linux
# Windows worker and Linux CI:
npm run release -- --platforms windows,linux
# Continue a failed publication using its verified local artifacts:
npm run release -- --resume release-artifacts/vX.Y.Z-<suffix>
```

The flow checks signing, workspace, branch, and gh permissions, fetches remote main/tags, selects a version after the previous public release, and builds the current feature commit. npm test runs by default. ARC_BUILD_VERSION injects the version into frontend, Core, Desktop, and installer. Source placeholders remain 0.0.0.

A unique release-artifacts/v<version>-<suffix> directory holds artifacts, platform receipts, latest.json, release-notes.md, Cask, and SHA256SUMS.txt. Notes derive from the previous formal ancestor tag through the current commit. --platforms defaults to mac,windows,linux and accepts a nonduplicated comma-separated subset.

After checks and tests, the coordinator freezes the full source SHA and atomically pushes main and the release tag. macOS builds/signs in a clean ordinary local clone, Windows builds on the exclusive worker, and Linux runs on GitHub Actions concurrently. All tasks settle before any error is returned; successful artifacts are retained. The Linux workflow accepts source_sha and version without requiring a tag, checks the full checkout SHA, and never creates Releases. The coordinator matches the workflow run's head SHA and downloads both Linux architectures. Verification, draft upload, --resume, publish, and public readback retain their existing boundaries.

Windows worker connections and the SCNet checkout come from the installed Enjoy profile returned by enjoy runtime. Before acquiring the worker, the coordinator checks SCNet source locks and requires both workers to be stopped and unowned. A busy or already-running worker is preserved and reported, never taken over. Start/inspect/stop use enjoy infra execute with proxmox.worker operations, target k12, a unique owner, and --fresh. Poll inspect until both ssh_reachable and ready are true before any Windows SSH. Check SCNet guest locks and build processes again before building. Shutdown is allowed only when this invocation started the worker and still owns it; ambiguous start responses require ownership readback before cleanup.

Transfer a Git bundle of the frozen commit into the dedicated ordinary worker checkout. Refuse a dirty checkout, fetch and detach at the exact full SHA, run npm ci, and retain the checkout's target directory and Cargo cache between runs. Remove stale installer outputs only. Windows builds with --unsigned-updater, rejects signing secrets, checks the x64 PE and embedded Core version, and returns the EXE plus windows-receipt.json (version, sourceSha, arch, filename, SHA-256). The Mac validates the receipt and downloaded hash, signs the EXE locally, and verifies both updater signatures against the embedded public key during finalize. macOS uses a separate persistent ordinary clone under release-artifacts/.macos-source, also detached at the same SHA. Neither build modifies the original working tree or installs the app.

latest.json includes only this build's macOS/Windows updater entries. It never reuses unselected platforms or versions. Linux packages and installer scripts are separate assets outside Tauri updater platforms. Linux-only manifests have empty platforms. Cask is generated only with mac. Partial-platform publication still uses a new version without appending to existing public releases. Unpublished platforms stay on their prior version. Desktop treats a missing platform in the latest manifest as no update. Linux installation selects the latest formal release containing the current architecture's tarball.

CI/upload failure stops the flow while preserving local artifacts and pushed tags. Do not automatically retrigger CI or publish incomplete platform sets. Existing tags MUST identify the same source. Public versions cannot be overwritten. Source changes require a new version. Do not create version-only commits or a source CHANGELOG.

## Resume publication

After local verification succeeds, release-state.json records the version, source commit, selected platforms, and every upload's size and SHA-256 digest. Keep this file with the original artifacts. On an upload, remote-verification, publish, or readback failure, the script prints the exact resume command:

```sh
npm run release -- --resume release-artifacts/vX.Y.Z-<suffix>
```

Resume requires a clean main checkout at the original source commit and its matching release tag. Version and platforms come from the checkpoint; explicit --version or --platforms values must match it. It checks the original files and complete platform inventory again. It skips tests, builds, signing, tagging, pushing, and CI. No macOS private signing keys are needed for this path. It does not regenerate metadata or change artifact bytes. --resume cannot be combined with --dry-run.

The script queries the exact release tag and reuses its draft, or creates the draft if the initial create request never succeeded. GitHub's tag endpoint omits drafts, so a 404 triggers bounded, filtered release-list pages followed by a lookup by release ID. Ambiguous matching drafts stop publication. Assets upload individually with at most three transfers in flight. Each transfer has a ten-minute timeout and four attempts with 2/4/8-second backoff. gh transfers set GODEBUG=http2client=0. A matching uploaded size and, when available, GitHub digest skips the transfer. A mismatched draft asset is replaced. Remote verification requires the exact expected asset inventory and sizes, then checks GitHub SHA-256 digests or downloads and hashes assets whose digest is unavailable. Publication only follows successful verification.

The checkpoint records the draft ID and publish intent before publishing. If publication succeeded but its response or public readback failed, resume verifies that same public release and retries public latest.json readback without mutating it. Other public releases are rejected. Readback compares the public latest.json bytes with the local digest and size. A different release becoming latest causes readback to fail instead of changing public history.

Resume starts at the publication boundary. It requires release-state.json from a completed verification; dry runs, older artifact directories without a checkpoint, and interrupted builds or CI downloads cannot be resumed this way. Resolve build/CI failures before starting another release. Never manufacture or edit a verification checkpoint to bypass source or integrity checks.

## Stage timings

Each stage prints START/END, status, seconds, and timestamped JSONL records. Platform wall stages include checkout/dependencies, worker startup, compilation, staging, collection/signing, and cleanup. The platform critical path measures the concurrent group rather than adding platform times. The final overall wall time includes checks, tests, tagging, the parallel group, verification, upload, publish, and readback. Nested stages overlap and MUST NOT be summed. Windows returns windows-stages.jsonl with frontend, Core, Desktop, and dependency timings. macOS records its component stages in the coordinator's timing file.

Every run prints its timing table and release-artifacts/.timings-<suffix>/stages.jsonl path, including failures. Timings and receipts are local metadata and are not release uploads. Resume retains verified artifacts and skips build/worker/CI work.

## Non-publishing rehearsal

```sh
npm run release -- --dry-run --version X.Y.Z --platforms mac,windows
```

Run twice at the same clean committed HEAD and version to compare cold and warm persistent caches. A dry run actually builds the selected desktop platforms in parallel, collects their artifacts and receipts, signs Windows on the Mac, verifies updater signatures, and generates local checksums and metadata. It never tests automatically, creates tags/drafts/releases, pushes, uploads, or replaces the installed app. It writes no resumable publication checkpoint. The worker lifecycle rules remain identical. Temporary source bundles and staging folders stay under release-artifacts/; ordinary source clones and compilation caches persist for the next run.

Dry runs skip Linux CI because CI artifact uploads are outside the no-upload boundary. For an explicitly authorized Linux build-only rehearsal, the source_sha/version workflow can build a pushed commit without tags or releases; its artifact upload still requires authorization. If that workflow is not available at the frozen commit on the remote, skip it and report the latest measured Linux job time separately. Never substitute older Linux bytes into the rehearsal's verified artifact set.

stage/finalize organize and verify existing artifacts. finalize builds the manifest from platform fragments and Linux packages in the same directory. Complete all selected artifacts before publication; download URLs, signatures, checksums, and embedded versions MUST agree.

## Identity migration

The first release from a legacy identity to ARC checks the prior public tag's state-directory definitions and adds one-time manual migration commands to release notes. Later ARC-to-ARC releases omit them. Product and installer do not migrate identities automatically or add compatibility aliases.

Instructions require disabling old login startup and quitting the App before moving production, development, preview, and XDG state. Maintainers also move updater keys. Install the new App afterward. Never overwrite existing destination directories. Windows users move corresponding LOCALAPPDATA directories, remove old login entries, and enable new ones. macOS users reauthorize Screen Recording, Accessibility, Full Disk Access, and login items as prompted.

After cross-identity updates, read connection and permission state from the new installation. macOS/Windows installer registration, executable names, and bundle identities use the new name. Users handle old installations according to release notes.

Prefer archives for old macOS App backups to avoid discoverable duplicate .app identities. If an unpacked copy is necessary, inspect and unregister its LaunchServices entry and register the current installation. Do not delete backups or edit TCC grants. If system toggles disagree with helper preflight, inspect the granted bundle ID and system-log request/writer identities. Never override preflight with old grants. Fully quit System Settings. Only restart the authorization-prompt process when logs prove stale identity retention. The user then authorizes and readback verifies. Ordinary same-identity updates do not use this cleanup.

## Readback

Verify tag/source SHA, workflows, public assets, checksums, updater signatures, latest.json, and embedded versions. Within authorization, verify installed startup, connections, real client tools, and tasks. Source builds, public artifacts, and installed apps are separate evidence layers. State untested layers explicitly. Keep personal paths, accounts, secrets, Tunnel identities, real tasks, and acceptance records outside the repository.

The first migration to guide/query/act requires a one-time client refresh and reauthorization notice. Later capability changes use ops and guide.
