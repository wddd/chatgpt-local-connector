use super::*;
use std::{fs::OpenOptions, io::Write, path::PathBuf};

struct Fixture {
    dir: PathBuf,
    store: Option<Journal>,
    time: i64,
}
impl Fixture {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!("arc-coordination-{}", id()));
        let time = 1_800_000_000_000;
        let store = Some(Journal::open(dir.clone(), time).unwrap());
        Self { dir, store, time }
    }
    fn emit(&mut self, n: usize, resource: &str) -> Result<Value> {
        self.time += 20; // fixtures stay within the internal 100/second admission budget
        self.store
            .as_mut()
            .unwrap()
            .emit(input(n, resource), self.time)
    }
    fn query(&mut self, args: Value) -> Value {
        self.as_reader(&source_reader("one", "a"), args)
    }
    fn as_reader(&mut self, reader: &Reader, args: Value) -> Value {
        let catalog = catalog();
        let spec = catalog["ops"]
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["name"] == "events")
            .unwrap();
        crate::egress::validate_op(spec, &args).unwrap();
        let query = serde_json::from_value(args.clone()).unwrap();
        let value = self
            .store
            .as_mut()
            .unwrap()
            .query(reader, query, self.time)
            .unwrap_or_else(|message| failure(message, &args));
        crate::egress::tool(value, false)["structuredContent"]["result"].clone()
    }
    // Seed a bounded snapshot for capacity boundaries. Tests still cross
    // the boundary through emit and assert only the events op, avoiding tens of
    // thousands of fsyncs merely to prepare a full fixture.
    fn seed(&mut self, count: usize, rich: bool) {
        self.store = None;
        let path = self.dir.join("manifest.json");
        let mut manifest = load(&path).unwrap();
        let mut segment = Vec::new();
        let mut first = 1;
        let mut sequence = 1;
        let mut total = 0;
        let mut segments = Vec::new();
        for n in 0..count {
            self.time += 20;
            let mut event = input(n, "app:installed");
            if rich {
                event.evidence_refs = (0..8)
                    .map(|_| EvidenceRef {
                        kind: EvidenceKind::Receipt,
                        id: "a".repeat(128),
                    })
                    .collect();
            }
            let mut bytes =
                serde_json::to_vec(&json!({"sequence":sequence,"time":self.time,"input":event}))
                    .unwrap();
            bytes.push(b'\n');
            if total + bytes.len() > 15 * 1024 * 1024 {
                break;
            }
            if segment.len() + bytes.len() > 256 * 1024 {
                save_bytes(&self.dir.join(format!("{first:020}.jsonl")), &segment).unwrap();
                segments.push(first);
                first = sequence;
                segment.clear();
            }
            total += bytes.len();
            segment.extend(bytes);
            sequence += 1;
        }
        if !segment.is_empty() {
            save_bytes(&self.dir.join(format!("{first:020}.jsonl")), &segment).unwrap();
            segments.push(first);
        }
        manifest["segments"] = json!(segments);
        manifest["next"] = json!(sequence);
        save(&path, &manifest).unwrap();
        self.restart();
    }
    fn restart(&mut self) {
        self.store = None;
        self.store = Some(Journal::open(self.dir.clone(), self.time).unwrap());
    }
    fn partial_tail(&mut self) {
        self.store = None;
        // Fault injection, not an assertion about internal file layout.
        let path = std::fs::read_dir(&self.dir)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.extension().is_some_and(|e| e == "jsonl"))
            .max()
            .unwrap();
        OpenOptions::new()
            .append(true)
            .open(path)
            .unwrap()
            .write_all(b"{\"sequence\":")
            .unwrap();
        self.restart();
    }
    fn lose_epoch(&mut self) {
        self.store = None;
        std::fs::remove_dir_all(&self.dir).unwrap();
        self.restart();
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.store = None;
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}
fn source_reader(source: &str, account: &str) -> Reader {
    reader(&json!({"sourceId":source,"accountId":account,"ingressId":format!("ingress-{source}"),"authType":"oauth"}),
        &json!({"id":source,"ingressId":format!("ingress-{source}"),"state":"connected","credential":{"type":"oauth-grant","grantId":format!("grant-{source}")}})).unwrap()
}
fn input(n: usize, resource: &str) -> EventInput {
    let mut input = EventInput::new(
        format!("transition-{n}"),
        EventKind::DispatchAccepted,
        vec![ResourceKey::parse(resource).unwrap()],
    );
    input.origin = Some(Principal::Source {
        source_id: if n % 2 == 0 { "one" } else { "two" }.into(),
        account_id: Some(if n % 2 == 0 { "a" } else { "b" }.into()),
    });
    input
}
fn sequences(value: &Value) -> Vec<u64> {
    value["events"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["sequence"].as_u64().unwrap())
        .collect()
}

