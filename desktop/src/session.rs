//! Connection state across ordinary desktop quits, separate from update handoff.
use arc_core::{load, root, runtime::Client as Service, save};
use serde_json::json;
use std::{collections::BTreeSet, sync::Mutex};

static RESTORING: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());

pub fn begin_restore(ids: &[String]) {
    *RESTORING.lock().unwrap() = ids.iter().cloned().collect();
}

pub fn finish_restore(id: &str) {
    RESTORING.lock().unwrap().remove(id);
}

pub fn restore() -> Option<Vec<String>> {
    let path = root().join("desktop-session.json");
    if !path.exists() {
        return None;
    }
    match load(&path)
        .and_then(|value| serde_json::from_value(value).map_err(|error| error.to_string()))
    {
        Ok(ids) => Some(ids),
        Err(error) => {
            eprintln!("Could not restore desktop connections: {error}");
            None
        }
    }
}

pub async fn remember(service: &std::sync::Arc<Service>) -> Result<(), String> {
    // Preserve queued reconnects when a development rebuild interrupts startup.
    let restoring = RESTORING.lock().unwrap().clone();
    let entries = service.request("ingress", "GET", json!({})).await?;
    let ids: Vec<_> = entries
        .as_array()
        .into_iter()
        .flatten()
        .filter(|entry| {
            entry["enabled"] == true
                && (entry["running"] == true
                    || entry["state"] == "starting"
                    || entry["id"]
                        .as_str()
                        .is_some_and(|id| restoring.contains(id)))
        })
        .filter_map(|entry| entry["id"].as_str())
        .collect();
    save(&root().join("desktop-session.json"), &json!(ids))
}
