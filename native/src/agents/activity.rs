use crate::task_tracking::transcript_text;
use crate::*;
use std::{
    collections::HashMap,
    fs::File,
    io::{BufRead, BufReader, Read, Seek, SeekFrom},
    time::{Duration, Instant, SystemTime},
};

#[derive(Default)]
pub(super) struct Monitor {
    sampled: Option<Instant>,
    selected: Vec<String>,
    active: Vec<(String, Value)>,
    known: Vec<External>,
    turn_clocks: HashMap<PathBuf, TurnClock>,
}
#[derive(Default)]
struct TurnClock {
    offset: u64,
    started_at: Value,
}
#[derive(Clone)]
pub(super) struct External {
    pub agent: String,
    pub session: Value,
    pub path: PathBuf,
}
impl Monitor {
    pub fn external(&self, id: &str) -> Option<External> {
        self.known.iter().find(|s| s.session["id"] == id).cloned()
    }
    pub async fn sample(&mut self, mut selected: Vec<String>) -> Vec<(String, Value)> {
        selected.retain(|id| matches!(id.as_str(), "codex" | "claude"));
        selected.sort();
        selected.dedup();
        if self.selected != selected
            || self
                .sampled
                .is_none_or(|at| at.elapsed() >= Duration::from_secs(2))
        {
            self.selected = selected.clone();
            let mut clocks = std::mem::take(&mut self.turn_clocks);
            let (scanned, clocks) = tokio::task::spawn_blocking(move || {
                let scanned = scan(&selected, &mut clocks);
                (scanned, clocks)
            })
            .await
            .unwrap_or_default();
            self.turn_clocks = clocks;
            self.active = scanned
                .iter()
                .map(|s| (s.agent.clone(), s.session.clone()))
                .collect();
            for session in scanned {
                self.known
                    .retain(|s| s.session["id"] != session.session["id"]);
                self.known.push(session);
            }
            if self.known.len() > 128 {
                self.known.drain(..self.known.len() - 128);
            }
            self.sampled = Some(Instant::now());
        }
        self.active.clone()
    }
}

fn scan(selected: &[String], clocks: &mut HashMap<PathBuf, TurnClock>) -> Vec<External> {
    let mut active = Vec::new();
    let Some(home) = dirs::home_dir() else {
        return active;
    };
    let now = SystemTime::now();
    for agent in selected {
        let root = if agent == "codex" {
            std::env::var_os("CODEX_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(".codex"))
                .join("sessions")
        } else {
            std::env::var_os("CLAUDE_CONFIG_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(".claude"))
                .join("projects")
        };
        let mut directories = vec![root];
        while let Some(dir) = directories.pop() {
            let Ok(entries) = std::fs::read_dir(dir) else {
                continue;
            };
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().starts_with('.') {
                    continue;
                }
                let Ok(kind) = entry.file_type() else {
                    continue;
                };
                if kind.is_symlink() {
                    continue;
                }
                if kind.is_dir() {
                    directories.push(entry.path());
                    continue;
                }
                if !kind.is_file() || entry.path().extension().is_none_or(|ext| ext != "jsonl") {
                    continue;
                }
                let Ok(modified) = entry.metadata().and_then(|m| m.modified()) else {
                    continue;
                };
                if now.duration_since(modified).unwrap_or_default() > Duration::from_secs(300) {
                    continue;
                }
                if let Some(mut session) = working(&entry.path(), agent, modified, now) {
                    session["turnStartedAt"] = turn_started_at(
                        &entry.path(),
                        agent,
                        clocks.entry(entry.path()).or_default(),
                    )
                    .unwrap_or(Value::Null);
                    active.push(External {
                        agent: agent.clone(),
                        session,
                        path: entry.path(),
                    });
                }
            }
        }
    }
    clocks.retain(|path, _| active.iter().any(|session| &session.path == path));
    active
}

fn turn_start(record: &Value, agent: &str) -> Option<Value> {
    let starts = if agent == "codex" {
        record["type"] == "event_msg" && record["payload"]["type"] == "task_started"
    } else {
        record["message"]["role"] == "user" && phase_content(record, agent, false).is_some()
    };
    if !starts {
        return None;
    }
    record.get("timestamp").filter(|v| v.is_string()).cloned()
}

// Keep the turn boundary independently of the bounded headline tail. Each
// complete record is scanned once while a transcript remains active.
fn turn_started_at(path: &Path, agent: &str, clock: &mut TurnClock) -> Result<Value> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() < clock.offset {
        *clock = TurnClock::default();
    }
    file.seek(SeekFrom::Start(clock.offset))
        .map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(file);
    let mut line = Vec::new();
    loop {
        line.clear();
        let count = reader
            .read_until(b'\n', &mut line)
            .map_err(|e| e.to_string())?;
        if count == 0 || line.last() != Some(&b'\n') {
            break;
        }
        if let Ok(record) = serde_json::from_slice::<Value>(&line) {
            if let Some(start) = turn_start(&record, agent) {
                clock.started_at = start;
            }
        }
        clock.offset += count as u64;
    }
    Ok(clock.started_at.clone())
}