#[test]
fn events_shape_and_frozen_query_catalog() {
    // Contract: events is a read-only op behind query and returns bounded metadata with replay cursors.
    let mut f = Fixture::new();
    f.emit(0, "app:installed").unwrap();
    let result = f.query(json!({}));
    for key in [
        "events",
        "nextCursor",
        "hasMore",
        "oldestCursor",
        "coverage",
        "observedAt",
        "arcVersion",
    ] {
        assert!(result.get(key).is_some(), "{key}");
    }
    assert_eq!(result["events"][0]["provenance"], "arc-observed");
    assert!(result["events"][0]["summary"].as_str().unwrap().len() <= 240);
    assert!(!result["events"][0]["summary"]
        .as_str()
        .unwrap()
        .contains('\n'));
    assert_eq!(result["coverage"]["observers"], "not-attached");
    let catalog = catalog();
    let op = catalog["ops"]
        .as_array()
        .unwrap()
        .iter()
        .find(|op| op["name"] == "events")
        .unwrap();
    assert_eq!(op["annotations"]["readOnlyHint"], true);
    assert!(!crate::validator("test", "events", &op["inputSchema"])
        .unwrap()
        .is_valid(&json!({"origin":{"sourceId":"two"}})));
}
#[test]
fn cursor_pages_without_omissions_while_appending_and_filtering() {
    // Contract: events cursors are exclusive and hold a high-water mark until the retained page cycle completes.
    let mut f = Fixture::new();
    let start = f.query(json!({"resource":"app:installed"}))["oldestCursor"].clone();
    for n in 0..7 {
        f.emit(
            n,
            if n % 2 == 0 {
                "app:installed"
            } else {
                "host:machine"
            },
        )
        .unwrap();
    }
    let first = f.query(json!({"since":start,"limit":2,"resource":"app:installed"}));
    assert_eq!(sequences(&first), vec![1, 3]);
    assert_eq!(first["hasMore"], true);
    f.emit(7, "app:installed").unwrap();
    let second = f.query(json!({"since":first["nextCursor"],"limit":2,"resource":"app:installed"}));
    assert_eq!(sequences(&second), vec![5, 7]);
    assert_eq!(second["hasMore"], false);
    let third = f.query(json!({"since":second["nextCursor"],"resource":"app:installed"}));
    assert_eq!(sequences(&third), vec![8]);
    f.emit(8, "host:machine").unwrap();
    let empty = f.query(json!({"since":third["nextCursor"],"resource":"app:installed"}));
    assert_eq!(sequences(&empty), Vec::<u64>::new());
    assert_ne!(empty["nextCursor"], third["nextCursor"]);
    f.emit(9, "app:installed").unwrap();
    let last = f.query(json!({"since":empty["nextCursor"],"resource":"app:installed"}));
    assert_eq!(sequences(&last), vec![10]);
}
#[test]
fn cursor_and_idempotent_projection_survive_restart() {
    // Contract: persisted event identity, cursor scope and transition replay survive Core restart.
    let mut f = Fixture::new();
    let first = f.emit(0, "app:installed").unwrap();
    let page = f.query(json!({}));
    f.restart();
    let replay = f.emit(0, "app:installed").unwrap();
    assert_eq!(first["eventId"], replay["eventId"]);
    assert_eq!(replay["duplicate"], true);
    f.emit(1, "app:installed").unwrap();
    let next = f.query(json!({"since":page["nextCursor"]}));
    assert_eq!(sequences(&next), vec![2]);
    assert_eq!(
        f.emit(0, "host:machine").unwrap_err().split(':').next(),
        Some("COORDINATION_TRANSITION_CONFLICT")
    );
}
#[test]
fn expired_scope_and_epoch_cursors_report_gaps_with_valid_reset_queries() {
    // Contract: retention, epoch reset and changed visibility/filter scopes never silently skip replay.
    let mut f = Fixture::new();
    f.emit(0, "app:installed").unwrap();
    let cursor = f.query(json!({}))["oldestCursor"].clone();
    let scope = f.query(json!({"since":cursor,"kinds":["ax.created"]}));
    assert_eq!(scope["error"]["code"], "CURSOR_SCOPE_CHANGED");
    let other = f.as_reader(&source_reader("two", "b"), json!({"since":cursor}));
    assert_eq!(other["error"]["code"], "CURSOR_SCOPE_CHANGED");
    f.time += 7 * 24 * 60 * 60 * 1000;
    let expired = f.query(json!({"since":cursor}));
    assert_eq!(expired["error"]["code"], "CURSOR_EXPIRED");
    assert_eq!(expired["coverage"]["state"], "partial");
    let reset = f.query(expired["next"]["args"].clone());
    assert_eq!(sequences(&reset), Vec::<u64>::new());
    f.emit(1, "app:installed").unwrap();
    assert_eq!(
        sequences(&f.query(json!({"since":reset["nextCursor"]}))),
        vec![2]
    );
    f.lose_epoch();
    assert_eq!(
        f.query(json!({"since":cursor}))["error"]["code"],
        "CURSOR_EXPIRED"
    );
}
#[test]
fn partial_tail_preserves_complete_events_and_reports_recovery() {
    // Contract: an interrupted journal tail is quarantined without losing complete records or claiming complete coverage.
    let mut f = Fixture::new();
    f.emit(0, "app:installed").unwrap();
    let before = f.query(json!({}));
    f.partial_tail();
    let page = f.query(json!({"since":before["oldestCursor"]}));
    assert_eq!(sequences(&page), vec![1]);
    assert_eq!(page["coverage"]["state"], "partial");
    f.emit(1, "app:installed").unwrap();
    f.restart();
    let next = f.query(json!({"since":page["nextCursor"]}));
    assert_eq!(sequences(&next), vec![2]);
    assert_eq!(next["coverage"]["state"], "partial");
}
#[test]
fn oversized_metadata_and_bad_fields_reject_without_affecting_prior_events() {
    // Contract: events never accept arbitrary content fields or over-budget metadata and preserve the last durable history.
    let mut f = Fixture::new();
    f.emit(0, "app:installed").unwrap();
    let page = f.query(json!({}));
    let mut huge = input(1, "app:installed");
    huge.evidence_refs = (0..16)
        .map(|_| EvidenceRef {
            kind: EvidenceKind::Receipt,
            id: "a".repeat(128),
        })
        .collect();
    assert!(f
        .store
        .as_mut()
        .unwrap()
        .emit(huge, f.time)
        .unwrap_err()
        .starts_with("COORDINATION_CAPACITY"));
    let mut raw = serde_json::to_value(input(2, "app:installed")).unwrap();
    for field in ["prompt", "title", "error", "summary", "notify"] {
        raw[field] = json!("private-content");
        assert!(serde_json::from_value::<EventInput>(raw.clone()).is_err());
        raw.as_object_mut().unwrap().remove(field);
    }
    f.restart();
    assert_eq!(
        sequences(&f.query(json!({"since":page["oldestCursor"]}))),
        vec![1]
    );
    assert_eq!(f.emit(2, "app:installed").unwrap()["sequence"], 2);
}
#[test]
fn cross_account_sources_share_only_projected_metadata_and_revocation_is_checked() {
    // Contract: two authorized accounts see coordination metadata without resource membership, never task content or routing data.
    let mut f = Fixture::new();
    let secret = "private-prompt-title-error-route";
    for (n, source, account) in [(0, "one", "a"), (1, "two", "b")] {
        let origin = json!({"sourceId":source,"accountId":account,"authType":"oauth","ingressId":format!("ingress-{source}"),"sourceLabel":secret,"prompt":secret,"task_title":secret,"error":secret,"notify":{"target":secret}});
        let mut event = input(n, "app:installed");
        event.origin = Principal::from_origin(&origin).unwrap();
        f.store.as_mut().unwrap().emit(event, f.time).unwrap();
    }
    let a = f.as_reader(&source_reader("one", "a"), json!({}));
    let b = f.as_reader(&source_reader("two", "b"), json!({}));
    assert_eq!(a["events"], b["events"]);
    assert_eq!(sequences(&a), vec![1, 2]);
    assert!(!a.to_string().contains(secret));
    assert_eq!(a["events"][1]["origin"]["accountId"], "b");
    assert!(reader(
        &json!({"sourceId":"one","ingressId":"ingress-one","authType":"oauth"}),
        &json!({"id":"one","state":"revoked"})
    )
    .is_err());
    assert_eq!(Principal::from_origin(&Value::Null).unwrap(), None);
    assert_eq!(
        Principal::from_origin(&json!({"authType":"local","ingressId":"local-ui"})).unwrap(),
        Some(Principal::LocalAuthority)
    );
}
#[test]
fn canonical_resources_resolve_parent_and_reject_ambiguous_lanes() {
    // Property: resource projection never confuses duplicate lane names, paths or absent parent identity.
    let mut resources = Resources::default();
    assert!(resources.lane("p1", "fix").is_err());
    resources.project("p1").unwrap();
    resources.project("p2").unwrap();
    let first = resources.lane("p1", "fix").unwrap();
    assert_eq!(resources.resolve("lane:fix").unwrap(), first);
    resources.lane("p2", "fix").unwrap();
    assert!(resources
        .resolve("lane:fix")
        .unwrap_err()
        .starts_with("RESOURCE_AMBIGUOUS"));
    assert_eq!(resources.resolve("lane:p1/fix").unwrap(), first);
    for key in [
        "project:/personal/path/main",
        "host:user@example.test",
        "lane:../fix",
        "isolated:a\nb",
    ] {
        assert!(ResourceKey::parse(key).is_err());
    }
}
#[test]
fn count_and_disk_retention_expire_oldest_cursor_and_remain_restartable() {
    // Contract: journal retention enforces the record/disk budget and signals eviction through the events cursor.
    let mut f = Fixture::new();
    let oldest = f.query(json!({}))["oldestCursor"].clone();
    f.seed(19_999, false);
    for n in 19_999..20_050 {
        f.emit(n, "app:installed").unwrap();
    }
    f.restart();
    let expiry = f.query(json!({"since":oldest}));
    assert_eq!(expiry["error"]["code"], "CURSOR_EXPIRED");
    let newest = f.query(json!({"limit":200}));
    assert!(sequences(&newest).len() <= 200);
    assert_eq!(sequences(&newest).last(), Some(&20_050));
    let reset = f.query(expiry["next"]["args"].clone());
    assert!(sequences(&reset)[0] > 1);
}

