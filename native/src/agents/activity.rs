#[cfg(test)]
use crate::kernel::file_cache::Io;
use crate::kernel::file_cache::{Cache, Stamp};
use crate::task_tracking::transcript_text;
use crate::*;
use std::{
    collections::{HashMap, HashSet},
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
    scan: ScanCache,
}
#[derive(Default)]
pub(super) struct TurnClock {
    offset: u64,
    started_at: Value,
    turn_id: String,
    turns: HashSet<String>,
    dispatch_summary: Option<Value>,
    turn_dispatch_summaries: HashMap<String, Value>,
    thread_tier: Value,
    turn_tier: Value,
    title: String,
    project: Option<String>,
    created_at: Value,
}
#[derive(Clone)]
pub(super) struct External {
    pub agent: String,
    pub session: Value,
    pub path: PathBuf,
    pub turn_dispatch_summaries: HashMap<String, Value>,
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
            let mut cache = std::mem::take(&mut self.scan);
            let (scanned, cache) = tokio::task::spawn_blocking(move || {
                let scanned = scan(&selected, &mut cache);
                (scanned, cache)
            })
            .await
            .unwrap_or_default();
            self.scan = cache;
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

#[derive(Default)]
struct ScanCache {
    directories: Cache<Value>,
    tails: HashMap<PathBuf, Tail>,
    titles: Option<(PathBuf, Stamp, HashMap<String, String>)>,
    file_opens: u64,
}
struct Tail {
    stamp: Stamp,
    records: Vec<Value>,
    clock: TurnClock,
    clock_stamp: Option<Stamp>,
}
impl ScanCache {
    #[cfg(test)]
    fn io(&self) -> Io {
        Io {
            file_opens: self.file_opens,
            directory_reads: self.directories.io().directory_reads,
        }
    }
    fn tail(
        &mut self,
        path: &Path,
        agent: &str,
        stamp: Stamp,
        modified: SystemTime,
        now: SystemTime,
    ) -> Result<(&Tail, Option<Value>)> {
        if self.tails.get(path).is_none_or(|tail| tail.stamp != stamp) {
            // At most 128 recent tails (128 KiB each) are retained. Older files are
            // discovered through metadata without reading their contents.
            if self.tails.len() >= 128 && !self.tails.contains_key(path) {
                self.tails.clear();
            }
            let (clock, clock_stamp) = self
                .tails
                .remove(path)
                .filter(|tail| stamp.appends_to(&tail.stamp))
                .map(|tail| (tail.clock, tail.clock_stamp))
                .unwrap_or_default();
            self.file_opens += 1;
            let (records, _) = read_tail(path, 128 * 1024)?;
            if Stamp::read(path)?.as_ref() != Some(&stamp) {
                return Err("Transcript changed during activity sampling".into());
            }
            self.tails.insert(
                path.into(),
                Tail {
                    stamp,
                    records,
                    clock,
                    clock_stamp,
                },
            );
        }
        let tail = self.tails.get_mut(path).unwrap();
        let session = working_records(path, agent, modified, now, &tail.records);
        // Completed or expired transcripts need only their tail, never a full
        // metadata walk. Time-dependent activity is evaluated even on cache hits.
        if session.is_some() && tail.clock_stamp.as_ref() != Some(&tail.stamp) {
            self.file_opens += 1;
            turn_started_at(path, agent, &mut tail.clock)?;
            if Stamp::read(path)?.as_ref() != Some(&tail.stamp) {
                return Err("Transcript changed during activity sampling".into());
            }
            tail.clock_stamp = Some(tail.stamp.clone());
        }
        Ok((tail, session))
    }
    fn titles(&mut self, path: &Path) -> Result<&HashMap<String, String>> {
        let stamp = Stamp::read(path)?.ok_or("Session index not found")?;
        if self
            .titles
            .as_ref()
            .is_none_or(|(old_path, old_stamp, _)| old_path != path || old_stamp != &stamp)
        {
            self.file_opens += 1;
            let file = File::open(path).map_err(|e| e.to_string())?;
            let mut titles = HashMap::new();
            for line in BufReader::new(file).lines() {
                let line = line.map_err(|e| e.to_string())?;
                let Ok(record) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                let title = string(&record, "thread_name").trim();
                if !title.is_empty() {
                    titles.insert(
                        string(&record, "id").into(),
                        title.chars().take(240).collect(),
                    );
                }
            }
            if Stamp::read(path)?.as_ref() != Some(&stamp) {
                return Err("Session index changed during activity sampling".into());
            }
            self.titles = Some((path.into(), stamp, titles));
        }
        Ok(&self.titles.as_ref().unwrap().2)
    }
}
fn scan(selected: &[String], cache: &mut ScanCache) -> Vec<External> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let codex_home = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"));
    let roots: Vec<_> = selected
        .iter()
        .map(|agent| {
            let root = if agent == "codex" {
                codex_home.join("sessions")
            } else {
                std::env::var_os("CLAUDE_CONFIG_DIR")
                    .map(PathBuf::from)
                    .unwrap_or_else(|| home.join(".claude"))
                    .join("projects")
            };
            (agent.clone(), root)
        })
        .collect();
    scan_roots(
        &roots,
        &codex_home.join("session_index.jsonl"),
        SystemTime::now(),
        cache,
    )
}
fn scan_roots(
    roots: &[(String, PathBuf)],
    index: &Path,
    now: SystemTime,
    cache: &mut ScanCache,
) -> Vec<External> {
    let mut active = Vec::new();
    let mut recent = HashSet::new();
    for (agent, root) in roots {
        let mut directories = vec![root.clone()];
        while let Some(dir) = directories.pop() {
            let Ok(entries) = cache.directories.entries(&dir) else {
                continue;
            };
            for entry in entries.iter() {
                let path = &entry.path;
                if path
                    .file_name()
                    .is_some_and(|name| name.to_string_lossy().starts_with('.'))
                    || entry.kind.is_symlink()
                {
                    continue;
                }
                if entry.kind.is_dir() {
                    directories.push(path.clone());
                    continue;
                }
                if !entry.kind.is_file() || path.extension().is_none_or(|ext| ext != "jsonl") {
                    continue;
                }
                let Ok(metadata) = std::fs::metadata(path) else {
                    continue;
                };
                let Ok(modified) = metadata.modified() else {
                    continue;
                };
                if now.duration_since(modified).unwrap_or_default() > Duration::from_secs(300) {
                    continue;
                }
                recent.insert(path.clone());
                let Ok((tail, session)) =
                    cache.tail(path, agent, Stamp::from_metadata(&metadata), modified, now)
                else {
                    continue;
                };
                if let Some(mut session) = session {
                    let clock = &tail.clock;
                    session["turnStartedAt"] = clock.started_at.clone();
                    if !clock.title.is_empty() {
                        session["title"] = json!(clock.title)
                    }
                    if session["project"].is_null() {
                        session["project"] = json!(clock.project)
                    }
                    session["startedAt"] = clock.created_at.clone();
                    session["turnCount"] = json!(clock.turns.len());
                    if !clock.turn_id.is_empty() {
                        session["turnId"] = json!(clock.turn_id)
                    }
                    if let Some(summary) = &clock.dispatch_summary {
                        session["dispatchSummary"] = summary.clone()
                    }
                    active.push(External {
                        agent: agent.clone(),
                        session,
                        path: path.clone(),
                        turn_dispatch_summaries: clock.turn_dispatch_summaries.clone(),
                    });
                }
            }
        }
    }
    if active.iter().any(|session| session.agent == "codex") {
        if let Ok(titles) = cache.titles(index) {
            for session in active.iter_mut().filter(|s| s.agent == "codex") {
                if let Some(title) = titles.get(string(&session.session, "id")) {
                    session.session["title"] = json!(title)
                }
            }
        }
    }
    cache.tails.retain(|path, _| recent.contains(path));
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

// Keep session metadata and turn configuration independently of the headline tail. Each
// complete record is scanned once while a transcript remains active.
pub(super) fn conversation_metadata(thread: &Value, clock: &mut TurnClock) -> Result<Value> {
    read_clock(
        crate::control::open_persisted_history(thread)?,
        "codex",
        clock,
    )?;
    Ok(json!({"dispatchSummary":clock.dispatch_summary,"turnCount":clock.turns.len()}))
}

fn turn_started_at(path: &Path, agent: &str, clock: &mut TurnClock) -> Result<Value> {
    read_clock(File::open(path).map_err(|e| e.to_string())?, agent, clock)
}

fn read_clock(mut file: File, agent: &str, clock: &mut TurnClock) -> Result<Value> {
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
            if clock.created_at.is_null() && record["timestamp"].is_string() {
                clock.created_at = record["timestamp"].clone();
            }
            if let Some(project) = record["cwd"]
                .as_str()
                .or_else(|| record["payload"]["cwd"].as_str())
            {
                clock.project = Some(project.into());
            }
            let user = if agent == "codex" {
                record["payload"]["role"] == "user"
            } else {
                record["message"]["role"] == "user"
            };
            if clock.title.is_empty() && user {
                if let Some((_, title, _)) = phase_content(&record, agent, false) {
                    clock.title = title;
                }
            }
            if agent == "codex"
                && record["type"] == "event_msg"
                && record["payload"]["type"] == "thread_settings_applied"
            {
                clock.thread_tier = record["payload"]["thread_settings"]["service_tier"].clone();
            }
            if let Some(start) = turn_start(&record, agent) {
                clock.started_at = start;
                clock.turn_tier = clock.thread_tier.clone();
                if let Some(turn) = record["payload"]["turn_id"].as_str() {
                    if clock.turn_id != turn {
                        clock.dispatch_summary = None;
                    }
                    clock.turn_id = turn.into();
                    clock.turns.insert(turn.into());
                }
            }
            if agent == "codex" && record["type"] == "turn_context" {
                if let Some(turn) = record["payload"]["turn_id"].as_str() {
                    if clock.turn_id != turn {
                        clock.turn_tier = clock.thread_tier.clone();
                    }
                    clock.turn_id = turn.into();
                    clock.turns.insert(turn.into());
                    let context = &record["payload"];
                    clock.dispatch_summary = crate::egress::dispatch_summary(&json!({
                        "model":context["model"],"effort":context["effort"],
                        "serviceTier":context["service_tier"],"threadServiceTier":clock.turn_tier
                    }));
                    if let Some(summary) = &clock.dispatch_summary {
                        clock
                            .turn_dispatch_summaries
                            .insert(turn.into(), summary.clone());
                    }
                }
            }
        }
        clock.offset += count as u64;
    }
    Ok(clock.started_at.clone())
}

