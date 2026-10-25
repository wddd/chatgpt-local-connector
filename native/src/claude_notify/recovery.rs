//! One durable recovery wakeup per verified destination, using the shared queue.
use super::*;

pub(super) async fn enqueue(dir: &Path, lock: &Mutex<()>, restart: &str, at: i64) -> Result<()> {
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
    }
    subscriptions::sync(&mut state, &all);
    state.save(dir)?;
    let verified = state
        .subscriptions
        .iter()
        .filter(|s| {
            !s.source_id.is_empty()
                && s.active(at.saturating_mul(1000))
                && match s.channel {
                    Channel::ClaudeSession => state.targets.iter().any(|t| {
                        t.source_id == s.source_id
                            && t.channel == s.channel
                            && t.target == s.target
                            && t.reachability.state == "verified"
                    }),
                    Channel::McpEvents => s.webhook.as_ref().is_some_and(|w| w.verified_until > at),
                }
        })
        .collect::<Vec<_>>();
    let mut destinations = Vec::new();
    for s in &verified {
        let key = (s.source_id.clone(), s.channel, s.target.clone());
        if !destinations.contains(&key) {
            destinations.push(key);
        }
    }
    for (source, channel, target) in destinations {
        let subscriptions = verified
            .iter()
            .filter(|s| s.source_id == source && s.channel == channel && s.target == target)
            .collect::<Vec<_>>();
        let members = all
            .iter()
            .enumerate()
            .filter(|(_, b)| b.scope_end.is_none() && subscriptions.iter().any(|s| s.matches(b)))
            .map(|(i, _)| i)
            .collect::<Vec<_>>();
        let Some(&index) = members
            .iter()
            .max_by_key(|&&i| (!all[i].continuation_bound, all[i].created_at))
        else {
            continue;
        };
        let event_id = hash(json!(["arc-recovered", restart, source, channel, target]).to_string());
        // A pending earlier recovery already wakes this destination. Preserve its
        // event ID and retry credit across rapid restarts instead of stacking notices.
        if all
            .iter()
            .filter(|b| b.source_id == source)
            .flat_map(|b| &b.deliveries)
            .any(|d| {
                d.event_id == event_id
                    || (d.task_state == "recovered"
                        && d.channel == channel
                        && d.target == target
                        && matches!(d.status.as_str(), "pending" | "sending"))
            })
        {
            continue;
        }
        let affected = members
            .iter()
            .map(|&i| &all[i].thread_id)
            .collect::<std::collections::BTreeSet<_>>()
            .len();
        let b = &mut all[index];
        let subscription = subscriptions
            .iter()
            .find(|s| s.matches(b))
            .expect("member has a matching subscription");
        b.deliveries.push(Delivery {
            subscription: subscription.id.clone(), channel, target,
            event_id, key: format!("recovery:{restart}"), created_at: at,
            state: "recovered".into(), task_state: "recovered".into(), status: "pending".into(),
            recovery: json!({"recoveredAt":chrono::DateTime::from_timestamp(at,0).ok_or("INVALID_RECOVERY_TIME")?.to_rfc3339(),"affectedTasks":affected}),
            timing: DeliveryTiming { queued_at: Some(at.saturating_mul(1000)), ..Default::default() },
            ..Default::default()
        });
        inbox_append(dir, &source, event(b, b.deliveries.last().unwrap()))?;
        persist(dir, b)?;
    }
    Ok(())
}