#[test]
fn disk_full_append_reserves_sequence_and_retry_recovers_without_duplicates() {
    // Contract: disk-full cannot report an unpersisted event as durable or reuse a torn append sequence.
    let mut f = Fixture::new();
    f.emit(0, "app:installed").unwrap();
    let page = f.query(json!({}));
    f.store.as_mut().unwrap().fail_append_after = Some(19);
    assert!(f
        .emit(1, "app:installed")
        .unwrap_err()
        .starts_with("COORDINATION_STORAGE"));
    f.restart();
    let recovered = f.query(json!({"since":page["nextCursor"]}));
    assert_eq!(sequences(&recovered), Vec::<u64>::new());
    assert_eq!(recovered["coverage"]["state"], "partial");
    assert_eq!(f.emit(1, "app:installed").unwrap()["sequence"], 3);
    f.restart();
    let after = f.query(json!({"since":page["nextCursor"]}));
    assert_eq!(sequences(&after), vec![3]);
    assert_eq!(after["coverage"]["gaps"], recovered["coverage"]["gaps"]);
}

#[test]
fn byte_bound_evicts_before_count_bound_and_pages_fit_wire_budget() {
    // Contract: events enforces byte retention and page wire budgets independently of the record-count bound.
    let mut f = Fixture::new();
    let oldest = f.query(json!({}))["oldestCursor"].clone();
    f.seed(14_000, true);
    let before = f.query(json!({}));
    let initial = before["coverage"]["retainedEvents"].as_u64().unwrap();
    for n in 14_000..14_005 {
        f.time += 20;
        let mut event = input(n, "app:installed");
        event.evidence_refs = (0..8)
            .map(|_| EvidenceRef {
                kind: EvidenceKind::Receipt,
                id: "a".repeat(128),
            })
            .collect();
        f.store.as_mut().unwrap().emit(event, f.time).unwrap();
    }
    f.restart();
    let page = f.query(json!({"limit":200}));
    assert!(page["coverage"]["retainedBytes"].as_u64().unwrap() < 16 * 1024 * 1024);
    assert!(page["coverage"]["retainedEvents"].as_u64().unwrap() < 14_000);
    assert!(serde_json::to_vec(&page).unwrap().len() <= 128 * 1024);
    assert_eq!(sequences(&page).last(), Some(&(initial + 5)));
    assert_eq!(
        f.query(json!({"since":oldest}))["error"]["code"],
        "CURSOR_EXPIRED"
    );
}

