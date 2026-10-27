# Connections, source identity and relay hosting

[UI](ui.md) · [Architecture](architecture.md) · [OAuth](../reference/oauth.md)

MUST means a requirement. SHOULD means the default unless a concrete task-specific reason justifies an exception. MAY means an option.

This document describes source identity, connection capabilities and their current UI boundary. Core, CLI, AX and storage retain all connection methods.

## Model

Three layers are independent. Each surface MUST present exactly one layer as its subject.

### Control source

A control source is one account, bot, or local client that dispatches work. Two accounts of the same product are two sources. Two products of one vendor are two sources.

| Field | Meaning |
| --- | --- |
| id | Stable ARC source ID. |
| ingressId | The connection that carries it. |
| credential | `oauth-grant` with grant ID and client ID, or `ingress` for non-OAuth ingresses, or `local` for local clients. |
| product | Registry ID from `shared/control-sources.json`, such as claude, chatgpt, gemini, grok, grok-bot. |
| platform | Vendor from the registry, such as anthropic, openai, google, xai. |
| label | User-editable display name. Defaults to the product name plus a disambiguating suffix. |
| createdAt, connectedAt, lastSeenAt | Lifecycle times. |
| state | connected, disconnected, or revoked. |

The credential is the identity anchor. OAuth client names are self-reported and MUST NOT identify a source. Product and label are user-correctable at any time.

The registry gains a `platform` field per product. Display layers MAY aggregate sources by platform. Storage, provenance, and isolation MUST use the source ID.

### Connection

A connection is an ingress: how this computer is reachable. Kinds are Local, Relay link, Dedicated tunnel (Cloudflare, ngrok, Pinggy, LocalXpose, custom proxy), and OpenAI Secure Tunnel. CLI/AX can configure every kind. ARC MUST NOT migrate sources between kinds.

A relay link is one kind regardless of who deployed the relay. Using a relay deployed by this computer and joining a shared relay are the same connection kind. One connection MAY carry many sources.

### Relay hosting

Relay hosting is owner-side infrastructure management: relays this computer deployed, Worker version and updates, the invite link, and member devices. It has no relationship to sources or connections. When this computer uses its own relay, that use is an ordinary Relay link connection, and this computer appears as one member device.

## Identity and provenance

Core owns a source store in the state directory. The UI preference `arc.approved-source-labels` is removed after migration.

- `authenticate` MUST return a principal instead of a boolean. The principal is the grant for OAuth ingresses and the ingress for other auth modes.
- `origin` becomes `{ingressId, sourceId, controlSource, authType}`. `controlSource` is the source's product.
- Notification bindings, governance buckets, respond tokens, dispatch-queue isolation, dispatch receipts, and task origin MUST key by sourceId. ingressId remains for connection diagnostics.
- `limit_wait` and other per-product behavior MUST read the source's product.
- Refresh-token rotation keeps the grant and therefore the source.
- A new grant from repeated DCR creates a pending source. Consent MUST let the owner choose a new source or reauthorize an existing source on the same connection. Reauthorization moves the anchor to the new grant and revokes the old grant. History stays with the source.
- Changing a source's connection is a reauthorization on another connection. The switch flow binds the expected grant to the source before approval, so consent claims it without offering New source. The claim MUST move `ingressId`, keep source ID, label, history, notification bindings and dispatch records, and revoke the old grant only after the new grant is approved.
- Removing a connection marks its sources disconnected and revokes their grants. Source records, labels and history remain, and a later connection switch can reattach them.
- Disconnecting a source revokes its grant. The source record remains as revoked so history keeps its label.
- Non-OAuth connections carry exactly one source.

### Migration

One-time migration runs at Core startup after the state lock.

