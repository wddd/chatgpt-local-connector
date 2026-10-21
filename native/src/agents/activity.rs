use crate::*;
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    time::{Duration, Instant, SystemTime},
};

#[derive(Default)]
pub(super) struct Monitor {
    sampled: Option<Instant>,
    selected: Vec<String>,
    active: Vec<(String, Value)>,
}
impl Monitor {
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
            self.active = tokio::task::spawn_blocking(move || scan(&selected))
                .await
                .unwrap_or_default();
            self.sampled = Some(Instant::now());
        }
        self.active.clone()
    }
}

fn scan(selected: &[String]) -> Vec<(String, Value)> {
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
                if let Some(session) = working(&entry.path(), agent, modified, now) {
                    active.push((agent.clone(), session));
                }
            }
        }
    }
    active
}

fn working(path: &Path, agent: &str, modified: SystemTime, now: SystemTime) -> Option<Value> {
    let Ok(mut file) = File::open(path) else {
        return None;
    };
    let Ok(size) = file.seek(SeekFrom::End(0)) else {
        return None;
    };
    let start = size.saturating_sub(128 * 1024);
    if file.seek(SeekFrom::Start(start)).is_err() {
        return None;
    }
    let mut bytes = Vec::new();
    if file.take(128 * 1024).read_to_end(&mut bytes).is_err() {
        return None;
    }
    let mut lines = bytes.split(|b| *b == b'\n');
    if start > 0 {
        lines.next();
    }
    let records: Vec<Value> = lines
        .filter_map(|line| serde_json::from_slice(line).ok())
        .collect();
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
fn transcript_text(text: &str) -> String {
    use std::sync::OnceLock;
    static BLOCKS: OnceLock<regex::Regex> = OnceLock::new();
    static TAGS: OnceLock<regex::Regex> = OnceLock::new();
    let text = text.trim();
    if text.starts_with("# AGENTS.md instructions") || text.starts_with("<INSTRUCTIONS>") {
        return String::new();
    }
    let blocks = BLOCKS.get_or_init(|| regex::Regex::new(
        r"(?is)<(?:system-reminder|system_reminder|environment_context|environment_details|image_resize_notice|total_tokens|token_budget|instructions|INSTRUCTIONS|app-context|permissions instructions|collaboration_mode|skills_instructions)(?:\s[^>]*)?>.*?(?:</(?:system-reminder|system_reminder|environment_context|environment_details|image_resize_notice|total_tokens|token_budget|instructions|INSTRUCTIONS|app-context|permissions instructions|collaboration_mode|skills_instructions)>|\z)"
    ).unwrap());
    let tags = TAGS.get_or_init(|| regex::Regex::new(r"^\s*(?:</?[A-Za-z_][^>]*>\s*)+$").unwrap());
    blocks
        .replace_all(text, "")
        .lines()
        .filter(|line| !tags.is_match(line))
        .collect::<Vec<_>>()
        .join("\n")
}
fn phase(record: &Value, agent: &str) -> Option<(String, String, Value)> {
    let role = if agent == "codex" {
        string(&record["payload"], "role")
    } else {
        string(&record["message"], "role")
    };
    if matches!(role, "system" | "developer") || record["isMeta"] == true {
        return None;
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
                ("tool", string(b, "name").to_owned())
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
        if headline.is_empty() && kind != "thinking" {
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
) -> Value {
    let (phase, headline, since) = phase.unwrap_or(("thinking".into(), "".into(), observed));
    let mut row = json!({"id":id,"source":"transcript","project":project,"phase":phase,"headline":headline,"phaseSince":since,"timeline":false});
    if agent == "claude"
        && cfg!(target_os = "macos")
        && project.is_some()
        && uuid::Uuid::parse_str(id).is_ok()
    {
        row["open"] = json!({"kind":"agent-session","target":id});
    }
    if agent == "codex" {
        if let Some(open) = crate::task_tracking::codex_open(id) {
            row["open"] = open;
        }
    }
    row
}
