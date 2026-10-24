//! Conversation metadata pages. Listing scans configuration records without building timelines or resuming an Agent.
use super::*;
use serde::Deserialize;
use std::{
    fs::File,
    io::BufReader,
    time::{Duration, Instant},
};

#[derive(Default)]
pub(super) struct Cache {
    sampled: Option<Instant>,
    rows: Vec<Value>,
    clocks: HashMap<PathBuf, activity::TurnClock>,
}

// Deserialize metadata from the reader without retaining tracking/output payloads.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskMetadata {
    task_id: String,
    agent: String,
    title: Option<String>,
    cwd: Option<String>,
    created_at: String,
    session_id: Option<String>,
    status: Option<String>,
    #[serde(default)]
    metadata: Value,
    #[serde(default)]
    last_message: Value,
    #[serde(default)]
    tracking: Option<TrackingMetadata>,
    #[serde(default)]
    archived: bool,
}

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct TrackingMetadata {
    turn: String,
    turn_dispatch_summaries: HashMap<String, Value>,
    turn_statuses: HashMap<String, String>,
    entries: Vec<TurnMetadata>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TurnMetadata {
    turn_id: Option<String>,
}

fn stored() -> Result<Vec<Value>> {
    let directory = root().join("agents/tasks");
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut rows = Vec::new();
    for entry in std::fs::read_dir(directory).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().is_none_or(|e| e != "json") {
            continue;
        }
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let task: TaskMetadata =
            serde_json::from_reader(BufReader::new(file)).map_err(|e| e.to_string())?;
        if task.archived {
            continue;
        }
        let tracking = task.tracking.unwrap_or_default();
        let summaries = crate::task_tracking::dispatch_summaries(
            &task.task_id,
            &tracking.turn_dispatch_summaries,
        );
        let summary = summaries.get(&tracking.turn).cloned().or_else(|| activity::agent_summary(
            &json!({"agent":task.agent,"metadata":task.metadata,"lastMessage":task.last_message})
        ));
        let mut turns: HashSet<&str> = tracking
            .entries
            .iter()
            .filter_map(|entry| entry.turn_id.as_deref())
            .collect();
        turns.extend(tracking.turn_statuses.keys().map(String::as_str));
        turns.extend(summaries.keys().map(String::as_str));
        turns.insert(&tracking.turn);
        turns.remove("");
        rows.push(
            json!({"agent":task.agent,"id":task.task_id,"title":task.title,"project":task.cwd,
            "createdAt":task.created_at,"nativeSessionId":task.session_id,"source":"arc-task","status":task.status,"dispatchSummary":summary,"turnCount":turns.len()}),
        );
    }
    rows.sort_by(|a, b| {
        string(b, "createdAt")
            .cmp(string(a, "createdAt"))
            .then_with(|| string(b, "id").cmp(string(a, "id")))
    });
    Ok(rows)
}

fn timestamp(value: &Value) -> Value {
    value
        .as_i64()
        .and_then(|seconds| chrono::DateTime::from_timestamp(seconds, 0))
        .map(|at| json!(at.to_rfc3339()))
        .unwrap_or_else(|| value.clone())
}

