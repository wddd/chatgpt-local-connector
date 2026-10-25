# Coordination journal

MUST means a requirement. SHOULD means the default unless a concrete task-specific
reason justifies an exception. MAY means an option.

The `coordination` module owns the instance-local metadata journal and `events`
query. `guide`, `query`, `act`, and `notification` retain their frozen envelopes.
AX source writes use the owner store below. Resource push remains a later phase.
ARC observers project dispatch, terminal, receipt, replacement, restart, local
tooling lifecycle and registered Git facts. Source event-report writes and resource
push are not implemented. AX owns its separate records and producers.

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
feed it at control dispatch. AX events cannot recursively generate candidates. Receipt observers only persist
and emit their stalled transition; they do not call AX directly. Journal retries
retain the transition ID consumed by AX occurrence deduplication.
Candidates coalesce for ten minutes; rejection suppresses the same signature/build
for 24 hours. Only the associated source or local authority confirms them. Pull
results expose confirmation and triage requirements without adding push or release
authority. Reproduction and reference details stay owner/local-only.

The local importer recognizes three queue sections and accepted seed aliases,
without personal runtime paths. The sanitized fixture covers policy/history
exclusion, reported fixes and idempotency. Retire a queue only after import readback.


## Observers and owner boundaries

`observers::save_owner` adds typed `coordinationPending` descriptors to the owner
record and syncs one atomic replacement for an unprojected transition. Ordinary
text/progress writes with no pending projection retain their existing save behavior.
Dispatch history owns submitted dispatches; Agent dispatch becomes observable after
the prompt frame is flushed, not while its configuration is merely prepared.
Agent task records and native terminal frames own observed terminal transitions.
Native frames are recorded even without a notification binding. Replacement workers
persist descriptors only; they never open the journal from a second process.
The Core projector emits outside owner locks, then syncs a separate checkpoint.
The first durable terminal observation is canonical across native, Desktop and
reconciliation paths. Retry keeps its descriptor and transition ID.

Receipt reservations enroll a known path for bounded phase-age observation. A phase
stalls after the same 30-second threshold as `progressStalled`; this does not prove
execution failure. After recording one stall, the observer stops polling that phase
until another owner checkpoint. Unconfirmed backend-session reads persist a separate
observation without rewriting a live receipt. Replacement interruption counts require
the finalized shutdown snapshot and exclude `finished-before-shutdown` entries.
Unknown counts stay absent. `resumeSubmissions` counts completed resume-operation
receipts with a turn ID, never completed successor turns. Recovery summary is separate
from replacement success. Restart evidence identifies the new Core instance.

Startup discovery and the pending path set cap at 4,096 records. Owner records retain
at most 128 descriptors. Native snapshot ingestion caps at 128 terminal turns per
snapshot. The derived observation/checkpoint/tooling/ref stores cap at 8,192 files
and 16 MiB in aggregate, separate from the journal's budget. Individual metadata
files cap at 128 KiB. Capacity preserves existing records and reports a coverage gap;
it does not evict producer checkpoints with feed retention. These checkpoints may
only be removed as part of explicit local archive/recovery that also reconciles their
owners. No background directory crawl or unbounded pending queue is introduced. Coverage
projection itself caps at 16 KiB and is reserved in the 128 KiB event page budget.

## Registered Git observation

The watcher consumes the registered project projection from successful existing
`project/list` reads. It never starts app-server or performs an upstream poll merely
to discover projects. `coverage.observers.projectRegistry.observedAt` is the last
upstream read, not proof that registration remained unchanged while disconnected.
An unavailable projection is a gap until an ordinary project query refreshes it.
Private roots remain in local state; shared events expose only registered IDs.

The initial bounds are 32 roots across at most 32 projects, 8 roots/project and
128 watched refs/root. Only `refs/heads/main` and `refs/heads/wt/<lane>` are watched.
The shared Git directory includes known worktree lanes without registering a second
project. Loose and packed refs are read with file stamps; unchanged polls open no
ref files or directories. Reads cap at 256 KiB, directory enumeration at 129 entries.
Nested lane names, excess refs, inaccessible roots and repository replacement report
gaps. Attached, unborn, detached and unwatched HEAD states remain distinguishable.

Polls run every five seconds while an in-process turn baseline is active, otherwise
every thirty seconds. A project deadline is two seconds. A timed-out filesystem read
remains the single in-flight worker; later polls skip it instead of accumulating
workers. An unchanged ref launches no subprocess. Changed refs use the existing
safe Git runner for ancestry, serially, without hooks, fetch or writes. An ancestry
error is `movement:unknown`, not a non-fast-forward claim. Observations coalesce
intermediate unseen changes.

Correlation requires the same canonical common directory, branch, old HEAD and an
overlapping observed turn interval. One candidate is `correlated`; multiple turns,
even in the same thread, are `ambiguous`. Missing evidence, failed observation or
restart discontinuity is `unknown` (unattributed). Author identity is never evidence.
The observer never mutates Git, registers projects or resumes threads.

## Local tooling reports

`coordination.observe` and `coordination.observation` are authenticated local
management operations, absent from the control-source op catalog. Worktree tooling
persists a stable transition before its action and marks completion before reporting.
Core validates the registered parent, current worktree/ref state and land ancestry.
Isolated supervision reports an opaque instance, actual child start/exit and exit code;
Core reads process liveness. Starting is not readiness. A lost supervisor supplies no
fabricated exit. A successful POST requires a separate transition readback.

Tooling uses a 64-record local outbox and reconciles at most two previously completed
reports per invocation, keeping their IDs and payloads. It never retries the original
Git or process action. Confirmed tooling records may be pruned locally because Core
retains their producer checkpoints. Failed/partial operations, unavailable Core,
unregistered roots and failed readback print `coverage:missing` without changing the
original command exit result. Prepared-but-unconfirmed actions are not replayed.

`events.coverage.observers` exposes sampled coverage, last gaps, HEAD state and
registry age. Journal coverage and observer coverage are separate: a healthy journal
cannot imply that an offline tool, inaccessible repository or missing baseline was
observed. Observers add no resource subscription, source claim, lease or message.