#[test]
fn account_attribution_changes_do_not_change_source_cursor_authority() {
    // Contract: account reassignment cannot merge source authority or invalidate unchanged coordination visibility.
    let mut f = Fixture::new();
    f.emit(0, "app:installed").unwrap();
    let before = f.as_reader(&source_reader("one", "a"), json!({}));
    f.emit(1, "app:installed").unwrap();
    let after = f.as_reader(
        &source_reader("one", "b"),
        json!({"since":before["nextCursor"]}),
    );
    assert_eq!(sequences(&after), vec![2]);
    let mut changed = source_reader("one", "b");
    changed.revision = "changed-credential".into();
    assert_eq!(
        f.as_reader(&changed, json!({"since":after["nextCursor"]}))["error"]["code"],
        "CURSOR_SCOPE_CHANGED"
    );
}

#[test]
fn admission_budgets_bound_reads_and_emissions_without_losing_retry_scope() {
    // Contract: pull and emission limits fail explicitly, preserve the retry cursor and count coverage loss without queued events.
    let mut f = Fixture::new();
    let first = f.query(json!({"kinds":["ax.created"]}));
    let args = json!({"since":first["nextCursor"],"kinds":["ax.created"]});
    for _ in 0..9 {
        assert!(f.query(args.clone())["error"].is_null());
    }
    let limited = f.query(args.clone());
    assert_eq!(limited["error"]["code"], "COORDINATION_RATE_LIMIT");
    assert_eq!(limited["next"]["args"], args);
    for n in 0..100 {
        f.store
            .as_mut()
            .unwrap()
            .emit(input(n, "app:installed"), f.time)
            .unwrap();
    }
    assert!(f
        .store
        .as_mut()
        .unwrap()
        .emit(input(100, "app:installed"), f.time)
        .unwrap_err()
        .starts_with("COORDINATION_RATE_LIMIT"));
    let other = f.as_reader(&source_reader("two", "b"), json!({}));
    assert_eq!(other["coverage"]["dropped"], 1);
    f.restart();
    let replay = f.query(json!({}));
    assert_eq!(replay["coverage"]["dropped"], 1);
    assert_eq!(replay["coverage"]["retainedEvents"], 100);
}

#[test]
fn expired_lane_shorthand_cursor_resets_to_its_canonical_parent() {
    // Contract: expiration of a lane's last event still returns CURSOR_EXPIRED and a usable canonical reset query.
    let mut f = Fixture::new();
    f.emit(0, "lane:p1/fix").unwrap();
    let page = f.query(json!({"resource":"lane:fix"}));
    f.time += 7 * 24 * 60 * 60 * 1000;
    let expired = f.query(json!({"resource":"lane:fix","since":page["oldestCursor"]}));
    assert_eq!(expired["error"]["code"], "CURSOR_EXPIRED");
    assert_eq!(expired["next"]["args"]["resource"], "lane:p1/fix");
    let reset = f.query(expired["next"]["args"].clone());
    assert_eq!(sequences(&reset), Vec::<u64>::new());
}
