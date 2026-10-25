use super::*;
struct Fixture {
    store: Store,
    path: PathBuf,
    clock: Clock,
    actor: Principal,
}
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("arc-bulletin-{}", id()));
        Self {
            store: Store::open(path.join("state.json")).unwrap(),
            path,
            clock: Clock {
                utc: 1_800_000_000_000,
                elapsed: 1_800_000_000_000,
                certain: true,
            },
            actor: Principal::Source {
                source_id: "source-a".into(),
                account_id: Some("account-a".into()),
            },
        }
    }
    fn advance(&mut self, ms: i64) {
        self.clock.utc += ms;
        self.clock.elapsed += ms;
    }
    fn call(&mut self, op: &str, mut args: Value) -> Value {
        if op != "board" && args["requestId"].is_null() {
            args["requestId"] = json!(id());
        }
        let result = validate(op, &args).and_then(|_| {
            self.store.maintain(&[], self.clock)?;
            if op == "board" {
                self.store.board(&args, "source-revision", self.clock)
            } else {
                self.store
                    .mutate(op, &args, &self.actor, vec![], self.clock)
            }
        });
        result.unwrap_or_else(|error| failure(error, op))
    }
    fn post(&mut self) -> Value {
        self.call("notice_post",json!({"intent":"Coordinate shared work","resources":["app:installed"],"expectedDurationSeconds":60}))["notice"].clone()
    }
    fn board(&mut self, id: &Value) -> Value {
        self.call("board", json!({"id":id,"view":"full"}))
    }
    fn link(&mut self, n: &Value) {
        let args = json!({"id":n["id"],"expectedRevision":n["revision"],"threadIds":["thread-a"],"requestId":id()});
        self.store
            .mutate(
                "notice_update",
                &args,
                &self.actor,
                vec![Link {
                    session_binding_id: None,
                    thread_id: "thread-a".into(),
                    observed_turn_id: Some("turn-a".into()),
                    scope_state: "running".into(),
                    observed_at: Some(self.clock.utc),
                    terminals: Default::default(),
                }],
                self.clock,
            )
            .unwrap();
    }
    fn drain(&mut self) {
        for input in self.store.state.pending.clone() {
            self.store
                .projected(&input.transition_id, self.clock)
                .unwrap();
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}
#[test]
// Contract: bulletin catalog operations retain frozen query/act shapes and reject caller-selected authority and prompt fields.
fn schemas_and_metadata_boundary() {
    let c = catalog();
    for op in [
        "board",
        "notice_post",
        "notice_update",
        "notice_close",
        "blocker_open",
        "blocker_clear",
        "coordination_session",
    ] {
        let spec = c["ops"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["name"] == op)
            .unwrap();
        assert_eq!(
            crate::egress::via(spec),
            if op == "board" { "query" } else { "act" }
        );
        assert_eq!(
            crate::egress::retry_contract(spec)["mode"],
            if op == "board" {
                "read-only"
            } else {
                "receipt"
            }
        );
        validate(op, &spec["example"]).unwrap();
        for key in [
            "ownerSourceId",
            "origin",
            "prompt",
            "notificationTarget",
            "arcVersion",
        ] {
            let mut invalid = spec["example"].clone();
            invalid[key] = json!("private");
            assert!(validate(op, &invalid).is_err());
        }
    }
    let mut f = Fixture::new();
    let n = f.post();
    f.actor = Principal::Source {
        source_id: "source-b".into(),
        account_id: Some("account-b".into()),
    };
    let shared = f.board(&n["id"]);
    assert_eq!(shared["notices"][0]["ownerSourceId"], "source-a");
    assert!(!shared.to_string().contains("account-a"));
    assert!(shared["notices"][0]["lastActiveAt"].is_string());
    assert!(shared["notices"][0]["observedAt"].is_string());
    assert!(shared["notices"][0]["activityCoverage"].is_string());
    assert_eq!(
        f.call("notice_close", json!({"id":n["id"]}))["error"]["code"],
        "COORDINATION_OWNER_REQUIRED"
    );
    let too_long=f.call("notice_post",json!({"intent":"x".repeat(241),"resources":["app:installed"],"expectedDurationSeconds":60}));
    assert_eq!(too_long["state"], "failed");
}
#[test]
// Contract: notice operations retain revision checks, idempotent receipt replay, compact board and explicit closure.
fn notice_lifecycle_and_replay() {
    let mut f = Fixture::new();
    let args = json!({"intent":"Shared work","resources":["app:installed"],"expectedDurationSeconds":1,"requestId":id()});
    let a = f.call("notice_post", args.clone());
    assert_eq!(f.call("notice_post", args.clone()), a);
    let mut changed = args;
    changed["intent"] = json!("Different work");
    assert_eq!(
        f.call("notice_post", changed)["error"]["code"],
        "REQUEST_ID_CONFLICT"
    );
    let n = &a["notice"];
    assert_eq!(
        f.call(
            "notice_update",
            json!({"id":n["id"],"expectedRevision":9,"intent":"Updated"})
        )["error"]["code"],
        "COORDINATION_REVISION_CONFLICT"
    );
    let updated = f.call(
        "notice_update",
        json!({"id":n["id"],"expectedRevision":1,"intent":"Updated"}),
    );
    assert_eq!(updated["notice"]["revision"], 2);
    let board = f.call("board", json!({}));
    assert_eq!(board["summary"].as_str().unwrap().lines().count(), 1);
    let closed = f.call("notice_close", json!({"id":n["id"]}));
    assert_eq!(closed["notice"]["state"], "closed");
    assert_eq!(
        f.call("notice_close", json!({"id":n["id"]}))["notice"],
        closed["notice"]
    );
    assert_eq!(f.call("board", json!({}))["notices"], json!([]));
    let events = &f.store.state.pending;
    assert_eq!(events.len(), 3);
    for event in events {
        assert_eq!(event.kind, EventKind::NoticeChanged);
        assert!(!event
            .project("fixture", 1, f.clock.utc)
            .unwrap()
            .to_string()
            .contains("Shared work"));
    }
}
#[test]
// Contract: simultaneous advisory claims both succeed and warn, including same-source sessions.
fn conflicts_never_reserve_or_block() {
    let mut f = Fixture::new();
    let first = f.post();
    let second=f.call("notice_post",json!({"intent":"Parallel work","resources":["app:installed"],"expectedDurationSeconds":600}));
    assert_eq!(second["notice"]["state"], "active");
    assert_eq!(second["conflicts"][0]["noticeId"], first["id"]);
    let warnings = f.store.conflicts(
        &[ResourceKey::parse("app:installed").unwrap()],
        None,
        f.clock,
    );
    assert_eq!(warnings.len(), 2);
    assert_eq!(warnings[0]["inactivityAgeSeconds"], 0);
    f.call("notice_close", json!({"id":first["id"]}));
    assert_eq!(
        f.store
            .conflicts(
                &[ResourceKey::parse("app:installed").unwrap()],
                None,
                f.clock
            )
            .len(),
        1
    );
}
#[test]
// Contract: injected elapsed time withdraws notices after six inactive hours; duration and another source's pull do not renew them.
fn inactivity_owner_activity_and_restart() {
    let mut f = Fixture::new();
    let n = f.post();
    f.advance(store::INACTIVE_MS - 1000);
    assert_eq!(f.board(&n["id"])["notices"][0]["state"], "active");
    f.store.activity(&f.actor, f.clock);
    f.store.flush(f.clock).unwrap();
    let active = f.board(&n["id"])["notices"][0]["lastActiveAt"].clone();
    f.store = Store::open(f.path.join("state.json")).unwrap();
    assert_eq!(f.board(&n["id"])["notices"][0]["lastActiveAt"], active);
    assert_eq!(
        f.board(&n["id"])["notices"][0]["activityCoverage"],
        "restart-gap"
    );
    f.advance(store::INACTIVE_MS);
    let other = Principal::Source {
        source_id: "other".into(),
        account_id: None,
    };
    f.store.activity(&other, f.clock);
    let expired = f.board(&n["id"]);
    assert_eq!(expired["notices"][0]["state"], "withdrawn");
    assert_eq!(expired["notices"][0]["closedReason"], "owner-inactive");
}
#[test]
// Contract: linked running observation keeps a notice alive; interrupted predecessors and replayed terminals cannot close a successor.
fn thread_end_and_replacement_successor() {
    let mut f = Fixture::new();
    let n = f.post();
    f.link(&n);
    f.advance(store::INACTIVE_MS);
    f.store
        .observe("thread-a", "turn-a", "running", f.clock, true);
    assert_eq!(f.board(&n["id"])["notices"][0]["state"], "active");
    f.store
        .observe("thread-a", "turn-a", "interrupted", f.clock, true);
    assert_eq!(f.board(&n["id"])["notices"][0]["state"], "active");
    f.store.flush(f.clock).unwrap();
    f.store = Store::open(f.path.join("state.json")).unwrap();
    f.store.successor("thread-a", "turn-a", "turn-b", &f.actor);
    f.store
        .observe("thread-a", "turn-b", "running", f.clock, true);
    f.store
        .observe("thread-a", "turn-a", "completed", f.clock, false);
    assert_eq!(
        f.board(&n["id"])["notices"][0]["threadLinks"][0]["observedTurnId"],
        "turn-b"
    );
    assert_eq!(f.board(&n["id"])["notices"][0]["state"], "active");
    f.advance(1000);
    f.store
        .observe("thread-a", "turn-b", "completed", f.clock, true);
    let ended = f.board(&n["id"]);
    assert_eq!(ended["notices"][0]["closedReason"], "threads-ended");
    f.advance(1000);
    f.store
        .observe("thread-a", "turn-b", "completed", f.clock, true);
    assert_eq!(
        f.board(&n["id"])["notices"][0]["lastActiveAt"],
        ended["notices"][0]["lastActiveAt"]
    );
}
#[test]
// Contract: source revocation ends claims without refreshing age; restart cannot revive persisted running evidence.
fn revocation_and_running_restart_gap() {
    let mut f = Fixture::new();
    let n = f.post();
    f.link(&n);
    f.drain();
    f.advance(60_000);
    f.store = Store::open(f.path.join("state.json")).unwrap();
    let historical = f.board(&n["id"]);
    assert_eq!(
        historical["notices"][0]["threadLinks"][0]["scopeState"],
        "unknown"
    );
    assert_eq!(historical["notices"][0]["inactivityAgeSeconds"], 60);
    f.store.maintain(&["source-a".into()], f.clock).unwrap();
    let revoked = f.board(&n["id"]);
    assert_eq!(revoked["notices"][0]["closedReason"], "source-revoked");
    assert_eq!(revoked["notices"][0]["lastActiveAt"], n["lastActiveAt"]);
    assert!(f
        .store
        .conflicts(
            &[ResourceKey::parse("app:installed").unwrap()],
            None,
            f.clock
        )
        .is_empty());
}
#[test]
// Contract: uncertain clocks disclose unknown age and never invent activity or expire a notice early.
fn clock_gap_never_fabricates_activity() {
    let mut f = Fixture::new();
    let n = f.post();
    f.clock.utc += store::INACTIVE_MS * 2;
    f.clock.certain = false;
    f.store.activity(&f.actor, f.clock);
    let board = f.board(&n["id"]);
    assert_eq!(board["notices"][0]["state"], "active");
    assert!(board["notices"][0]["inactivityAgeSeconds"].is_null());
    assert_eq!(board["notices"][0]["activityCoverage"], "clock-uncertain");
    assert_eq!(board["notices"][0]["lastActiveAt"], n["lastActiveAt"]);
}
#[test]
// Contract: blockers retain active, uncertain, stale and explicit cleared states; stale never emits recovery.
fn blocker_states_and_evidence() {
    let mut f = Fixture::new();
    let blocker=f.call("blocker_open",json!({"resources":["app:installed"],"causeCode":"fixture","summary":"Shared resource needs inspection"}))["blocker"].clone();
    f.store.maintain(&["source-a".into()], f.clock).unwrap();
    assert_eq!(f.board(&blocker["id"])["blockers"][0]["state"], "uncertain");
    f.advance(store::INACTIVE_MS);
    let stale = f.board(&blocker["id"])["blockers"][0].clone();
    assert_eq!(stale["state"], "stale");
    assert!(stale["clearedAt"].is_null());
    let args = json!({"id":blocker["id"],"expectedRevision":stale["revision"],"reason":"Non-code recovery observed","evidenceIds":["receipt-fixture"],"suggestedNextStep":"inspect"});
    let cleared = f.call("blocker_clear", args);
    assert_eq!(cleared["blocker"]["state"], "cleared");
    assert_eq!(cleared["recoverySelection"]["reason"], "stale-blocker");
    assert!(cleared["blocker"]["fixingCommit"].is_null());
    assert!(validate(
        "blocker_clear",
        &json!({"id":"b","expectedRevision":1,"evidenceIds":[],"suggestedNextStep":"inspect"})
    )
    .is_err());
    assert!(f
        .store
        .state
        .pending
        .iter()
        .all(|e| e.kind == EventKind::BlockerChanged));
}
#[test]
// Contract: logical sessions belong to a source and board pagination detects changed lifecycle and authority scopes.
fn sessions_and_board_pagination() {
    let mut f = Fixture::new();
    let session = f.call("coordination_session", json!({"action":"register"}))["session"].clone();
    let a=f.call("notice_post",json!({"sessionId":session["id"],"intent":"First","resources":["app:installed"],"expectedDurationSeconds":60}));
    f.post();
    assert_eq!(a["notice"]["ownerSessionId"], session["id"]);
    let page = f.call("board", json!({"limit":1}));
    let next = f.call("board", json!({"limit":1,"cursor":page["nextCursor"]}));
    assert_eq!(next["notices"].as_array().unwrap().len(), 1);
    assert!(next["nextCursor"].is_null());
    f.call("notice_close", json!({"id":a["notice"]["id"]}));
    assert_eq!(
        f.call("board", json!({"limit":1,"cursor":page["nextCursor"]}))["error"]["code"],
        "COORDINATION_CURSOR_EXPIRED"
    );
    assert_eq!(
        f.call(
            "coordination_session",
            json!({"action":"close","sessionId":session["id"]})
        )["session"]["state"],
        "closed"
    );
}

#[test]
// Contract: unverified or other-source turns never inherit a notice; delayed successor terminal evidence closes only the evidenced scope.
fn successor_requires_owner_evidence_and_handles_projection_order() {
    let mut f = Fixture::new();
    let n = f.post();
    f.link(&n);
    f.store
        .observe("thread-a", "turn-b", "running", f.clock, true);
    assert_eq!(
        f.board(&n["id"])["notices"][0]["threadLinks"][0]["observedTurnId"],
        "turn-a"
    );
    let other = Principal::Source {
        source_id: "source-b".into(),
        account_id: None,
    };
    f.store.successor("thread-a", "turn-a", "turn-b", &other);
    assert_eq!(
        f.board(&n["id"])["notices"][0]["threadLinks"][0]["observedTurnId"],
        "turn-a"
    );
    f.store
        .observe("thread-a", "turn-b", "completed", f.clock, false);
    f.store.checkpoint_observation(f.clock).unwrap();
    f.store = Store::open(f.path.join("state.json")).unwrap();
    f.store.successor("thread-a", "turn-a", "turn-b", &f.actor);
    assert_eq!(
        f.board(&n["id"])["notices"][0]["closedReason"],
        "threads-ended"
    );
}
#[test]
// Contract: durable resume receipts and native retry records emit metadata-only predecessor/successor pairs.
fn successor_observer_contract() {
    let resource = ResourceKey::parse("app:installed").unwrap();
    let origin = json!({"sourceId":"source-a","ingressId":"fixture","authType":"oauth"});
    let row = json!({"operation":"resume","state":"completed","requestId":"resume-request","threadId":"thread-a","turnId":"next-turn","origin":origin,"arguments":{"turnId":"old-turn","prompt":"private content"}});
    let inputs = observers::inputs_on(observers::Owner::Receipt, &row, resource.clone()).unwrap();
    assert_eq!(inputs[0].kind, EventKind::TurnSuccessor);
    assert_eq!(
        inputs[0].thread_refs[0].turn_id.as_deref(),
        Some("old-turn")
    );
    assert_eq!(
        inputs[0].thread_refs[1].turn_id.as_deref(),
        Some("next-turn")
    );
    assert!(!serde_json::to_string(&inputs)
        .unwrap()
        .contains("private content"));
    let retry = json!({"dispatchSource":"native-retry","retryOf":"old-turn","requestId":"retry-request","threadId":"thread-a","turnId":"next-turn","origin":origin});
    let inputs = observers::inputs_on(observers::Owner::Dispatch, &retry, resource).unwrap();
    assert_eq!(inputs.len(), 1);
    assert_eq!(inputs[0].kind, EventKind::TurnSuccessor);
}
#[tokio::test]
// Contract: blocker fixingCommit accepts an existing local commit and rejects missing objects, blobs, unregistered projects and option injection.
async fn fixing_commit_is_verified_locally() {
    let f = Fixture::new();
    std::fs::create_dir_all(&f.path).unwrap();
    let git = |args: &[&str]| {
        let out = std::process::Command::new("git")
            .arg("-C")
            .arg(&f.path)
            .args(args)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env(
                "GIT_CONFIG_GLOBAL",
                if cfg!(windows) { "NUL" } else { "/dev/null" },
            )
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8(out.stdout).unwrap().trim().to_owned()
    };
    git(&["init", "--quiet"]);
    git(&[
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--quiet",
        "--allow-empty",
        "-m",
        "Fixture",
    ]);
    let oid = git(&["rev-parse", "HEAD"]);
    let registry = json!({"projects":[{"id":"fixture-project","roots":[{"path":f.path}]}]});
    verify_fix_in(&json!({"projectId":"fixture-project","oid":oid}), &registry)
        .await
        .unwrap();
    let tree = git(&["rev-parse", "HEAD^{tree}"]);
    for fix in [
        json!({"projectId":"fixture-project","oid":"0".repeat(40)}),
        json!({"projectId":"fixture-project","oid":tree}),
        json!({"projectId":"other","oid":oid}),
        json!({"projectId":"fixture-project","oid":"--help"}),
    ] {
        assert!(verify_fix_in(&fix, &registry).await.is_err());
    }
}
#[test]
// Contract: bounded bulletin storage preserves readable records on failed atomic saves ; lifecycle events fit the wire budget.
fn persistence_failure_and_event_size_bounds() {
    let mut f = Fixture::new();
    let n = f.post();
    let temp = f.path.join("state.tmp");
    std::fs::create_dir(&temp).unwrap();
    let result = f.call("notice_close", json!({"id":n["id"]}));
    assert_eq!(result["state"], "failed");
    assert_eq!(f.board(&n["id"])["notices"][0]["state"], "active");
    std::fs::remove_dir(&temp).unwrap();
    f.store = Store::open(f.path.join("state.json")).unwrap();
    assert_eq!(f.board(&n["id"])["notices"][0]["state"], "active");
    let keys: Vec<_> = (0..16)
        .map(|i| format!("lane:{}/{i}{}", "p".repeat(128), "n".repeat(124)))
        .collect();
    let result = f.call(
        "notice_update",
        json!({"id":n["id"],"expectedRevision":1,"resources":keys}),
    );
    assert_eq!(result["notice"]["revision"], 2);
    for event in &f.store.state.pending {
        assert!(
            event
                .project("epoch", 1, f.clock.utc)
                .unwrap()
                .to_string()
                .len()
                < 2048
        );
    }
}

#[test]
fn lane_errors_offer_registered_qualified_examples() {
    // Regression: ax-327e2d84 lane shorthand errors omitted the registered project spelling.
    let error = lane_resource_error("worker", &json!({"projects":[{"id":"fixture-project"}]}));
    assert!(error.contains("lane:fixture-project/worker"));
    let result = failure(error, "notice_post");
    assert_eq!(result["next"]["op"], "projects");
    assert_eq!(result["next"]["args"], json!({}));
}
#[test]
fn linked_running_thread_is_observed_at_post() {
    // Regression: ax-48eb2fbb a just-posted running-thread notice showed unknown liveness until the next tick.
    let mut f = Fixture::new();
    let mut links = vec![Link {
        session_binding_id: None,
        thread_id: "thread-a".into(),
        observed_turn_id: Some("turn-a".into()),
        scope_state: "unknown".into(),
        observed_at: None,
        terminals: Default::default(),
    }];
    apply_link_observations(
        &mut links,
        &[("thread-a".into(), "turn-a".into(), "inProgress".into())],
        f.clock,
    );
    let args = json!({"requestId":id(),"intent":"Work","resources":["app:installed"],"expectedDurationSeconds":60});
    let result = f
        .store
        .mutate("notice_post", &args, &f.actor, links, f.clock)
        .unwrap();
    let board = f.board(&result["notice"]["id"]);
    assert_eq!(
        board["notices"][0]["threadLinks"][0]["scopeState"],
        "running"
    );
    assert_ne!(
        board["notices"][0]["activityCoverage"],
        "thread-observation-gap"
    );
}
