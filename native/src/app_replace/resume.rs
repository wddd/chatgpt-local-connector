//! Replacement journals and triggers the existing interrupted-turn resume contract.
use super::*;

/// Native interrupted-turn recovery carries identity only, never new user input.
pub fn resume_request(thread: &str, turn: &str, request: &str) -> Value {
    json!({"threadId":thread,"turnId":turn,"requestId":request,"waitMs":0})
}

/// Interaction owners are native owners from codex_pending, not dispatch owners.
pub fn interaction_work(pending: &[Value]) -> Value {
    let mut work = json!({"blocking":[],"unaffected":[],"stale":[]});
    for request in pending {
        let stale = request["stale"] == true;
        let group = if stale {
            "stale"
        } else if request["owner"] == "desktop" {
            "unaffected"
        } else {
            "blocking"
        };
        work[group].as_array_mut().unwrap().push(json!({
            "kind":"interaction","agent":"codex","taskId":request["params"]["threadId"],
            "turnId":request["params"]["turnId"],"owner":request["owner"].as_str().unwrap_or("unknown"),
            "question":request,"reason":if stale {"turn-terminal"} else {"pending-interaction"}
        }));
    }
    work
}

pub(crate) async fn snapshot(control: &crate::control::Control) -> Result<Value> {
    let health = control.health().await;
    let records = control.task_records().await?;
    // Copy only cutoff metadata, not timelines or transcript contents. Release the
    // event lock before ownership probes, which may themselves publish events.
    let (observations, pending) = {
        let events = control.events.lock().await;
        (
            events
                .timelines
                .iter()
                .map(|(thread, timeline)| {
                    (
                        thread.clone(),
                        timeline.turn.clone(),
                        timeline.status.clone(),
                        timeline.observation_lost,
                    )
                })
                .collect::<Vec<_>>(),
            events.pending_interactions(),
        )
    };
    let work = interaction_work(&pending);
    let terminal_turns: Vec<_> = observations
        .iter()
        .filter(|(_, _, state, _)| {
            matches!(
                state.as_str(),
                "completed" | "failed" | "cancelled" | "interrupted"
            )
        })
        .map(|(thread, turn, _, _)| json!({"threadId":thread,"turnId":turn}))
        .collect();
    let mut turns = Vec::new();
    for (thread, turn, state, observation_lost) in observations {
        let interactions: Vec<_> = work["blocking"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|p| p["taskId"] == thread && p["turnId"] == turn)
            .map(|p| p["question"].clone())
            .collect();
        if turn.is_empty()
            || matches!(
                state.as_str(),
                "completed" | "failed" | "cancelled" | "interrupted"
            )
            || (!matches!(state.as_str(), "running" | "inProgress")
                && interactions.is_empty()
                && !observation_lost)
        {
            continue;
        }
        if !control.effective_background(&thread).await? {
            continue;
        }
        let binding = crate::claude_notify::replacement_turn_binding(&thread, Some(&turn))?;
        let mut entry = json!({"threadId":thread,"turnId":turn,"executionOwner":"connector",
            "binding":binding,"dispatch":binding["dispatch"],"configuration":{"model":binding["model"],"turn":binding["turn"]},"pendingInteractions":interactions,
            "state":"recorded","operation":"codex_resume","observedAt":now()});
        let reason = if !interactions.is_empty() {
            Some("pending-interaction-cannot-reconnect")
        } else if health["activeWrites"] != 0 {
            Some("write-in-flight")
        } else if records
            .iter()
            .any(|r| r["threadId"] == thread && r["state"] == "unconfirmed")
        {
            Some("uncertain-write")
        } else if observation_lost {
            Some("observation-lost")
        } else if !binding.is_object() {
            Some("dispatch-binding-missing")
        } else {
            None
        };
        if let Some(reason) = reason {
            entry["state"] = json!("needs-attention");
            entry["reason"] = json!(reason);
        } else {
            entry["continuation"] = resume_request(&thread, &turn, &id());
        }
        turns.push(entry);
    }
    Ok(
        json!({"backendSession":control.session,"turns":turns,"activeWrites":health["activeWrites"],
        "pendingInteractions":work["blocking"].as_array().unwrap().len(),"interactionWork":work,"terminalTurns":terminal_turns,"observedAt":now()}),
    )
}