impl AgentHost {
    pub(crate) async fn conversations(
        &self,
        control: &Arc<control::Control>,
        args: &Value,
    ) -> Result<Value> {
        let agent = string(args, "agent");
        if !self.drivers.contains_key(agent) {
            return Err("UNKNOWN_AGENT: read agents.list for registered IDs".into());
        }
        let limit = num(args, "limit", 20).clamp(1, 50);
        if agent == "codex" {
            let mut params = json!({"archived":false,"limit":limit,"sortKey":"created_at","sortDirection":"desc"});
            if let Some(cursor) = args.get("cursor") {
                params["cursor"] = cursor.clone();
            }
            let page = control.request("thread/list", params, 15000).await?;
            let projects = crate::projects::catalog(control).await.unwrap_or_default();
            let rows = page["data"]
                .as_array()
                .ok_or("NATIVE_CONVERSATIONS_MISSING")?;
            let mut cache = self.conversations.lock().await;
            let mut clocks = std::mem::take(&mut cache.clocks);
            let native_rows = rows.clone();
            let (metadata, clocks) = tokio::task::spawn_blocking(move || {
                if clocks.len() + native_rows.len() > 128 {
                    clocks.clear();
                }
                let metadata: Vec<_> = native_rows
                    .iter()
                    .map(|row| {
                        let clock = clocks
                            .entry(PathBuf::from(string(row, "path")))
                            .or_default();
                        activity::conversation_metadata(row, clock).unwrap_or(Value::Null)
                    })
                    .collect();
                (metadata, clocks)
            })
            .await
            .map_err(|e| e.to_string())?;
            cache.clocks = clocks;
            drop(cache);
            let data: Vec<_> = rows.iter().zip(metadata).map(|(row, metadata)| {
                let title = row["name"].as_str().filter(|s| !s.is_empty()).unwrap_or_else(|| string(row, "preview"));
                let mut item = json!({"id":row["id"],"title":title.chars().take(240).collect::<String>(),
                    "project":row["cwd"],"projectName":crate::projects::display_name(&projects, string(row,"cwd"), row["projectId"].as_str()),
                    "createdAt":timestamp(&row["createdAt"]),"source":"codex-thread"});
                item["dispatchSummary"] = metadata["dispatchSummary"].clone();
                item["turnCount"] = metadata["turnCount"].clone();
                item["status"] = row["status"].as_str().or_else(|| row["status"]["type"].as_str()).map(|s| json!(s)).unwrap_or(Value::Null);
                if let Some(open) = self.task_navigation(agent, string(row, "id")) {
                    item["open"] = open;
                }
                item
            }).collect();
            return Ok(
                json!({"data":data,"nextCursor":page["nextCursor"],"scope":"native-unarchived"}),
            );
        }
        // Other drivers own no native archive/history API. Page ARC's stored tasks only.
        let mut cache = self.conversations.lock().await;
        if cache
            .sampled
            .is_none_or(|at| at.elapsed() >= Duration::from_secs(30))
        {
            cache.rows = tokio::task::spawn_blocking(stored)
                .await
                .map_err(|e| e.to_string())??;
            cache.sampled = Some(Instant::now());
        }
        let cursor: Option<(String, String)> = args["cursor"]
            .as_str()
            .map(|cursor| {
                serde_json::from_str(cursor).map_err(|_| "INVALID_CONVERSATION_CURSOR".to_owned())
            })
            .transpose()?;
        let mut rows = cache
            .rows
            .iter()
            .filter(|row| {
                row["agent"] == agent
                    && cursor.as_ref().is_none_or(|(created, id)| {
                        (string(row, "createdAt"), string(row, "id"))
                            < (created.as_str(), id.as_str())
                    })
            })
            .take(limit + 1)
            .cloned()
            .collect::<Vec<_>>();
        let more = rows.len() > limit;
        rows.truncate(limit);
        let next = if more {
            rows.last()
                .map(|row| json!([row["createdAt"], row["id"]]).to_string())
        } else {
            None
        };
        Ok(json!({"data":rows,"nextCursor":next,"scope":"arc-tasks"}))
    }

    pub(crate) async fn conversation_timeline(
        &self,
        control: &control::Control,
        args: &Value,
    ) -> Result<Value> {
        let agent = string(args, "agent");
        let session = string(args, "id");
        uuid::Uuid::parse_str(session).map_err(|_| "INVALID_SESSION_ID")?;
        if agent == "codex" {
            let known = control.events.lock().await.timelines.contains_key(session)
                || control
                    .task_records()
                    .await?
                    .iter()
                    .any(|r| r["threadId"] == session || r["task"]["threadId"] == session);
            return if known {
                control
                    .timeline(session, num(args, "after", 0) as u64)
                    .await
            } else {
                control.external_timeline(session).await
            };
        }
        let task = self.task(agent, session).await?;
        let mut timeline = self
            .timeline(control, session, num(args, "after", 0) as u64)
            .await?;
        timeline["status"] = task["status"].clone();
        if task["processState"] == "stopped" {
            timeline["readOnly"] = json!(true);
        }
        Ok(timeline)
    }
}
