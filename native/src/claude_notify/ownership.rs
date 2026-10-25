//! Observed writer handoffs. Observation never loads, releases, or acquires a writer.
use super::*;

fn path(thread: &str) -> Result<PathBuf> {
    uuid::Uuid::parse_str(thread).map_err(|_| "INVALID_THREAD_ID")?;
    Ok(root()
        .join("execution/handoffs")
        .join(format!("{thread}.json")))
}
pub(crate) fn read(thread: &str) -> Result<Value> {
    let path = path(thread)?;
    if path.exists() {
        load(&path)
    } else {
        Ok(json!({"currentOwner":"unknown","history":[]}))
    }
}
pub(crate) async fn observe(thread: &str, ownership: &Value) -> Result<Value> {
    let owner = ownership["owner"]
        .as_str()
        .unwrap_or(if ownership["state"] == "unheld" {
            "unheld"
        } else {
            "unknown"
        });
    let (mut state, bindings) = {
        let _guard = LOCK.lock().await;
        let mut state = read(thread)?;
        let all = records(&directory())?;
        let bindings = all
            .iter()
            .filter(|b| {
                b.thread_id == thread
                    && b.scope_end.is_none()
                    && !b.continuation_bound
                    && (b.agent.is_empty() || b.agent == "codex")
            })
            .cloned()
            .collect::<Vec<_>>();
        let previous = state["currentOwner"]
            .as_str()
            .filter(|o| *o != "unknown")
            .map(str::to_owned)
            .or_else(|| state["lastKnownOwner"].as_str().map(str::to_owned))
            .or_else(|| {
                let p = root().join("execution").join(format!("{thread}.json"));
                (owner == "desktop")
                    .then(|| load(&p).ok())
                    .flatten()
                    .and_then(|v| v["owner"].as_str().map(str::to_owned))
            });
        if owner != "unknown" {
            if let Some(previous) = previous.filter(|p| p != owner) {
                let history = state["history"]
                    .as_array_mut()
                    .ok_or("INVALID_HANDOFF_HISTORY")?;
                let id = hash(json!([thread, history.len(), previous, owner]).to_string());
                history.push(
                    json!({"eventId":id,"from":previous,"to":owner,"observedAt":now(),
                    "evidence":ownership["evidence"],"timeBasis":"observed-not-transition-time"}),
                );
            }
            state["currentOwner"] = json!(owner);
            state["lastKnownOwner"] = json!(owner);
        } else {
            state["currentOwner"] = json!("unknown");
        }
        state["state"] = ownership["state"].clone();
        state["observedAt"] = json!(now());
        save(&path(thread)?, &state)?;
        (state, bindings)
    };
    // History is durable before events. Re-observation repairs an interrupted
    // enqueue using stable, source-scoped IDs across successor bindings.
    for mut b in bindings {
        process(
            &directory(),
            &LOCK,
            &mut b,
            &json!({"state":"unconfirmed","handoffs":state["history"]}),
        )
        .await?;
    }
    state["ownership"] = ownership.clone();
    Ok(state)
}

pub(crate) async fn end_scope(thread: &str, reason: &str) -> Result<()> {
    let _guard = LOCK.lock().await;
    for mut b in records(&directory())?
        .into_iter()
        .filter(|b| b.thread_id == thread && b.scope_end.is_none())
    {
        b.scope_end = Some(reason.into());
        persist(&directory(), &b)?;
    }
    Ok(())
}