pub(super) fn agent_summary(state: &Value) -> Option<Value> {
    let facts = super::dispatch::catalog_facts(
        state,
        &state["metadata"],
        state["configurationObservedAt"].clone(),
        "persisted-session-snapshot",
        Value::Null,
    );
    let mut configuration = super::dispatch::current_configuration(&facts);
    if state["agent"] == "pi"
        && state["lastMessage"]["provider"].is_string()
        && state["lastMessage"]["model"].is_string()
    {
        configuration["model"] = json!(format!(
            "{}/{}",
            string(&state["lastMessage"], "provider"),
            string(&state["lastMessage"], "model")
        ));
    }
    crate::egress::dispatch_summary(&configuration)
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
fn working_records(
    path: &Path,
    agent: &str,
    modified: SystemTime,
    now: SystemTime,
    records: &[Value],
) -> Option<Value> {
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
    fn activity_polls_skip_unchanged_files_but_discover_changes_and_expire_work() {
        // Regression: the two-second activity poll reopened every recent rollout and the entire title index.
        struct Sandbox(PathBuf);
        impl Drop for Sandbox {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let dir = Sandbox(std::env::temp_dir().join(format!("arc-activity-cache-{}", id())));
        let sessions = dir.0.join("sessions");
        std::fs::create_dir_all(sessions.join("day")).unwrap();
        let index = dir.0.join("index.jsonl");
        let path = sessions.join("day/rollout.jsonl");
        let start = SystemTime::now();
        let timestamp = chrono::DateTime::<chrono::Utc>::from(start).to_rfc3339();
        let rollout = |session: &str, state: &str| {
            format!(
                "{}\n{}\n",
                json!({"type":"session_meta","payload":{"id":session}}),
                json!({"timestamp":timestamp,"type":"event_msg","payload":{"type":state,"turn_id":"turn"}})
            )
        };
        std::fs::write(&path, rollout("first", "task_started")).unwrap();
        std::fs::write(
            &index,
            format!("{}\n", json!({"id":"first","thread_name":"Initial"})),
        )
        .unwrap();
        let roots = vec![("codex".into(), sessions.clone())];
        let mut cache = ScanCache::default();
        let rows = scan_roots(&roots, &index, start, &mut cache);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].session["title"], "Initial");
        let warm = cache.io();
        for second in [2, 4, 6, 8] {
            let rows = scan_roots(
                &roots,
                &index,
                start + Duration::from_secs(second),
                &mut cache,
            );
            assert_eq!(rows.len(), 1);
            assert_eq!(rows[0].session["turnCount"], 1);
        }
        assert_eq!(cache.io(), warm);
        // Time still advances even when the transcript bytes do not.
        assert!(scan_roots(&roots, &index, start + Duration::from_secs(91), &mut cache).is_empty());
        assert_eq!(cache.io(), warm);
        std::fs::write(
            &index,
            format!("{}\n", json!({"id":"first","thread_name":"Renamed"})),
        )
        .unwrap();
        let rows = scan_roots(&roots, &index, start, &mut cache);
        assert_eq!(rows[0].session["title"], "Renamed");
        assert_eq!(cache.io().file_opens - warm.file_opens, 1);
        let changed = cache.io();
        std::fs::write(
            sessions.join("second.jsonl"),
            rollout("second", "task_started"),
        )
        .unwrap();
        assert_eq!(scan_roots(&roots, &index, start, &mut cache).len(), 2);
        assert_eq!(cache.io().directory_reads - changed.directory_reads, 1);
        assert_eq!(cache.io().file_opens - changed.file_opens, 2);
        // Replacement resets the turn clock even when the new file is longer.
        let replacement = sessions.join("replacement.tmp");
        std::fs::write(
            &replacement,
            rollout("first", "task_started")
                .replace("turn_id\":\"turn\"", "turn_id\":\"replacement-turn\""),
        )
        .unwrap();
        std::fs::rename(replacement, &path).unwrap();
        let rows = scan_roots(&roots, &index, start, &mut cache);
        let replaced = rows
            .iter()
            .find(|row| row.session["id"] == "first")
            .unwrap();
        assert_eq!(replaced.session["turnId"], "replacement-turn");
        assert_eq!(replaced.session["turnCount"], 1);
        std::fs::write(&path, rollout("first", "task_complete")).unwrap();
        let rows = scan_roots(&roots, &index, start, &mut cache);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].session["id"], "second");
        std::fs::remove_file(sessions.join("second.jsonl")).unwrap();
        assert!(scan_roots(&roots, &index, start, &mut cache).is_empty());
    }
    #[test]
    fn external_summary_falls_back_without_changing_the_current_phase() {
        // Property: external summary falls back without changing the current phase.
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
        // Property: transcript headlines skip injected content and tags.
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