1. Each existing OAuth grant becomes a source. Product comes from the UI label preference when present, otherwise from the ingress `controlSource` for non-relay ingresses, otherwise from the registry match on client name, otherwise custom.
2. Each non-OAuth ingress becomes one source with the ingress's `controlSource` as product.
3. Labels default to the ingress name for single-source ingresses and to the product name plus connection date otherwise. Add numeric suffixes to colliding migration-generated defaults on the same ingress. Renamed labels are not rewritten; version-1 repair only disambiguates labels that still equal the exact legacy generated default.
4. Existing records with only ingressId map to a source only when that ingress has exactly one source. Others remain unattributed. Provenance MUST NOT be inferred. Drop unattributable subscriptions, governance controls, and respond tokens. Keep unattributed bindings and dispatch history inert; fail active unattributed queue rows with `source-unattributed`.
5. Delete migrated preference keys and obsolete fields. Keep no aliases. Persist the migration version only after notification migration and row decoding succeed. Version 2 repairs incomplete version-1 migrations without regenerating source IDs or overwriting renamed labels. Interrupted steps are safe to re-run. Malformed notification rows are skipped individually without rejecting valid siblings.

### Management surface

Local management adds `source list`, `source update` (label, product), `source disconnect`, and `source claim` for pending reauthorization. `source switch <sourceId> <ingressId>` registers an expected cross-connection claim; `source switch <sourceId> --cancel` cancels it. The CLI mirrors them under `cli source`. Control-source tools stay frozen. Receipts and task reads expose `origin.sourceId` and the source label.

## UI

The [object model](object-model.md) owns placement and the basic-path boundary. SRC and AGENT inspectors belong to the homepage. The dock contains Logs, Connections and Settings, in that order. The former Remote link workspace has no replacement source list.

### Connections

Connections exposes the public relay link and Local connections with state, address copy and start/stop. Connections configured through CLI/AX remain visible as read-only rows with kind, address and state. They have no edit, switch, remove or provider controls. A short link points to the connections guide.

The public link uses a unique owned Cloudflare relay. Multiple owned relays remain read-only until phase 3 supplies an explicit identity; the UI neither picks the first nor deploys another. Core does not yet mark one relay as the canonical public link; phase 3 must define that identity for installations with multiple owned relays. The UI does not migrate existing source bindings.

Add connection, Change connection, provider forms, Secure Tunnel setup, joined-relay management, invite links and member devices have no UI entries. Relay hosting remains a Core, CLI and AX capability. Settings Extras contains experimental features only.

### Placement rule

Creating a source and approving a new pairing request happen in centered dialogs. Existing sources are inspected from homepage side panels. Connections are inspected on the Connections page. Dialog dismissal restores focus and Escape closes one layer.

### Add a control source

The hub left half and Welcome open Add SRC. The transitional flow retains Product, Connection, Configure, Approve and success steps. Its connection step offers only the public link or the selected local client's connection. It never offers custom providers, Secure Tunnel or joining a relay.

When no compatible basic connection exists, `SourceConnectionSetup` supplies the minimum existing setup capability: owned relay deployment with progress, Cloudflare account selection when required, cancellation and retry; or the existing local client installer. It is not a standalone Add connection surface. Completion returns the created ingress ID to Add SRC, which continues to address copy, pairing approval and observed source connection.

Phase 3 removes this nested connection step and the remaining connection selection state, automatically binds remote products to the public link and local clients to Local, and updates user guides. Until then, the existing local installer is retained instead of replacing it with a new setup command flow. This temporary component must not grow alternate methods.

Pairing still displays the code, source name, pending request state and approval actions. Existing reauthorization claims remain supported by the approval adapter, including requests initiated through CLI/AX. OAuth grant-history lists and tool-policy editors are absent. New basic connections grant full tool access; existing Core-configured policy is not rewritten by the UI.

### First run

Welcome waits for a successful source-list read and opens only when there are no non-pending, non-revoked sources and no setup or detail is open. Local and remote product groups open Add SRC. Permission readiness opens Settings System permissions. There is no invite-link entry.
