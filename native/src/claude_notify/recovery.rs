//! Lifecycle events reach inboxes; only affected conversations wake.
use super::*;

pub(super) async fn enqueue(
    dir: &Path,
    lock: &Mutex<()>,
    restart: &str,
    at: i64,
    interrupted: &std::collections::HashSet<(String, String)>,
) -> Result<()> {
    enqueue_notice(dir, lock, restart, at, None, interrupted).await
}
async fn enqueue_notice(
    dir: &Path,
    lock: &Mutex<()>,
    restart: &str,
    at: i64,
    update: Option<(&Value, &str)>,
    interrupted: &std::collections::HashSet<(String, String)>,
) -> Result<()> {
    let _guard = lock.lock().await;
    let mut all = records(dir)?;
    let mut state = State::load(dir)?;
    for target in &mut state.targets {
        target.reachability.expire(at);
    }
    for b in &mut all {
        if let Some(rule) = state.rule(b) {
            governance::apply_rebind(b, rule);
        }
        let interrupted = update.map_or_else(
            || interrupted.contains(&(b.thread_id.clone(), b.turn_id.clone())),
            |(receipt, _)| interrupted_by_update(b, receipt),
        );
        if interrupted {
            let mut changed = false;
            for d in &mut b.deliveries {
                if d.task_state == "cancelled" && d.status == "pending" {
                    d.status = "inbox-only".into();
                    changed = true;
                }
            }
            if changed {
                persist(dir, b)?;
            }
        }
    }
    subscriptions::sync(&mut state, &all);
    state.save(dir)?;
    let subscriptions = state
        .subscriptions
        .iter()
        .filter(|s| !s.source_id.is_empty() && s.active(at.saturating_mul(1000)))
        .collect::<Vec<_>>();
    let mut destinations = Vec::new();
    for s in &subscriptions {
        let key = (s.source_id.clone(), s.channel, s.target.clone());
        if !destinations.contains(&key) {
            destinations.push(key);
        }
    }
    for (source, channel, target) in destinations {
        let subscriptions = subscriptions
            .iter()
            .filter(|s| s.source_id == source && s.channel == channel && s.target == target)
            .collect::<Vec<_>>();
        let members = all
            .iter()
            .enumerate()
            .filter(|(_, b)| b.scope_end.is_none() && subscriptions.iter().any(|s| s.matches(b)))
            .map(|(i, _)| i)
            .collect::<Vec<_>>();
        let initiator = update.and_then(|(receipt, _)| {
            members.iter().copied().find(|&i| {
                let context = &receipt["continuationBinding"];
                context["origin"]["sourceId"] == all[i].source_id
                    && context["threadId"] == all[i].thread_id
                    && context["turnId"] == all[i].turn_id
            })
        });
        let affected = members
            .iter()
            .copied()
            .filter(|&i| {
                let b = &all[i];
                match update {
                    None => interrupted.contains(&(b.thread_id.clone(), b.turn_id.clone())),
                    Some((receipt, "settling")) => {
                        !quiet_terminal(b)
                            && receipt["waiting"]["blockingTurns"]
                                .as_array()
                                .into_iter()
                                .flatten()
                                .any(|row| {
                                    same_turn(b, row)
                                        && (row["question"].is_object() || !b.waiting.is_empty())
                                })
                    }
                    Some((receipt, "outcome")) => interrupted_by_update(b, receipt),
                    _ => false,
                }
            })
            .collect::<Vec<_>>();
        let Some(index) = initiator
            .or_else(|| affected.first().copied())
            .or_else(|| members.first().copied())
        else {
            continue;
        };
        let event_id = hash(json!(["arc-recovered", restart, source, channel, target]).to_string());
        if all
            .iter()
            .filter(|b| b.source_id == source)
            .flat_map(|b| &b.deliveries)
            .any(|d| {
                update.is_none()
                    && (d.event_id == event_id
                        || (d.task_state == "recovered"
                            && d.key.starts_with("recovery:")
                            && d.channel == channel
                            && d.target == target
                            && matches!(d.status.as_str(), "pending" | "sending")))
            })
        {
            continue;
        }
        let names = affected
            .iter()
            .map(|&i| {
                let b = &all[i];
                let resumed = continuation::notice(b, &Value::Null, &all);
                format!(
                    "{} ({}){}",
                    receipt_line(task_title(b), 120),
                    b.thread_id,
                    if resumed.is_object() && resumed["state"] != "unknown" {
                        ": resumed"
                    } else {
                        ""
                    }
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        let recovered_at = chrono::DateTime::from_timestamp(at, 0)
            .ok_or("INVALID_RECOVERY_TIME")?
            .to_rfc3339();
        let message = match update {
            None => format!(
                "ARC recovered at {recovered_at}; interrupted tasks: {}.",
                if names.is_empty() { "none" } else { &names }
            ),
            Some((_, "settling")) => format!(
                "ARC update settling. Answer the pending interaction for: {}.",
                if names.is_empty() {
                    "no tasks in this conversation"
                } else {
                    &names
                }
            ),
            Some((receipt, "outcome")) => {
                let tasks = affected
                    .iter()
                    .map(|&i| {
                        let b = &all[i];
                        let row = receipt["interruptedTurns"]
                            .as_array()
                            .into_iter()
                            .flatten()
                            .find(|row| same_turn(b, row))
                            .expect("affected turn is journaled");
                        let result = row.get("resumeReceipt").unwrap_or(&row["receipt"]);
                        let resumed = result["state"] == "completed"
                            && result["turnId"].as_str().is_some_and(|id| !id.is_empty());
                        format!(
                            "{} ({}): {}",
                            receipt_line(task_title(b), 120),
                            b.thread_id,
                            if resumed {
                                "resumed"
                            } else {
                                "interrupted; inspect update_status"
                            }
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("; ");
                format!(
                    "ARC update {}. {}",
                    string(receipt, "state"),
                    if tasks.is_empty() {
                        "Read update_status for details."
                    } else {
                        &tasks
                    }
                )
            }
            Some((_, phase)) => format!("ARC update {phase}. Read update_status for details."),
        };
        let awaiting_resume = update.is_some_and(|(receipt, phase)| {
            phase == "outcome"
                && affected.iter().any(|&i| {
                    receipt["interruptedTurns"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .any(|row| same_turn(&all[i], row) && resume_pending(row))
                })
        });
        let verified = subscriptions.iter().any(|s| match channel {
            Channel::ClaudeSession => state.targets.iter().any(|t| {
                t.source_id == source
                    && t.channel == channel
                    && t.target == target
                    && t.reachability.state == "verified"
            }),
            Channel::McpEvents => s.webhook.as_ref().is_some_and(|w| w.verified_until > at),
        });
        let wake = verified
            && !awaiting_resume
            && match update {
                Some((_, phase)) if initiator.is_some() => phase == "outcome",
                _ => !affected.is_empty(),
            };
        let recovery =
            json!({"recoveredAt":recovered_at,"affectedTasks":affected.len(),"message":message});
        if let Some((bi, di)) = all.iter().enumerate().find_map(|(bi, b)| {
            (b.source_id == source)
                .then(|| {
                    b.deliveries
                        .iter()
                        .position(|d| d.event_id == event_id)
                        .map(|di| (bi, di))
                })
                .flatten()
        }) {
            // Resume receipts may settle after the worker's terminal outcome.
            // Promote the original inbox event once; never stack a second wakeup.
            let b = &mut all[bi];
            let d = &mut b.deliveries[di];
            if d.status == "inbox-only" && wake {
                d.status = "pending".into();
                d.recovery = recovery;
                inbox_refresh(dir, b)?;
                persist(dir, b)?;
            }
            continue;
        }
        let b = &mut all[index];
        let subscription = subscriptions
            .iter()
            .find(|s| s.matches(b))
            .expect("member has subscription");
        b.deliveries.push(Delivery {
            subscription: subscription.id.clone(),
            channel,
            target,
            event_id,
            key: format!(
                "{}:{restart}",
                if update.is_none() {
                    "recovery"
                } else {
                    "update"
                }
            ),
            created_at: at,
            state: "recovered".into(),
            task_state: "recovered".into(),
            status: if wake { "pending" } else { "inbox-only" }.into(),
            recovery,
            timing: DeliveryTiming {
                queued_at: Some(at.saturating_mul(1000)),
                ..Default::default()
            },
            ..Default::default()
        });
        inbox_append(dir, &source, event(b, b.deliveries.last().unwrap()))?;
        persist(dir, b)?;
    }
    Ok(())
}

fn same_turn(b: &Binding, row: &Value) -> bool {
    (row["threadId"] == b.thread_id || row["taskId"] == b.thread_id)
        && row["turnId"] == b.turn_id
        && row["agent"].as_str().unwrap_or("codex")
            == if b.agent.is_empty() {
                "codex"
            } else {
                &b.agent
            }
}

// The journal proves activity at shutdown, even after the turn has resumed.
pub(super) fn interrupted_by_update(b: &Binding, receipt: &Value) -> bool {
    receipt["shutdownRequested"] == true
        && receipt["interruptedTurns"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|row| same_turn(b, row) && row["state"] != "finished-before-shutdown")
}

pub(super) async fn update(
    dir: &Path,
    lock: &Mutex<()>,
    receipt: &Value,
    phase: &str,
    at: i64,
) -> Result<()> {
    enqueue_notice(
        dir,
        lock,
        &format!("{}:{phase}", string(receipt, "id")),
        at,
        Some((receipt, phase)),
        &Default::default(),
    )
    .await
}

// This is dispatch admission, not completion of the resumed task.
pub(super) fn resume_pending(row: &Value) -> bool {
    let result = row.get("resumeReceipt").unwrap_or(&row["receipt"]);
    matches!(string(result, "state"), "reserved" | "pending" | "running")
}
