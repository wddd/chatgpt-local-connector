use super::*;
struct Fixture {
    path: PathBuf,
    store: Store,
    time: i64,
    actor: Value,
}
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("arc-ax-fixture-{}", id()));
        Self {
            store: Store::open(path.clone()).unwrap(),
            path,
            time: 1_800_000_000_000,
            actor: json!({"type":"source","sourceId":"one","accountId":"account-one"}),
        }
    }
    fn call(&mut self, op: &str, mut args: Value) -> Value {
        if op != "ax_list" && args["requestId"].is_null() {
            args["requestId"] = json!(id());
        }
        let result=validate(op,&args).and_then(|_| {
            if op=="ax_list" {self.store.list(&args,&self.actor,"authority-1",self.time)}
            else {self.store.mutate(op,&args,&self.actor,vec![json!({"kind":"observation","coreBuild":"fixture-build","observedAt":timestamp(self.time)})],self.time)}
        });
        crate::egress::tool(result.unwrap_or_else(|e| failure(e, op, &args)), false)
            ["structuredContent"]["result"]
            .clone()
    }
    fn report(&mut self, symptom: &str) -> Value {
        self.call("ax_report",json!({"symptom":symptom,"expected":"Bounded actionable result","severity":"workaround"}))["entry"].clone()
    }
    fn decide(&mut self, e: &Value, action: &str) -> Value {
        self.call(if matches!(action,"confirm"|"reject") {"ax_candidate"}else{"ax_triage"},json!({"id":e["id"],"expectedRevision":e["revision"],"action":action,"reason":"Fixture decision"}))["entry"].clone()
    }
    fn drain(&mut self) {
        for event in self.store.pending() {
            self.store.projected(&event.transition_id).unwrap();
        }
    }
    fn restart(&mut self) {
        self.store = Store::open(self.path.clone()).unwrap();
    }
    fn candidate(&mut self, observation: &str, build: &str) -> Value {
        let source = serde_json::from_value(self.actor.clone()).unwrap();
        self.store
            .candidate(
                Friction::StalledReceipt,
                observation,
                Some(source),
                vec![],
                build,
                self.time,
            )
            .unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

#[test]
// Contract: AX operations retain frozen query/act envelopes and reject caller-selected origin or version.
fn ax_contract_shapes() {
    let c = catalog();
    for name in ["ax_report", "ax_list", "ax_candidate", "ax_triage"] {
        let spec = c["ops"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["name"] == name)
            .unwrap();
        assert_eq!(
            crate::egress::via(spec),
            if name == "ax_list" { "query" } else { "act" }
        );
        assert_eq!(
            crate::egress::retry_contract(spec)["mode"],
            if name == "ax_list" {
                "read-only"
            } else {
                "receipt"
            }
        );
        let mut invalid = spec["example"].clone();
        invalid["source"] = json!("spoofed");
        assert!(validate(name, &invalid).is_err());
        invalid = spec["example"].clone();
        invalid["arcVersion"] = json!("spoofed");
        assert!(validate(name, &invalid).is_err());
        assert!(validate(name, &spec["example"]).is_ok());
    }
    assert!(validate("ax_report", &json!({"symptom":"x","expected":"y"})).is_err());
    assert!(validate(
        "ax_report",
        &json!({"kind":"idea","symptom":"x","expected":"y"})
    )
    .is_ok());
}
#[test]
// Contract: ax_report retries reconcile durable owner records once across restart, and exact evidence dedupes.
fn ax_retry_dedupe_and_similarity() {
    let mut f = Fixture::new();
    let args = json!({"requestId":id(),"symptom":"Owner discovery timeout for idle thread","expected":"Bounded result","severity":"blocking","receiptIds":["receipt-one"]});
    let first = f.call("ax_report", args.clone());
    f.restart();
    let retry = f.call("ax_report", args.clone());
    assert_eq!(retry["entry"]["id"], first["entry"]["id"]);
    assert_eq!(retry["entry"]["occurrenceCount"], 1);
    let mut again = args.clone();
    again["requestId"] = json!(id());
    assert_eq!(
        f.call("ax_report", again.clone())["entry"]["occurrenceCount"],
        1
    );
    again["requestId"] = json!(id());
    again["receiptIds"] = json!(["receipt-two"]);
    assert_eq!(
        f.call("ax_report", again.clone())["entry"]["occurrenceCount"],
        2
    );
    again["requestId"] = json!(id());
    again["symptom"] = json!("Owner discovery timeout for active thread");
    let similar = f.call("ax_report", again);
    assert_ne!(similar["entry"]["id"], first["entry"]["id"]);
    assert_eq!(
        similar["duplicateCandidates"][0]["id"],
        first["entry"]["id"]
    );
    assert_eq!(f.call("ax_list", json!({}))["counts"]["open"], 2);
}
#[test]
// Contract: candidates require their associated source confirmation, never count as open, and remember rejections per build.
fn ax_candidate_decisions_cooldown_and_rejection() {
    let mut f = Fixture::new();
    let candidate = f.candidate("observation-one", "build-a")["entry"].clone();
    assert_eq!(candidate["occurrenceCount"], 0);
    let list = f.call("ax_list", json!({}));
    assert_eq!(list["counts"]["open"], 0);
    assert_eq!(list["counts"]["candidates"], 1);
    assert_eq!(f.candidate("observation-two", "build-a")["coalesced"], true);
    f.actor["sourceId"] = json!("two");
    let denied=f.call("ax_candidate",json!({"id":candidate["id"],"expectedRevision":candidate["revision"],"action":"confirm","reason":"Checked"}));
    assert_eq!(denied["error"]["code"], "AX_FORBIDDEN");
    f.actor["sourceId"] = json!("one");
    let confirmed = f.decide(&candidate, "confirm");
    assert_eq!(confirmed["status"], "open");
    assert_eq!(confirmed["occurrenceCount"], 1);
    let other = f.candidate("observation-three", "build-b")["entry"].clone();
    assert_eq!(f.decide(&other, "reject")["candidateState"], "rejected");
    f.restart();
    assert_eq!(
        f.candidate("observation-four", "build-b")["suppressed"],
        true
    );
    assert_eq!(
        f.candidate("observation-five", "build-c")["entry"]["status"],
        "candidate"
    );
    f.time += 86_400_001;
    assert_eq!(
        f.candidate("observation-six", "build-b")["entry"]["status"],
        "candidate"
    );
}
#[test]
// Contract: triage preserves revisions/history, requires verification beyond a commit, and merges unique occurrences without cycles.
fn ax_triage_history_merge_and_recurrence() {
    let mut f = Fixture::new();
    let first = f.report("Idle owner discovery failed");
    let triaged=f.call("ax_triage",json!({"id":first["id"],"expectedRevision":first["revision"],"action":"fix","reason":"Change landed","commit":"abc123"}))["entry"].clone();
    assert_eq!(triaged["status"], "triaged");
    let conflict=f.call("ax_triage",json!({"id":first["id"],"expectedRevision":first["revision"],"action":"wontfix","reason":"Stale decision"}));
    assert_eq!(conflict["error"]["code"], "AX_REVISION_CONFLICT");
    let closed = f.decide(&triaged, "wontfix");
    assert_eq!(closed["status"], "closed");
    let recurrence = f.report("Idle owner discovery failed");
    assert_eq!(recurrence["id"], first["id"]);
    assert_eq!(recurrence["status"], "open");
    assert_eq!(recurrence["occurrenceCount"], 2);
    assert_eq!(recurrence["history"].as_array().unwrap().len(), 4);
    let second = f.report("Active owner discovery failed");
    let merged=f.call("ax_triage",json!({"id":second["id"],"expectedRevision":second["revision"],"action":"merged","mergedInto":first["id"],"reason":"Same cause"}))["entry"].clone();
    assert_eq!(merged["status"], "merged");
    assert_eq!(merged["occurrenceCount"], 1);
    let canonical = f.call("ax_list", json!({"id":first["id"]}))["entries"][0].clone();
    assert_eq!(canonical["occurrenceCount"], 3);
    let cycle=f.call("ax_triage",json!({"id":first["id"],"expectedRevision":canonical["revision"],"action":"merged","mergedInto":second["id"],"reason":"Cycle"}));
    assert_eq!(cycle["error"]["code"], "AX_MERGE_CYCLE");
    let observed = f.report("Active owner discovery failed");
    assert_eq!(observed["id"], first["id"]);
    assert_eq!(observed["occurrenceCount"], 4);
}
#[test]
// Contract: shared AX lists redact reproduction/evidence and bind paging cursors to authority, filters and snapshot.
fn ax_visibility_paging_and_filters() {
    let mut f = Fixture::new();
    f.call("ax_report",json!({"symptom":"Stalled receipt","expected":"Progress","severity":"blocking","reproductionHints":"private-detail"}));
    f.report("Delivery failed");
    let first = f.call("ax_list", json!({"limit":1}));
    assert!(first["nextCursor"].is_string());
    assert_eq!(first["triageDue"], true);
    let second = f.call("ax_list", json!({"limit":1,"cursor":first["nextCursor"]}));
    assert_ne!(first["entries"][0]["id"], second["entries"][0]["id"]);
    f.actor["accountId"] = json!("merged-account");
    assert!(
        f.call("ax_list", json!({"limit":1,"cursor":first["nextCursor"]}))["entries"].is_array()
    );
    f.actor["sourceId"] = json!("two");
    f.actor["accountId"] = json!("account-two");
    assert_eq!(
        f.call("ax_list", json!({"cursor":first["nextCursor"]}))["error"]["code"],
        "AX_CURSOR_EXPIRED"
    );
    let shared = f.call("ax_list", json!({"severity":"blocking","state":"open"}));
    assert_eq!(shared["entries"].as_array().unwrap().len(), 1);
    assert!(shared["entries"][0].get("reproductionHints").is_none());
    assert!(shared["entries"][0].get("evidence").is_none());
    assert_eq!(
        f.call("ax_list", json!({"since":"2099-01-01T00:00:00Z"}))["entries"],
        json!([])
    );
}
#[test]
// Contract: bounded AX mutations reject safely without losing counts/history, and rate limits count distinct attempts only.
fn ax_capacity_and_rate_preserve_last_snapshot() {
    let mut f = Fixture::new();
    let mut entry = f.report("Bounded history");
    for n in 0..100 {
        let before = entry.clone();
        let result=f.call("ax_triage",json!({"id":entry["id"],"expectedRevision":entry["revision"],"action":if n%2==0 {"wontfix"}else{"reopen"},"reason":"r".repeat(1000)}));
        if result["state"] == "failed" {
            assert_eq!(result["error"]["code"], "COORDINATION_CAPACITY");
            f.restart();
            let after = f.call("ax_list", json!({"id":entry["id"]}))["entries"][0].clone();
            assert_eq!(after, before);
            break;
        }
        entry = result["entry"].clone();
        f.drain();
        assert!(n < 99);
    }
    for n in 0..9 {
        f.report(&format!("Rate symptom {n}"));
    }
    assert_eq!(
        f.call(
            "ax_report",
            json!({"symptom":"Overflow","expected":"Bounded","severity":"cosmetic"})
        )["error"]["code"],
        "COORDINATION_RATE_LIMIT"
    );
}
#[test]
// Contract: explicit queue import includes seeds/ideas/follow-ups, excludes policy/history and is idempotent on a sanitized fixture copy.
fn ax_import_idempotency_and_reported_fixes() {
    let mut f = Fixture::new();
    let text = include_str!("queue-fixture.md");
    let first = f.store.import_queue(text, f.time).unwrap();
    assert_eq!(first["imported"], 26);
    assert_eq!(first["entries"].as_array().unwrap().len(), 26);
    f.restart();
    let again = f.store.import_queue(text, f.time).unwrap();
    assert_eq!(again["imported"], 0);
    assert_eq!(again["unchanged"], 26);
    let entries = again["entries"].as_array().unwrap();
    assert_eq!(entries.iter().filter(|e| e["kind"] == "idea").count(), 2);
    assert!(entries
        .iter()
        .filter(|e| e["kind"] == "idea")
        .all(|e| e["occurrenceCount"] == 0));
    let fixed = entries.iter().find(|e| e["id"] == "AX-10").unwrap();
    assert_eq!(fixed["status"], "open");
    assert!(fixed["evidence"].to_string().contains("1eec642"));
    assert!(entries
        .iter()
        .all(|e| e["arcVersion"].is_null() && e["firstSeenAt"].is_null()));
    let added=format!("{text}\n- Another bounded metadata follow-up.\n\nPolicy:\n- Must not become an AX entry.\n");
    assert_eq!(f.store.import_queue(&added, f.time).unwrap()["imported"], 1);
}
#[test]
// Contract: closed entries expire only after an explicit durable local export; open entries remain retained.
fn ax_export_before_retention_and_events() {
    let mut f = Fixture::new();
    let entry = f.report("Closed defect");
    f.decide(&entry, "wontfix");
    let open = f.report("Open defect");
    let events = f.store.pending();
    assert!(events.iter().any(|e| e.kind == EventKind::AxCreated));
    assert!(events.iter().any(|e| e.kind == EventKind::AxChanged));
    f.drain();
    f.time += 181 * 86400 * 1000;
    f.report("Retention trigger");
    assert_eq!(
        f.call("ax_list", json!({"id":entry["id"]}))["entries"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let export = f.path.join("fixture-export.json");
    assert_eq!(f.store.export(&export).unwrap()["exported"], 3);
    f.report("Prune trigger");
    assert_eq!(
        f.call("ax_list", json!({"id":entry["id"]}))["entries"],
        json!([])
    );
    assert_eq!(
        f.call("ax_list", json!({"id":open["id"]}))["entries"][0]["status"],
        "open"
    );
}

#[test]
// Contract: receipt/request reference spellings identify one occurrence, including merges and owner severity enrichment.
fn ax_unique_evidence_merges_and_severity_authority() {
    let mut f = Fixture::new();
    let first=f.call("ax_report",json!({"symptom":"Owner timeout","expected":"Bounded result","severity":"workaround","receiptIds":["shared-receipt"]}))["entry"].clone();
    let again=f.call("ax_report",json!({"symptom":"Owner timeout","expected":"Bounded result","severity":"blocking","requestIds":["shared-receipt"],"threadIds":["context-thread"]}))["entry"].clone();
    assert_eq!(again["occurrenceCount"], 1);
    assert_eq!(again["severity"], "blocking");
    assert!(again["revision"].as_u64() > first["revision"].as_u64());
    f.actor["sourceId"] = json!("two");
    let foreign=f.call("ax_report",json!({"symptom":"Owner timeout","expected":"Other expected result","severity":"cosmetic","requestIds":["shared-receipt"]}))["entry"].clone();
    assert_eq!(foreign["severity"], "blocking");
    assert_eq!(foreign["expected"], again["expected"]);
    f.actor["sourceId"] = json!("one");
    let second=f.call("ax_report",json!({"symptom":"Discovery timeout","expected":"Bounded result","severity":"workaround","requestIds":["shared-receipt"]}))["entry"].clone();
    f.call("ax_triage",json!({"id":second["id"],"expectedRevision":second["revision"],"action":"merged","mergedInto":first["id"],"reason":"Same evidenced occurrence"}));
    assert_eq!(
        f.call("ax_list", json!({"id":first["id"]}))["entries"][0]["occurrenceCount"],
        1
    );
}
#[test]
// Contract: fix closure requires available completed verification receipts; unavailable IDs cannot close a defect.
fn ax_verification_evidence_required_for_closure() {
    let mut f = Fixture::new();
    let entry = f.report("Verification needed");
    let mut args = json!({"requestId":id(),"id":entry["id"],"expectedRevision":entry["revision"],"action":"fix","reason":"Reviewed change and checks","commit":"abc123","evidenceIds":["verification-receipt"]});
    let pending = f.call("ax_triage", args.clone())["entry"].clone();
    assert_eq!(pending["status"], "triaged");
    args["requestId"] = json!(id());
    args["expectedRevision"] = pending["revision"].clone();
    validate("ax_triage", &args).unwrap();
    let verified=f.store.mutate("ax_triage",&args,&f.actor,vec![json!({"id":"verification-receipt","availability":"available","state":"completed","operation":"command"})],f.time).unwrap();
    assert_eq!(verified["entry"]["status"], "closed");
    assert_eq!(verified["entry"]["resolution"], "fix");
}
#[test]
// Contract: the 1000-entry bound rejects the next import atomically and candidate overflow stays separate from confirmed counts.
fn ax_entry_bound_and_candidate_overflow() {
    let mut f = Fixture::new();
    let reports:Vec<_>=(0..1000).map(|n|json!({"id":format!("fixture-{n}"),"symptom":format!("Independent defect {n}"),"expected":"Bounded result","kind":"friction","severity":"workaround"})).collect();
    assert_eq!(
        f.store.import_reports(reports, f.time).unwrap()["imported"],
        1000
    );
    let overflow = vec![
        json!({"id":"fixture-overflow","symptom":"Excess record","expected":"Reject safely","kind":"friction","severity":"workaround"}),
    ];
    assert!(f
        .store
        .import_reports(overflow, f.time)
        .unwrap_err()
        .starts_with("COORDINATION_CAPACITY:"));
    f.restart();
    assert_eq!(f.call("ax_list", json!({}))["counts"]["open"], 1000);
    let mut c = Fixture::new();
    for n in 0..20 {
        c.candidate(&format!("observation-{n}"), &format!("build-{n}"));
    }
    assert_eq!(
        c.candidate("excess", "build-excess")["reason"],
        "candidate-rate-limit"
    );
    c.restart();
    let list = c.call("ax_list", json!({}));
    assert_eq!(list["counts"]["candidateOverflow"], 1);
    assert_eq!(list["counts"]["open"], 0);
    assert_eq!(list["counts"]["candidates"], 20);
}
