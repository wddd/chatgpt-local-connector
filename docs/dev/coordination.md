# Coordination journal

MUST means a requirement. SHOULD means the default unless a concrete task-specific
reason justifies an exception. MAY means an option.

The `coordination` module owns the instance-local metadata journal and `events`
query. `guide`, `query`, `act`, and `notification` retain their frozen envelopes.
AX source writes use the owner store below. Resource push remains a later phase.

## Producer interface

Call `crate::coordination::emit(EventInput)` from an internal owner. Construct
`EventInput::new(transition_id, EventKind, resources)` and set only typed metadata.
The return is `{eventId, sequence, duplicate}` after a synced append. The input
has no free-form summary, title, prompt, output or error fields. Summaries come
from fixed templates. `Principal::from_origin` accepts server-captured origin;
null stays unknown and explicit local origin maps to built-in local authority.
Use `Principal::Arc` for evidenced internal ARC activity. Do not infer a source
from an account, label or current task. Account IDs are attribution only.

The owner MUST durably persist its transition and pending descriptor first.
The owner MUST release its lock before calling emit.
The owner MUST checkpoint successful projection afterwards.
The owner MUST retain the same transition ID and payload for retries.
The owner MUST keep older producer checkpoints beyond journal retention.

Replay deduplicates retained transitions, including across restart. A different
payload under the same transition ID fails with `COORDINATION_TRANSITION_CONFLICT`.
Dedupe memory is bounded by retained history; producer checkpoints prevent replay
of transitions already evicted from the feed. A failed observation never changes
a successful dispatch or Git result. Retain it for bounded reconciliation.

`Resources` projects registered project IDs and associated lanes without storing
a second registry. Add registered projects before lanes. `ResourceKey::lane`
returns the qualified key, so later duplicate names cannot change historical
identity. Resolve shorthand through `Resources::resolve` against a current
registered projection; query shorthand resolves against retained event resources.
No key contains a path, account name or actual hostname. `host:<id>` receives an
opaque instance-local ID supplied by its owning observer, never device_name().

## Persistence and locks

One Core owns `root()/coordination/events` under the existing state-directory
lock. Acquire/release the source authorization snapshot first, then the journal
mutex. No owner, notification, network, Git or discovery lock/work runs inside the
journal mutex. Account stores are never read per event. Reads use an in-memory
sequence index; a poll ranges from its cursor. Only startup enumerates files and
rebuilds the bounded index. Retention deletes known segment paths directly.

The manifest stores epoch, cursor signing material, next allocated sequence,
retention floor, ordered segment IDs and bounded coverage counters. Reserve a
sequence durably before append; append and sync the record before success. Never
reuse a reserved sequence after a crash. Atomic metadata writes use a fixed
private temporary file and sync before rename. Unix also syncs the parent
directory; Windows uses the existing private-directory ACL and rename boundary.
A restore/reset requires a new journal epoch; missing/corrupt metadata beside
existing segments requires explicit local recovery, never automatic reset.

Segments are append-only until retention unlinks them. Retention persists the
floor/list before deletion, so restart finishes an interrupted deletion. A partial
final record is copied to one bounded private quarantine before truncation. Failed
quarantine leaves the original readable bytes untouched and fails the read. A
failed append invalidates the in-memory store before any further operation. The
next access recovers the tail. Reserved holes and rate drops are partial coverage.
Malformed interior records fail closed for local recovery.

Limits are seven days, 20,000 events, 16 MiB total, 256 KiB/segment and 2 KiB per
stored record and public projection. Four segment budgets within 16 MiB reserve
space for metadata, its atomic temporary, quarantine and quarantine temporary. Retention
removes complete oldest segments, which can evict adjacent newer rows early.
The memory index, transition map, resource counts and pull buckets are bounded.
No background queue is introduced. Producer overflow returns an error and a
persisted dropped counter; owners remain responsible for pending reconciliation.

Cursor scope binds source authority revision and canonical filters, not account
membership or labels. A high-water mark stabilizes each pagination cycle; the
next completed cursor polls newer observations. Cursor expiry returns a failed
result with an explicit gap and reset query. Retention does not reset sequences.
Public query errors carry actionable `next`; normal transport adds `arcVersion`.

## AX owner store

`coordination::ax` owns report/list/candidate/triage and explicit local import/export.
CLI migration forwards to Core; the state-directory lock remains the single writer.
Read source authorization and compact reference evidence before AX locking. Acquire
shared request-ID locks before AX mutation, never owner/discovery/journal locks
inside AX. Reserve the root receipt namespace, persist the request ID and pending
event with the owner record, release AX, emit by stable revision, then complete the
receipt. Reads/retries reconcile up to 64 pending projections; `projectionPending`
distinguishes durable AX records from completed feed projection.

The private snapshot in `coordination/ax` caps at 8 MiB plus an 8 MiB atomic
temporary budget, 1,000 entries and 16 KiB per entry. Occurrence/replay keys,
rate buckets, history and pending descriptors share those bounds. Capacity rejects
preserve readable state. Closed/merged rows expire after 180 days only after an
explicit export of their current revision and completed projection. External
archives are never automatically pruned. Open entries remain retained.

Owners call `ax::observe(Friction, observation_id, principal, evidence_refs)` after
releasing their locks, retaining stable observation IDs. Receipt-stalled and
delivery-failed journal events feed it at emit; owner-discovery timeout results
feed it at control dispatch. AX events cannot recursively generate candidates.
Candidates coalesce for ten minutes; rejection suppresses the same signature/build
for 24 hours. Only the associated source or local authority confirms them. Pull
results expose confirmation and triage requirements without adding push or release
authority. Reproduction and reference details stay owner/local-only.

The local importer recognizes three queue sections and accepted seed aliases,
without personal runtime paths. The sanitized fixture covers policy/history
exclusion, reported fixes and idempotency. Retire a queue only after import readback.
