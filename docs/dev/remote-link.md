# Remote link: sources, connections, and relay hosting

[UI](ui.md) · [Architecture](architecture.md) · [OAuth](../reference/oauth.md)

MUST means a requirement. SHOULD means the default unless a concrete task-specific reason justifies an exception. MAY means an option.

This document defines the target model for how control sources reach ARC and how the Remote link, onboarding, and relay-hosting surfaces present it. Phases at the end define the implementation order.

## Problem

ARC has one first-class object, the ingress. A tunnel ingress was historically treated as one control source. A relay ingress carries many OAuth grants, so the UI treats each relay grant as a source while treating each tunnel ingress as one source. Two identity rules coexist for the same concept.

Task provenance stops at the ingress. `origin` is `{ingressId, controlSource, authType}`. Two accounts of the same product on one ingress share notification bindings, governance buckets, respond-token isolation, dispatch-queue isolation, and dispatch records. `controlSource` is ingress configuration, so a relay ingress reports `shared-relay` instead of the calling product.

The Remote link workspace flattens three unrelated concerns: relay deployment and sharing, per-ingress addresses, and a cross-ingress list of OAuth grants without ownership. Adding a source has four entry paths with different behavior.

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

A connection is an ingress: how this computer is reachable. Kinds are Local, Relay link, Dedicated tunnel (Cloudflare, ngrok, Pinggy, LocalXpose, custom proxy), and OpenAI Secure Tunnel. Users choose freely. ARC MUST NOT migrate sources between kinds.

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
- Disconnecting a source revokes its grant. The source record remains as revoked so history keeps its label.
- Non-OAuth connections carry exactly one source.

### Migration

One-time migration runs at Core startup after the state lock.

1. Each existing OAuth grant becomes a source. Product comes from the UI label preference when present, otherwise from the ingress `controlSource` for non-relay ingresses, otherwise from the registry match on client name, otherwise custom.
2. Each non-OAuth ingress becomes one source with the ingress's `controlSource` as product.
3. Labels default to the ingress name for single-source ingresses and to the product name plus connection date otherwise.
4. Existing records with only ingressId map to a source only when that ingress has exactly one source. Others remain unattributed. Provenance MUST NOT be inferred.
5. Delete migrated preference keys and obsolete fields. Keep no aliases.

### Management surface

Local management adds `source list`, `source update` (label, product), `source disconnect`, and `source claim` for pending reauthorization. The CLI mirrors them under `cli source`. Control-source tools stay frozen. Receipts and task reads expose `origin.sourceId` and the source label.

## UI

### Remote link workspace

The workspace subject is control sources and how each one connects.

- The primary list shows one row per source: product icon, label, connection chip, and state. A persisted toggle groups rows by platform.
- Selecting a source opens its detail: label edit, product correction, connection, connected time, last seen, address copy, and Disconnect.
- A Connections section lists one row per connection: kind, address, health, and the number of sources it carries. Selecting a connection opens its detail: address copy, provider, edit for dedicated tunnels, retry or update for relay links, and Leave for joined relays.
- Pending reauthorizations appear on the affected source row until claimed or dismissed.
- Grants without a source cannot exist after migration. The separate Approved list is removed.
- Relay deployment, sharing, and member devices do not appear in this workspace.

### Add a control source

One flow serves the left center dot, the Remote link workspace, and first-run onboarding.

1. Choose a product.
2. Choose a connection. Existing connections are listed first. New options are Create relay, Paste relay link, Dedicated tunnel, OpenAI Secure Tunnel, and Local when the product supports it.
3. Copy the address and add it in the product's settings.
4. Compare the pairing code and approve. If the connection already carries a source of the same product, the approval asks whether this is a new source or a reauthorization.
5. Optionally edit the label.

Send to Codex and manual custom addresses belong to step 2 as advanced options.

### Homepage

Each source is one node, including multiple sources on one connection. Grouping by platform MAY be added later as a display option. Recent dispatches in a source panel filter by sourceId.

### First run

Welcome contains Codex login readiness, permissions readiness, and Add your first control source, which opens the shared flow.

### Settings: Extras

Settings shows one entry row for Extras. Extras opens its own workspace page for features outside ARC's core loop. It contains Relay hosting and Experimental topology controls.

Relay hosting lists relays this computer deployed. Each relay shows state, Worker version with Update when outdated, Delete, the invite link with Copy and Reset, and member devices with joined time, last seen, and Remove. This computer is marked and cannot be removed from its own relay.

## Phases

- P0: source store, principal-returning authentication, `origin.sourceId`, keying changes, reauthorization claim at consent, migration, management API, and CLI. Accept through CLI and a real remote OAuth call on two sources sharing one ingress.
- P1: Remote link workspace, shared Add flow, source and connection details, and one homepage node per source.
- P2: Settings Extras with Relay hosting and Experimental controls, trimmed Welcome, and synchronized user documentation.

## Limits

Source identity covers OAuth grants, non-OAuth ingresses, and local clients. Two clients sharing one Bearer token or one OpenAI Secure Tunnel are one source. Platform aggregation is a display grouping and never an isolation boundary.