fn read_tail(path: &Path, limit: u64) -> Result<(Vec<Value>, bool)> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let size = file.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
    let start = size.saturating_sub(limit);
    file.seek(SeekFrom::Start(start))
        .map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.take(limit)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let mut lines = bytes.split(|b| *b == b'\n');
    if start > 0 {
        lines.next();
    }
    let records = lines
        .filter_map(|line| serde_json::from_slice(line).ok())
        .collect();
    Ok((records, start > 0))
}
pub(super) fn claude_timeline(path: &Path, session: &str) -> Result<Value> {
    let (records, truncated) = read_tail(path, 8 * 1024 * 1024)?;
    let mut timeline = crate::task_tracking::Timeline::default();
    timeline.partial = truncated;
    timeline.backfill_claude(&records);
    let mut result = timeline.response(session, 0);
    result["readOnly"] = json!(true);
    Ok(result)
}
fn working(path: &Path, agent: &str, modified: SystemTime, now: SystemTime) -> Option<Value> {
    let (records, _) = read_tail(path, 128 * 1024).ok()?;
    let metadata = records
        .iter()
        .find(|r| r["type"] == "session_meta")
        .map(|r| &r["payload"]);
    let session_id = records
        .iter()
        .rev()
        .find_map(|r| r["sessionId"].as_str())
        .or_else(|| metadata.and_then(|m| m["id"].as_str()))
        .map(str::to_owned)
        .or_else(|| {
            let stem = path.file_stem()?.to_str()?;
            let tail = stem.get(stem.len().checked_sub(36)?..)?;
            uuid::Uuid::parse_str(tail).ok().map(|_| tail.to_owned())
        })?;
    let project = records
        .iter()
        .rev()
        .find_map(|r| r["cwd"].as_str().or_else(|| r["payload"]["cwd"].as_str()));
    let mut latest = None;
    for record in records.iter().rev() {
        if latest.is_none() {
            latest = phase(record, agent);
        }

        let grace = if agent == "codex" {
            match string(&record["payload"], "type") {
                "task_complete" | "turn_aborted" => return None,
                "task_started"
                | "function_call_output"
                | "custom_tool_call_output"
                | "tool_search_output" => 90,
                "function_call" | "custom_tool_call" | "local_shell_call" | "web_search_call"
                | "tool_search_call" => 300,
                _ => continue,
            }
        } else {
            match string(&record, "type") {
                "assistant" => match record["message"]["stop_reason"].as_str() {
                    Some("tool_use") => 300,
                    Some(_) => return None,
                    None => 90,
                },
                "user" => {
                    let content = &record["message"]["content"];
                    let interrupted = content
                        .as_str()
                        .is_some_and(|s| s.contains("[Request interrupted by user"))
                        || content.as_array().is_some_and(|blocks| {
                            blocks
                                .iter()
                                .any(|b| string(b, "text").contains("[Request interrupted by user"))
                        });
                    if interrupted {
                        return None;
                    }
                    90
                }
                _ => continue,
            }
        };
        let timestamp = record["timestamp"]
            .as_str()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|at| SystemTime::from(at.with_timezone(&chrono::Utc)))
            .unwrap_or(modified);
        if now.duration_since(timestamp).unwrap_or_default() > Duration::from_secs(grace) {
            return None;
        }
        return Some(transcript_session(
            &session_id,
            agent,
            project,
            latest,
            record["timestamp"].clone(),
            &records,
        ));
    }
    if now.duration_since(modified).unwrap_or_default() > Duration::from_secs(30) {
        return None;
    }
    Some(transcript_session(
        &session_id,
        agent,
        project,
        latest,
        json!(chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339()),
        &records,
    ))
}