// Core writes a final cutoff snapshot before closing its pipes. The worker remains
// the sole status.json writer and adopts this snapshot only after both owners exit.
pub(crate) async fn capture_shutdown(control: &crate::control::Control) -> Result<()> {
    let receipt = status()?;
    if receipt["state"] == "stopping"
        && receipt["shutdownRequested"] == true
        && receipt["coreInstance"] == control.session
    {
        let snapshot = snapshot(control).await?;
        save(
            &job(string(&receipt, "id"))?.join("shutdown-snapshot.json"),
            &snapshot,
        )?;
    }
    Ok(())
}

pub fn apply_snapshot(receipt: &mut Value, snapshot: Value) {
    let previous = receipt["interruptedTurns"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut entries = snapshot["turns"].as_array().cloned().unwrap_or_default();
    for entry in &mut entries {
        if let Some(old) = previous
            .iter()
            .find(|old| old["threadId"] == entry["threadId"] && old["turnId"] == entry["turnId"])
        {
            if entry["state"] == "recorded" && old["continuation"].is_object() {
                entry["continuation"] = old["continuation"].clone();
            }
        }
        if entry["threadId"] == receipt["continuation"]["threadId"] {
            // Explicit new instructions retain the existing codex_send contract.
            // They replace automatic resume, rather than adding a second turn.
            if entry["state"] == "recorded" {
                entry["state"] = json!("explicit-continuation");
                entry["operation"] = json!("codex_send");
                entry["continuation"] = receipt["continuation"].clone();
            } else {
                receipt["continuationState"] = json!("needs-attention");
                receipt["continuationError"] = entry["reason"].clone();
            }
        }
    }
    for mut old in previous {
        if !entries
            .iter()
            .any(|entry| entry["threadId"] == old["threadId"] && entry["turnId"] == old["turnId"])
        {
            old["state"] = json!("finished-before-shutdown");
            entries.push(old);
        }
    }
    receipt["interruptedTurns"] = json!(entries);
    receipt["interruptionSnapshot"] = snapshot;
}

pub(super) fn status_details(receipt: &mut Value) -> Result<()> {
    for entry in receipt["interruptedTurns"]
        .as_array_mut()
        .into_iter()
        .flatten()
    {
        if entry["operation"] != "codex_resume" {
            continue;
        }
        let request = string(&entry["continuation"], "requestId");
        if uuid::Uuid::parse_str(request).is_err() {
            continue;
        }
        let store = crate::kernel::receipts::ReceiptStore::new("");
        if store.path(request)?.exists() {
            // The ordinary receipt reader marks reservations from a lost Core
            // unconfirmed. Offline status is read-only and never resubmits them.
            let session = load(&root().join("app/native.json")).unwrap_or(Value::Null);
            entry["resumeReceipt"] =
                crate::egress::receipt(store.read(request, string(&session, "instance"))?);
        }
    }
    receipt["resumedCount"] = json!(resumed_count(receipt));
    Ok(())
}

pub(super) fn resumed_count(receipt: &Value) -> usize {
    receipt["interruptedTurns"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|entry| {
            let result = entry.get("resumeReceipt").unwrap_or(&entry["receipt"]);
            result["state"] == "completed"
                && result["turnId"].as_str().is_some_and(|v| !v.is_empty())
        })
        .count()
}

/// Only exact observed turns with a complete continuation cease blocking normal replacement.
pub fn resumable_waiting(mut waiting: Value, snapshot: &Value) -> Value {
    waiting = interaction_waiting(waiting, snapshot);
    let mut resumes = Vec::new();
    if let Some(blockers) = waiting["blockingTurns"].as_array_mut() {
        blockers.retain_mut(|blocker| {
            let entry = snapshot["turns"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|entry| {
                    blocker["agent"] == "codex"
                        && blocker["executionOwner"] == "connector"
                        && entry["threadId"] == blocker["taskId"]
                        && entry["turnId"] == blocker["turnId"]
                });
            if let Some(entry) = entry {
                if entry["state"] == "recorded" {
                    resumes.push(blocker.clone());
                    return false;
                }
                blocker["question"] = entry["pendingInteractions"]
                    .as_array()
                    .and_then(|v| v.first())
                    .cloned()
                    .unwrap_or(Value::Null);
                blocker["reason"] = entry["reason"].clone();
            }
            true
        });
    }
    waiting["willResume"] = json!(resumes);
    waiting["continuableTurns"] = snapshot["turns"].clone();
    waiting["idle"] = json!(
        waiting["unknownActivity"] == false
            && waiting["blockingTurns"]
                .as_array()
                .is_some_and(|v| v.is_empty())
            && waiting["activeWrites"] == 0
            && waiting["pendingInteractions"] == 0
    );
    waiting
}

/// Apply interaction classification even when automatic turn resumption is disabled.
pub fn interaction_waiting(mut waiting: Value, snapshot: &Value) -> Value {
    if let Some(blockers) = waiting["blockingTurns"].as_array_mut() {
        blockers.retain(|blocker| {
            !snapshot["terminalTurns"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|turn| {
                    blocker["agent"] == "codex"
                        && blocker["taskId"] == turn["threadId"]
                        && blocker["turnId"] == turn["turnId"]
                })
        });
    }
    if let Some(blocking) = snapshot["interactionWork"]["blocking"].as_array() {
        waiting["pendingInteractions"] = json!(blocking.len());
        waiting["blockingInteractions"] = json!(blocking);
        waiting["staleInteractions"] = snapshot["interactionWork"]["stale"].clone();
        let mut unaffected = waiting["unaffected"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        unaffected.retain(|item| item["kind"] != "interaction");
        unaffected.extend(
            snapshot["interactionWork"]["unaffected"]
                .as_array()
                .into_iter()
                .flatten()
                .cloned(),
        );
        waiting["unaffected"] = json!(unaffected);
        waiting["idle"] = json!(
            waiting["unknownActivity"] == false
                && waiting["blockingTurns"]
                    .as_array()
                    .is_some_and(|v| v.is_empty())
                && waiting["activeWrites"] == 0
                && blocking.is_empty()
        );
    }
    waiting
}

// Read only durable local intent. Remote callers cannot supply replacement attribution.
pub(crate) fn continuation_entry(thread: &str, request: &str) -> Result<Option<Value>> {
    let Ok(entries) = file_cache::entries(&directory()) else {
        return Ok(None);
    };
    for file in entries.iter() {
        let path = file.path.join("status.json");
        if !path.is_file() {
            continue;
        }
        let receipt = load(&path)?;
        for entry in receipt["interruptedTurns"].as_array().into_iter().flatten() {
            if entry["threadId"] == thread
                && entry["binding"].is_object()
                && entry["operation"] == "codex_resume"
                && entry["continuation"]["requestId"] == request
                && matches!(
                    string(entry, "state"),
                    "submitting" | "receipt-returned" | "unconfirmed"
                )
            {
                return Ok(Some(entry.clone()));
            }
        }
    }
    Ok(None)
}

#[cfg(target_os = "macos")]
pub(super) async fn deliver(path: &Path, receipt: &mut Value) -> Result<()> {
    let count = receipt["interruptedTurns"].as_array().map_or(0, Vec::len);
    for index in 0..count {
        if receipt["interruptedTurns"][index]["state"] != "recorded" {
            continue;
        }
        let args = receipt["interruptedTurns"][index]["continuation"].clone();
        receipt["interruptedTurns"][index]["state"] = json!("submitting");
        save_status(path, receipt)?;
        let result = crate::cli_acceptance::control("codex_resume", args).await;
        let entry = &mut receipt["interruptedTurns"][index];
        match result {
            Ok(result) => {
                entry["state"] = json!("receipt-returned");
                entry["receipt"] = result;
            }
            Err(error) => {
                entry["state"] = json!("unconfirmed");
                entry["error"] = json!(error);
            }
        }
        save_status(path, receipt)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_interactions_are_stale_without_losing_native_owners_or_late_answers() {
        // Regression: an unanswered asynchronous question from a finished turn held replacement in settling for 288 seconds.
        for status in ["completed", "failed", "cancelled", "interrupted"] {
            for owner in ["desktop", "connector-app-server"] {
                let mut events = Events::default();
                let timeline = events.timelines.entry("thread".into()).or_default();
                timeline.codex(
                    "turn/completed",
                    &json!({"turn":{"id":"old","status":status}}),
                    "2026-01-01T00:00:00Z",
                );
                timeline.codex(
                    "turn/started",
                    &json!({"turn":{"id":"new"}}),
                    "2026-01-01T01:00:00Z",
                );
                let question = json!({"id":"question","owner":owner,"method":"request_user_input_async","canRespond":true,"params":{"threadId":"thread","turnId":"old"},"next":{"op":"codex_respond","args":{"id":"question"}}});
                events.pending.insert("question".into(), question.clone());
                let pending = events.pending_interactions();
                assert_eq!(pending[0]["stale"], true);
                assert_eq!(pending[0]["owner"], owner);
                assert_eq!(pending[0]["canRespond"], true);
                assert_eq!(pending[0]["next"]["args"], question["next"]["args"]);
                let work = interaction_work(&pending);
                assert_eq!(work["blocking"], json!([]));
                assert_eq!(work["unaffected"], json!([]));
                assert_eq!(work["stale"][0]["owner"], pending[0]["owner"]);
                assert_eq!(work["stale"][0]["turnId"], "old");
                assert_eq!(work["stale"][0]["question"], pending[0]);
            }
        }
    }

    #[test]
    fn desktop_interactions_never_block_even_when_dispatch_is_connector_owned() {
        // Regression: settle classified a Desktop-owned question as connector-owned using the thread's dispatch owner.
        let activity = json!({"activeAgents":["codex"],"agents":{"codex":{"sessions":[{"id":"thread","turnId":"turn","source":"codex-thread"}]}}});
        let tasks =
            json!({"records":[{"threadId":"thread","turnId":"turn","executionOwner":"connector"}]});
        let pending = vec![
            json!({"owner":"desktop","method":"item/tool/requestUserInput","params":{"threadId":"thread","turnId":"turn"}}),
        ];
        let snapshot = json!({"interactionWork":interaction_work(&pending),"turns":[{"threadId":"thread","turnId":"turn","state":"recorded"}]});
        let result = resumable_waiting(
            waiting(
                &activity,
                &json!({"core":{"activeWrites":0,"pendingInteractions":1}}),
                &tasks,
            ),
            &snapshot,
        );
        assert_eq!(result["idle"], true);
        assert_eq!(result["pendingInteractions"], 0);
        assert_eq!(result["willResume"][0]["turnId"], "turn");
        let work = project(&json!({"state":"waiting-for-turns","waiting":result}))["work"].clone();
        assert_eq!(work["blocking"], json!([]));
        assert_eq!(work["unaffected"][0]["owner"], pending[0]["owner"]);
        assert_eq!(work["unaffected"][0]["question"], pending[0]);
    }

    #[test]
    fn finished_turn_questions_settle_without_automatic_resumption() {
        // Regression: disabling interrupted-turn resumption must not restore stale interaction blockers.
        let pending = vec![
            json!({"owner":"desktop","stale":true,"params":{"threadId":"thread","turnId":"old"}}),
        ];
        let snapshot = json!({"interactionWork":interaction_work(&pending),"terminalTurns":[{"threadId":"thread","turnId":"old"}]});
        let initial = json!({"blockingTurns":[{"agent":"codex","taskId":"thread","turnId":"old","executionOwner":"connector"}],"unaffected":[],"unknownActivity":false,"activeWrites":0,"pendingInteractions":1});
        let result = interaction_waiting(initial, &snapshot);
        assert_eq!(result["idle"], true);
        assert_eq!(result["blockingTurns"], json!([]));
        let projected = project(&json!({"state":"waiting-for-turns","waiting":result}));
        assert_eq!(projected["work"]["blocking"], json!([]));
        assert_eq!(projected["work"]["stale"][0]["question"], pending[0]);
        assert_eq!(unified::compact(&projected)["work"]["stale"]["count"], 1);
    }

    #[test]
    fn active_and_unknown_interactions_remain_blocking_with_their_native_owners() {
        // Regression: filtering stale and Desktop interactions must preserve active native callbacks and unknown activity.
        let mut events = Events::default();
        events.timelines.entry("thread".into()).or_default().codex(
            "turn/started",
            &json!({"turn":{"id":"active"}}),
            "2026-01-01T00:00:00Z",
        );
        for (key, owner, turn) in [
            ("active", "connector-app-server", "active"),
            ("unknown", "unknown", "unobserved"),
        ] {
            events.pending.insert(
                key.into(),
                json!({"id":key,"owner":owner,"params":{"threadId":"thread","turnId":turn}}),
            );
        }
        let pending = events.pending_interactions();
        assert!(pending.iter().all(|request| request["stale"] == false));
        let active = pending
            .iter()
            .find(|request| request["id"] == "active")
            .unwrap();
        let snapshot = json!({"interactionWork":interaction_work(&pending),"turns":[{"threadId":"thread","turnId":"active","state":"needs-attention","reason":"pending-interaction-cannot-reconnect","pendingInteractions":[active]}]});
        let mut initial = waiting(
            &json!({"activeAgents":[]}),
            &json!({"core":{"activeWrites":0,"pendingInteractions":2}}),
            &json!({"records":[]}),
        );
        initial["blockingTurns"] = json!([{"agent":"codex","taskId":"thread","turnId":"active","executionOwner":"connector"}]);
        let result = resumable_waiting(initial.clone(), &snapshot);
        assert_eq!(result["idle"], false);
        assert_eq!(result["pendingInteractions"], 2);
        let work = project(&json!({"state":"waiting-for-turns","waiting":result}))["work"].clone();
        assert_eq!(work["blocking"].as_array().unwrap().len(), 2);
        for request in pending {
            assert!(work["blocking"]
                .as_array()
                .unwrap()
                .iter()
                .any(|row| row["owner"] == request["owner"] && row["question"] == request));
        }
        assert_eq!(
            resumable_waiting(initial, &json!({"turns":[]}))["idle"],
            false
        );
    }

    #[test]
    fn stale_interaction_cleanup_preserves_newer_turns_writes_and_unknown_activity() {
        // Regression: stale questions from an older turn must not hide newer work or unsafe shutdown conditions.
        let snapshot = json!({"interactionWork":interaction_work(&[json!({"owner":"desktop","stale":true,"params":{"threadId":"thread","turnId":"old"}})]),"terminalTurns":[{"threadId":"thread","turnId":"old"}],"turns":[{"threadId":"thread","turnId":"new","state":"recorded"}]});
        let initial = json!({"blockingTurns":[{"agent":"codex","taskId":"thread","turnId":"new","executionOwner":"connector"}],"unknownActivity":false,"activeWrites":0,"pendingInteractions":1});
        assert_eq!(
            interaction_waiting(initial.clone(), &snapshot)["idle"],
            false
        );
        let resumed = resumable_waiting(initial.clone(), &snapshot);
        assert_eq!(resumed["idle"], true);
        assert_eq!(resumed["willResume"][0]["turnId"], "new");
        for field in ["activeWrites", "unknownActivity"] {
            let mut busy = initial.clone();
            busy[field] = if field == "activeWrites" {
                json!(1)
            } else {
                json!(true)
            };
            assert_eq!(resumable_waiting(busy, &snapshot)["idle"], false);
        }
    }
}