pub(super) fn insert(agents: &mut serde_json::Map<String, Value>, agent: &str, session: Value) {
    agents
        .entry(agent.to_owned())
        .or_insert_with(|| json!({"sessions":[]}))["sessions"]
        .as_array_mut()
        .unwrap()
        .push(session);
}
fn phase(record: &Value, agent: &str) -> Option<(String, String, Value)> {
    phase_content(record, agent, true)
}
fn phase_content(record: &Value, agent: &str, current: bool) -> Option<(String, String, Value)> {
    let role = if agent == "codex" {
        string(&record["payload"], "role")
    } else {
        string(&record["message"], "role")
    };
    if matches!(role, "system" | "developer") || record["isMeta"] == true {
        return None;
    }
    if agent == "claude" && record["message"]["content"].is_string() {
        let text = crate::task_tracking::headline(
            "text",
            &transcript_text(string(&record["message"], "content")),
        );
        return (!text.is_empty()).then(|| ("text".into(), text, record["timestamp"].clone()));
    }
    let blocks: Vec<&Value> = if agent == "codex" {
        vec![&record["payload"]]
    } else {
        record["message"]["content"].as_array()?.iter().collect()
    };
    for b in blocks.into_iter().rev() {
        let (kind, text) = match string(b, "type") {
            "reasoning" | "thinking" => (
                "thinking",
                b["thinking"]
                    .as_str()
                    .map(str::to_owned)
                    .unwrap_or_else(|| {
                        b["summary"]
                            .as_array()
                            .into_iter()
                            .flatten()
                            .filter_map(|s| s["text"].as_str())
                            .collect::<Vec<_>>()
                            .join("\n")
                    }),
            ),
            "function_call" | "custom_tool_call" | "tool_use" => {
                let input = if b["input"].is_object() {
                    b["input"].clone()
                } else {
                    serde_json::from_str::<Value>(string(b, "arguments")).unwrap_or_default()
                };
                if let Some(command) = input["command"].as_str().or_else(|| input["cmd"].as_str()) {
                    ("command", command.to_owned())
                } else if let Some(path) = input["file_path"]
                    .as_str()
                    .or_else(|| input["path"].as_str())
                {
                    ("file", path.to_owned())
                } else {
                    ("tool", string(b, "name").to_owned())
                }
            }
            "message" => (
                "text",
                b["content"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|c| c["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("\n"),
            ),
            "text" => ("text", string(b, "text").to_owned()),
            "agent_message" => ("text", string(b, "message").to_owned()),
            _ => continue,
        };
        let headline = crate::task_tracking::headline(kind, &transcript_text(&text));
        if headline.is_empty() && (kind != "thinking" || !current) || !current && kind == "tool" {
            continue;
        }
        return Some((
            kind.into(),
            headline.chars().take(240).collect(),
            record["timestamp"].clone(),
        ));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn external_summary_falls_back_without_changing_the_current_phase() {
        let records = vec![
            json!({"message":{"role":"user","content":"Read example"}}),
            json!({"message":{"role":"assistant","content":[
                {"type":"text","text":"Checking example"},
                {"type":"thinking","thinking":""}
            ]}}),
        ];
        let current = phase(&records[1], "claude");
        assert_eq!(current.as_ref().unwrap().1, "");
        let row = transcript_session("example", "claude", None, current, Value::Null, &records);
        assert_eq!(row["source"], "transcript");
        assert_eq!(row["timeline"], true);
        assert_eq!(row["headline"], "");
        assert_eq!(row["phase"], "thinking");
        assert_eq!(row["fallbackHeadline"], "Checking example");
        assert_eq!(row["title"], "Read example");
        assert_eq!(row["recentContent"], json!(["Checking example"]));
        assert!(row["interaction"].is_null());
        let row = transcript_session("example", "claude", None, None, Value::Null, &records[..1]);
        assert_eq!(row["fallbackHeadline"], "Read example");
        let command = json!({"payload":{"type":"function_call","name":"exec_command","arguments":"{\"cmd\":\"printf example\"}"}});
        let phase = phase(&command, "codex").unwrap();
        assert_eq!(phase.0, "command");
        assert_eq!(phase.1, "printf example");
    }
    #[test]
    fn transcript_headlines_skip_injected_content_and_tags() {
        for agent in ["codex", "claude"] {
            let text = "First sentence. Actual update.\n<image_resize_notice>Injected details</image_resize_notice>\n<total_tokens>1234</total_tokens>\n</image_resize_notice>";
            let record = if agent == "codex" {
                json!({"payload":{"type":"message","role":"assistant","content":[{"text":text}]}})
            } else {
                json!({"message":{"role":"assistant","content":[{"type":"text","text":text}]}})
            };
            assert_eq!(phase(&record, agent).unwrap().1, "Actual update.");
        }
        assert!(phase(&json!({"payload":{"type":"message","role":"developer","content":[{"text":"Injected instructions"}]}}), "codex").is_none());
        assert!(phase(&json!({"isMeta":true,"message":{"content":[{"type":"text","text":"Injected instructions"}]}}), "claude").is_none());
        assert_eq!(
            transcript_text("<environment_context>\nWorking directory\n</environment_context>"),
            ""
        );
        assert_eq!(
            transcript_text("# AGENTS.md instructions for example\nRules"),
            ""
        );
        assert!(phase(
            &json!({"payload":{"type":"message","content":[{"text":"</image_resize_notice>"}]}}),
            "codex"
        )
        .is_none());
        assert_eq!(
            phase(
                &json!({"payload":{"type":"reasoning","summary":[]}}),
                "codex"
            )
            .unwrap()
            .1,
            ""
        );
        assert_eq!(phase(&json!({"message":{"content":[{"type":"thinking","thinking":"First\nLast thought"}]}}), "claude").unwrap().1, "Last thought");
    }
}
fn transcript_session(
    id: &str,
    agent: &str,
    project: Option<&str>,
    phase: Option<(String, String, Value)>,
    observed: Value,
    records: &[Value],
) -> Value {
    let (phase, headline, since) = phase.unwrap_or(("thinking".into(), "".into(), observed));
    let is_user = |r: &Value| {
        if agent == "codex" {
            r["payload"]["role"] == "user"
        } else {
            r["message"]["role"] == "user"
        }
    };
    let recent: Vec<_> = records
        .iter()
        .rev()
        .filter(|r| !is_user(r))
        .filter_map(|r| phase_content(r, agent, false))
        .map(|(_, text, _)| text)
        .take(3)
        .collect();
    let title = records
        .iter()
        .rev()
        .filter(|r| is_user(r))
        .find_map(|r| phase_content(r, agent, false))
        .map(|(_, text, _)| text)
        .unwrap_or_default();
    let mut row = json!({"id":id,"source":"transcript","project":project,"phase":phase,"headline":headline,"phaseSince":since,"timeline":true,
        "title":title,"fallbackHeadline":recent.first().unwrap_or(&title),"recentContent":recent.iter().rev().collect::<Vec<_>>()});
    row["turnStartedAt"] = records
        .iter()
        .rev()
        .find_map(|record| turn_start(record, agent))
        .unwrap_or(Value::Null);
    if agent == "codex" {
        if let Some(open) = super::driver::AgentDriver::CodexNative.navigation(id) {
            row["open"] = open;
        }
    }
    row
}
