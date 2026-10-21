//! Bounded, protocol-independent task observations. Native events remain authoritative.
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const MAX_ENTRIES: usize = 2000;
const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_TEXT: usize = 256 * 1024;
const SUMMARY: usize = 1024;

pub(crate) fn redact(text: &str) -> String {
    use std::sync::OnceLock;
    static PATTERNS: OnceLock<Vec<regex::Regex>> = OnceLock::new();
    let patterns = PATTERNS.get_or_init(|| [
        r"(?is)-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----.*?(?:-----END (?:[A-Z ]+ )?PRIVATE KEY-----|\z)",
        r"(?i)\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+",
        r"\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]+|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b",
        r#"(?i)(?:[A-Z0-9_]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|cookie)[A-Z0-9_]*|token)\s*["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)"#,
        r"(?i)https?://[^\s/@:]+:[^\s/@]+@",
    ].into_iter().map(|p| regex::Regex::new(p).unwrap()).collect());
    patterns.iter().fold(text.to_owned(), |s, re| {
        re.replace_all(&s, "[REDACTED]").into_owned()
    })
}
fn secret_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase().replace(['-', '_'], "");
    [
        "password",
        "passwd",
        "secret",
        "token",
        "apikey",
        "authorization",
        "cookie",
        "privatekey",
        "credential",
    ]
    .iter()
    .any(|part| key.contains(part))
}
fn sanitize(value: &Value) -> Value {
    match value {
        Value::Object(fields) => Value::Object(
            fields
                .iter()
                .map(|(k, v)| {
                    (
                        k.clone(),
                        if secret_key(k) {
                            json!("[REDACTED]")
                        } else {
                            sanitize(v)
                        },
                    )
                })
                .collect(),
        ),
        Value::Array(rows) => Value::Array(rows.iter().map(sanitize).collect()),
        Value::String(s) => json!(redact(s)),
        _ => value.clone(),
    }
}
fn cut(text: &str, limit: usize) -> (String, bool) {
    let mut end = text.len().min(limit);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    (text[..end].to_owned(), end < text.len())
}
fn plain_headline(text: &str) -> String {
    use std::sync::OnceLock;
    static RULES: OnceLock<Vec<(regex::Regex, &'static str)>> = OnceLock::new();
    let rules = RULES.get_or_init(|| {
        [
            (r"!?\[([^]\n]+)\]\([^\n)]*(?:\([^\n)]*\)[^\n)]*)*\)", "$1"),
            (r"!?\[([^]\n]+)\]\[[^]\n]*\]", "$1"),
            (r"<((?:https?://|mailto:)[^>\s]+)>", "$1"),
            (r"(?m)^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|[0-9]+[.)]\s+)", ""),
            (r"(?m)\s+#+\s*$", ""),
            (r"\*\*|__|~~|`+", ""),
            (r"\*([^*\s][^*\n]*?)\*", "$1"),
            (
                r"(^|[\s(])_([^_\s][^_\n]*?)_($|[\s).,!?:;。！？])",
                "$1$2$3",
            ),
            (r"(?m)^\s*[*_]([^\s])", "$1"),
        ]
        .into_iter()
        .map(|(pattern, replacement)| (regex::Regex::new(pattern).unwrap(), replacement))
        .collect()
    });
    rules
        .iter()
        .fold(text.to_owned(), |text, (pattern, replacement)| {
            pattern.replace_all(&text, *replacement).into_owned()
        })
}
pub(crate) fn headline(kind: &str, text: &str) -> String {
    // Commands and paths are literal data, including underscores and shell syntax.
    let plain = if matches!(kind, "text" | "thinking") {
        plain_headline(text)
    } else {
        text.to_owned()
    };
    let text = plain.trim();
    let line = if kind == "text" {
        let punctuation = ['.', '!', '?', '。', '！', '？'];
        let prefix = text.trim_end_matches(punctuation);
        let start = prefix
            .char_indices()
            .rev()
            .find(|(i, c)| {
                *c == '\n'
                    || (punctuation.contains(c)
                        && (*c != '.'
                            || prefix[i + c.len_utf8()..].starts_with(char::is_whitespace)))
            })
            .map_or(0, |(i, c)| i + c.len_utf8());
        text[start..].trim()
    } else {
        text.lines()
            .rev()
            .find(|s| !s.trim().is_empty())
            .unwrap_or("")
    };
    cut(&redact(line), SUMMARY).0
}
fn summary(value: &Value) -> Value {
    let value = sanitize(value);
    crate::context::excerpt(value.as_str().unwrap_or(&value.to_string()))
}
fn content(value: &Value) -> String {
    if let Some(s) = value.as_str() {
        return s.into();
    }
    if let Some(rows) = value.as_array() {
        return rows
            .iter()
            .map(content)
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
    }
    for key in ["text", "thinking", "content", "output", "summary"] {
        if !value[key].is_null() {
            return content(&value[key]);
        }
    }
    String::new()
}
fn exit_code(raw: &Value, output: &str) -> Option<i64> {
    for key in ["exitCode", "exit_code"] {
        if let Some(n) = raw[key].as_i64() {
            return Some(n);
        }
        if let Some(n) = raw["details"][key].as_i64() {
            return Some(n);
        }
    }
    // Only explicit, whole-line producer markers; never infer success from output or status.
    output.lines().rev().find_map(|line| {
        [
            "Process exited with code ",
            "Exit code: ",
            "exit code: ",
            "Exit Code: ",
        ]
        .iter()
        .find_map(|prefix| line.trim().strip_prefix(prefix)?.trim().parse::<i64>().ok())
    })
}
fn tool_kind(kind: &str, name: &str, input: &Value) -> (&'static str, Option<&'static str>) {
    match kind {
        "execute" => return ("command", None),
        "read" | "search" => return ("file", Some("read")),
        "edit" => return ("file", Some("edit")),
        "delete" | "move" => return ("file", None),
        "" | "other" => (),
        _ => return ("tool", None),
    }
    let name = name.to_ascii_lowercase();
    let leaf = name.rsplit(['/', '.', ':']).next().unwrap_or(&name);
    let leaf = leaf.rsplit("__").next().unwrap_or(leaf);
    if input["command"].is_string()
        || matches!(
            leaf,
            "bash" | "shell" | "exec_command" | "run_command" | "terminal"
        )
    {
        return ("command", None);
    }
    let operation = match leaf {
        "read" | "read_file" | "readfile" | "cat" | "glob" | "grep" => Some("read"),
        "write" | "write_file" | "writefile" => Some("write"),
        "create" | "create_file" => Some("create"),
        "edit" | "edit_file" | "editfile" | "apply_patch" | "str_replace" | "multiedit" => {
            Some("edit")
        }
        _ => None,
    };
    if operation.is_some() || input["file_path"].is_string() {
        ("file", operation)
    } else {
        ("tool", None)
    }
}

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct Timeline {
    pub entries: Vec<Value>,
    pub revision: u64,
    bytes: usize,
    pub partial: bool,
    pub observed_events: u64,
    pub tool_observed: bool,
    pub info: Value,
    pub status: String,
    pub turn: String,
    #[serde(skip)]
    pub history_loaded: bool,
    #[serde(skip)]
    activity_entry: Option<String>,
    #[serde(skip)]
    chunk: Option<(String, String, String)>,
    pi_message: u64,
    #[serde(skip)]
    buffers: HashMap<String, String>,
}
impl Timeline {
    fn put(&mut self, mut row: Value, at: &str) {
        self.partial |= row["truncated"] == true;
        let index = self.entries.iter().position(|r| r["id"] == row["id"]);
        let old = index.map(|i| self.entries[i].clone()).unwrap_or(json!({}));
        row["startedAt"] = old.get("startedAt").cloned().unwrap_or(json!(at));
        row["updatedAt"] = json!(at);
        row["position"] = row
            .get("position")
            .cloned()
            .or_else(|| old.get("position").cloned())
            .unwrap_or_else(|| json!(index.map_or(self.revision + 1, |i| i as u64)));
        if !row["turnId"].is_string() {
            row["turnId"] = json!(self.turn);
        }
        if matches!(
            string(&row, "status"),
            "completed" | "failed" | "cancelled" | "unknown"
        ) {
            row["endedAt"] = old.get("endedAt").cloned().unwrap_or(json!(at));
        }
        // Repeated native snapshots must not advance cursors or phaseSince.
        let mut comparison = row.clone();
        comparison["updatedAt"] = old["updatedAt"].clone();
        comparison["cursor"] = old["cursor"].clone();
        if comparison == old {
            return;
        }
        if self.bytes == 0 && !self.entries.is_empty() {
            self.bytes = self.entries.iter().map(|r| r.to_string().len()).sum();
        }
        self.activity_entry = Some(string(&row, "id").to_owned());
        self.revision += 1;
        row["cursor"] = json!(self.revision);
        self.bytes += row.to_string().len();
        if let Some(i) = index {
            self.bytes = self.bytes.saturating_sub(self.entries[i].to_string().len());
            self.entries[i] = row;
        } else {
            self.entries.push(row);
        }
        while self.entries.len() > MAX_ENTRIES || self.bytes > MAX_BYTES {
            let removed = self.entries.remove(0);
            self.bytes = self.bytes.saturating_sub(removed.to_string().len());
            self.buffers.remove(string(&removed, "id"));
            self.partial = true;
        }
    }
    fn entry(&self, id: &str, kind: &str, status: &str) -> Value {
        let mut row = self
            .entries
            .iter()
            .find(|r| r["id"] == id)
            .cloned()
            .unwrap_or_else(|| json!({"id":id,"type":kind}));
        row["status"] = json!(status);
        row
    }
    fn end_chunk(&mut self, at: &str) {
        if let Some((id, _, _)) = self.chunk.take() {
            let row = self.entry(&id, "text", "completed");
            self.put(row, at);
        }
    }
    fn chunk(&mut self, kind: &str, delta: &str, at: &str) {
        if self.chunk.as_ref().is_some_and(|(_, k, _)| k != kind) {
            self.end_chunk(at);
        }
        let (id, _, text) = self.chunk.get_or_insert_with(|| {
            (
                format!("{}:chunk:{}", self.turn, self.revision + 1),
                kind.into(),
                String::new(),
            )
        });
        text.push_str(delta);
        let (bounded, truncated) = cut(text, MAX_TEXT);
        *text = bounded;
        let id = id.clone();
        let mut row = json!({"id":id,"type":kind,"status":"running","text":redact(text),"truncated":truncated});
        if self
            .entries
            .iter()
            .any(|r| r["id"] == id && r["truncated"] == true)
        {
            row["truncated"] = json!(true);
        }
        self.partial |= row["truncated"] == true;
        self.put(row, at);
    }
    pub fn finish(&mut self, status: &str, at: &str) {
        self.end_chunk(at);
        self.status = status.into();
        self.buffers.clear();
        let ids: Vec<_> = self
            .entries
            .iter()
            .filter(|r| {
                matches!(string(r, "status"), "running" | "pending") && r["turnId"] == self.turn
            })
            .map(|r| string(r, "id").to_owned())
            .collect();
        for id in ids {
            // A turn ending does not prove a tool succeeded.
            let row = self.entry(
                &id,
                "tool",
                if status == "cancelled" {
                    "cancelled"
                } else {
                    "unknown"
                },
            );
            self.put(row, at);
        }
    }
    pub fn resolve(&mut self, request: &Value, at: &str) {
        let id = format!("interaction:{request}");
        if self.entries.iter().any(|r| r["id"] == id) {
            let row = self.entry(&id, "interaction", "completed");
            self.put(row, at);
        }
    }
    pub fn enrich_permission(&self, msg: &mut Value) {
        let call_id = msg["params"]["toolCallId"].clone();
        let call = &mut msg["params"]["toolCall"];
        if !call.is_object() {
            *call = json!({});
        }
        if call["toolCallId"].is_null() && !call_id.is_null() {
            call["toolCallId"] = call_id;
        }
        if let Some(row) = self.entries.iter().find(|r| r["id"] == call["toolCallId"]) {
            for key in ["command", "path", "title"] {
                if call.get(key).is_none_or(Value::is_null) && !row[key].is_null() {
                    call[key] = row[key].clone();
                }
            }
        }
    }
    pub fn agent(&mut self, method: &str, msg: &Value, at: &str) {
        match method {
            "arc/user" => {
                self.end_chunk(at);
                self.turn = string(msg, "turnId").into();
                self.status = "running".into();
                let (text, truncated) = cut(&redact(string(msg, "text")), MAX_TEXT);
                self.partial |= truncated;
                self.put(json!({"id":format!("{}:user:{}",self.turn,self.revision+1),"type":"user","status":"completed","text":text,"truncated":truncated}), at);
                return;
            }
            "arc/settled" => {
                if !msg["error"].is_null() {
                    self.error(&msg["error"], at);
                }
                self.finish(string(msg, "status"), at);
                return;
            }
            "arc/interaction-resolved" => {
                self.resolve(&msg["id"], at);
                return;
            }
            _ => self.observed_events += 1,
        }
        match method {
            "session/update" => {
                let u = &msg["params"]["update"];
                match string(u, "sessionUpdate") {
                    "agent_message_chunk" => self.chunk("text", &content(&u["content"]), at),
                    "agent_thought_chunk" => self.chunk("thinking", &content(&u["content"]), at),
                    "user_message_chunk" => self.chunk("user", &content(&u["content"]), at),
                    "tool_call" | "tool_call_update" => {
                        self.end_chunk(at);
                        self.tool(u, at);
                    }
                    "plan" => {
                        self.end_chunk(at);
                        self.put(json!({"id":format!("{}:plan",self.turn),"type":"plan","status":"completed","plan":self.plan(&u["entries"]),"truncated":u["entries"].as_array().is_some_and(|r|r.len()>100)}),at);
                    }
                    _ => (),
                }
            }
            "session/request_permission" | "extension_ui_request" => {
                if method == "extension_ui_request"
                    && !matches!(
                        string(msg, "method"),
                        "select" | "confirm" | "input" | "editor"
                    )
                {
                    return;
                }
                self.end_chunk(at);
                let call = &msg["params"]["toolCall"];
                let kind = if method == "session/request_permission" || msg["method"] == "confirm" {
                    "permission"
                } else {
                    "question"
                };
                let title = [
                    string(call, "command"),
                    string(call, "path"),
                    string(call, "title"),
                    string(msg, "title"),
                    string(msg, "message"),
                ]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or("Interaction required");
                self.put(json!({"id":format!("interaction:{}",msg["id"]),"type":"interaction","status":"pending","interaction":{"kind":kind,"summary":cut(&redact(title),SUMMARY).0,"method":msg["method"],"command":sanitize(&call["command"]),"path":sanitize(&call["path"]),"title":sanitize(&call["title"]),"options":sanitize(if method=="session/request_permission" {&msg["params"]["options"]} else {&msg["options"]}),"respond":{"via":"act","op":"agent_respond","args":{"interactionId":msg["id"]}}}}),at);
            }
            "tool_execution_start" | "tool_execution_update" | "tool_execution_end" => {
                self.end_chunk(at);
                let output = if method == "tool_execution_update" {
                    &msg["partialResult"]
                } else {
                    &msg["result"]
                };
                let status = if method == "tool_execution_end" {
                    if msg["isError"] == true {
                        "failed"
                    } else {
                        "completed"
                    }
                } else {
                    "running"
                };
                let mut call =
                    json!({"toolCallId":msg["toolCallId"],"title":msg["toolName"],"status":status});
                if !msg["args"].is_null() {
                    call["rawInput"] = msg["args"].clone();
                }
                if !output.is_null() {
                    call["rawOutput"] = output.clone();
                    call["content"] = output["content"].clone();
                }
                self.tool(&call, at);
            }
            "message_update" => {
                let e = &msg["assistantMessageEvent"];
                let kind = match string(e, "type") {
                    "text_delta" => "text",
                    "thinking_delta" => "thinking",
                    _ => return,
                };
                let id = format!(
                    "{}:pi:{}:{}",
                    self.turn,
                    self.pi_message,
                    e["contentIndex"].as_u64().unwrap_or(0)
                );
                self.delta(&id, kind, string(e, "delta"), at);
            }
            "message_end" => {
                let m = &msg["message"];
                if m["role"] == "assistant" {
                    for (i, b) in m["content"].as_array().into_iter().flatten().enumerate() {
                        let kind = match string(b, "type") {
                            "text" => "text",
                            "thinking" => "thinking",
                            _ => continue,
                        };
                        let id = format!("{}:pi:{}:{i}", self.turn, self.pi_message);
                        let (text, truncated) = cut(&redact(&content(b)), MAX_TEXT);
                        self.partial |= truncated;
                        self.buffers.remove(&id);
                        self.put(json!({"id":id,"type":kind,"status":"completed","text":text,"truncated":truncated}),at);
                    }
                    if m["stopReason"] == "error" {
                        self.status = "failed".into();
                        self.error(&m["errorMessage"], at);
                    }
                    if m["stopReason"] == "aborted" {
                        self.status = "cancelled".into();
                    }
                    self.pi_message += 1;
                }
            }
            "agent_settled" => {
                let status = if matches!(self.status.as_str(), "failed" | "cancelled") {
                    self.status.clone()
                } else {
                    "completed".into()
                };
                self.finish(&status, at);
            }
            "error" => self.error(msg, at),
            _ => (),
        }
    }
    fn plan(&self, rows: &Value) -> Value {
        json!(rows.as_array().into_iter().flatten().take(100).map(|r|json!({"content":summary(r.get("content").or_else(||r.get("step")).unwrap_or(&Value::Null)),"status":r["status"],"priority":r["priority"]})).collect::<Vec<_>>())
    }
    fn delta(&mut self, id: &str, kind: &str, delta: &str, at: &str) {
        let text = self.buffers.entry(id.into()).or_default();
        text.push_str(delta);
        let (bounded, truncated) = cut(text, MAX_TEXT);
        *text = bounded;
        let mut row = json!({"id":id,"type":kind,"status":"running","truncated":truncated});
        if kind == "command" {
            row["output"] = summary(&json!(text));
        } else {
            row["text"] = json!(redact(text));
        }
        self.partial |= truncated;
        if let Some(old) = self.entries.iter().find(|r| r["id"] == id) {
            let mut merged = old.clone();
            for (k, v) in row.as_object().unwrap() {
                merged[k] = v.clone();
            }
            if old["truncated"] == true {
                merged["truncated"] = json!(true);
            }
            row = merged;
        }
        self.put(row, at);
    }
    pub fn sync_interactions(&mut self, requests: &[Value], at: &str) {
        let mut ids = std::collections::HashSet::new();
        for req in requests {
            let id = format!("interaction:{}", req["id"]);
            ids.insert(id.clone());
            let params = &req["params"];
            let item = self.entries.iter().find(|r| r["id"] == params["itemId"]);
            let summary_text = [
                string(params, "command"),
                string(params, "path"),
                string(params, "reason"),
                string(params, "title"),
                string(params, "question"),
            ]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or_else(|| {
                item.map(|r| string(r, "command"))
                    .unwrap_or("Interaction required")
            });
            self.put(json!({"id":id,"type":"interaction","status":"pending","interaction":{"kind":if string(req,"method").contains("Approval") {"permission"} else {"question"},"summary":cut(&redact(summary_text),SUMMARY).0,"request":summary(params),"respond":req["next"],"canRespond":req["canRespond"]}}),at);
        }
        let resolved: Vec<_> = self
            .entries
            .iter()
            .filter(|r| {
                r["type"] == "interaction"
                    && r["status"] == "pending"
                    && !ids.contains(string(r, "id"))
            })
            .map(|r| string(r, "id").to_owned())
            .collect();
        for id in resolved {
            let row = self.entry(&id, "interaction", "completed");
            self.put(row, at);
        }
    }
    fn error(&mut self, error: &Value, at: &str) {
        self.put(json!({"id":format!("{}:error:{}",self.turn,self.revision+1),"type":"error","status":"failed","text":summary(error)["text"]}),at);
    }
    fn tool(&mut self, u: &Value, at: &str) {
        let id = string(u, "toolCallId");
        if id.is_empty() {
            self.partial = true;
            return;
        }
        self.tool_observed = true;
        let status = match string(u, "status") {
            "pending" => "pending",
            "in_progress" | "inProgress" | "running" => "running",
            "completed" => "completed",
            "failed" => "failed",
            "cancelled" => "cancelled",
            _ => self
                .entries
                .iter()
                .find(|r| r["id"] == id)
                .and_then(|r| r["status"].as_str())
                .unwrap_or("running"),
        };
        let mut row = self.entry(id, "tool", status);
        let input = &u["rawInput"];
        if !input.is_null() || !u["kind"].is_null() || !u["title"].is_null() {
            let name = u["title"].as_str().unwrap_or(string(u, "name"));
            let (kind, operation) = tool_kind(string(u, "kind"), name, input);
            if kind != "tool" || row["type"] == "tool" {
                row["type"] = json!(kind);
            }
            if let Some(op) = operation {
                row["operation"] = json!(op);
            }
            if !name.is_empty() {
                row["title"] = json!(cut(&redact(name), SUMMARY).0);
            }
            if !input.is_null() {
                row["input"] = summary(input);
            }
            for (target, keys) in [
                ("command", vec!["command"]),
                ("cwd", vec!["cwd"]),
                ("path", vec!["file_path", "path", "filePath"]),
            ] {
                if let Some(v) = keys.iter().find_map(|k| input[*k].as_str()) {
                    row[target] = json!(cut(&redact(v), SUMMARY).0);
                }
            }
            if row["path"].is_null() {
                if let Some(path) = u["locations"][0]["path"].as_str() {
                    row["path"] = json!(cut(&redact(path), SUMMARY).0);
                }
            }
            if row["command"].is_null() && kind == "command" && !name.is_empty() {
                row["command"] = row["title"].clone();
            }
        }
        if row["type"] == "command" && row["cwd"].is_null() && self.info["project"].is_string() {
            row["cwd"] = json!(cut(&redact(string(&self.info, "project")), SUMMARY).0);
        }
        if !u["rawOutput"].is_null() || !u["content"].is_null() {
            let mut output = content(&u["content"]);
            if output.is_empty() {
                output = content(&u["rawOutput"]);
            }
            if output.is_empty() && !u["rawOutput"].is_null() {
                output = u["rawOutput"].to_string();
            }
            row["output"] = summary(&json!(output));
            if let Some(code) = exit_code(&u["rawOutput"], "") {
                row["exitCode"] = json!(code);
                row["exitCodeSource"] = json!("rawOutput");
            } else if row["exitCodeSource"] != "rawOutput" {
                if let Some(code) = exit_code(&Value::Null, &output) {
                    row["exitCode"] = json!(code);
                    row["exitCodeSource"] = json!("output");
                }
            }
        }
        self.put(row, at);
    }
    /// Project history first, then overlay observations made while the read was in flight.
    pub fn backfill_codex(&mut self, thread: &Value, baseline: u64, observed: u64, at: &str) {
        let activity_entry = self.activity_entry.clone();
        let mut history = Timeline::default();
        let turns = thread["turns"].as_array();
        history.partial = turns.is_none();
        for turn in turns.into_iter().flatten() {
            history.turn = string(turn, "id").into();
            history.status = string(turn, "status").into();
            history.partial |= !turn["items"].is_array();
            for item in turn["items"].as_array().into_iter().flatten() {
                let status = match string(item, "status") {
                    "failed" | "declined" => "failed",
                    "inProgress" | "running" => "running",
                    "completed" => "completed",
                    "cancelled" | "interrupted" => "cancelled",
                    _ if history.status == "inProgress"
                        && !matches!(
                            string(item, "type"),
                            "userMessage" | "steeringUserMessage"
                        ) =>
                    {
                        "running"
                    }
                    _ => "completed",
                };
                history.codex_item(item, status, at);
            }
        }
        let live = self.entries.clone();
        for row in &mut history.entries {
            if let Some(old) = live.iter().find(|old| old["id"] == row["id"]) {
                if old["cursor"].as_u64().unwrap_or(0) > baseline {
                    *row = old.clone();
                } else {
                    row["startedAt"] = old["startedAt"].clone();
                    if old.get("endedAt").is_some() {
                        row["endedAt"] = old["endedAt"].clone();
                    }
                }
            } else {
                // History supplies content and native duration, not an observed start/end.
                row["startedAt"] = Value::Null;
                row["endedAt"] = Value::Null;
            }
        }
        let historical_ids: std::collections::HashSet<_> = history
            .entries
            .iter()
            .map(|r| string(r, "id").to_owned())
            .collect();
        history.entries.extend(
            live.into_iter()
                .filter(|r| !historical_ids.contains(string(r, "id"))),
        );
        self.partial = history.partial || history.entries.iter().any(|r| r["truncated"] == true);
        self.tool_observed |= history.tool_observed;
        if self.observed_events == observed || self.status.is_empty() {
            self.status = history.status;
            self.turn = history.turn;
        }
        self.observed_events += 1;
        self.entries.clear();
        self.bytes = 0;
        for mut row in history.entries {
            // Preserve explicit unknown times and ordering through the incremental API.
            let started = row["startedAt"].clone();
            let ended = row.get("endedAt").cloned();
            row["position"] = json!(self.revision + 1);
            self.put(row, at);
            if let Some(row) = self.entries.last_mut() {
                row["startedAt"] = started;
                if let Some(ended) = ended {
                    row["endedAt"] = ended;
                }
            }
        }
        self.bytes = self.entries.iter().map(|r| r.to_string().len()).sum();
        if self.info.is_null() {
            self.info = json!({"id":thread["id"],"title":thread["name"],"project":thread["cwd"]});
        }
        for row in &self.entries {
            if row["status"] == "running" && matches!(string(row, "type"), "text" | "thinking") {
                self.buffers
                    .entry(string(row, "id").into())
                    .or_insert_with(|| string(row, "text").to_owned());
            }
        }
        if activity_entry.is_some() {
            self.activity_entry = activity_entry;
        }
        self.history_loaded = true;
    }
    pub fn codex_item(&mut self, item: &Value, status: &str, at: &str) {
        let id = string(item, "id");
        if id.is_empty() {
            self.partial = true;
            return;
        }
        let kind = match string(item, "type") {
            "userMessage" | "steeringUserMessage" => "user",
            "agentMessage" => "text",
            "reasoning" => "thinking",
            "commandExecution" => "command",
            "fileChange" => "file",
            "plan" => "plan",
            "error" => "error",
            "mcpToolCall"
            | "dynamicToolCall"
            | "webSearch"
            | "imageGeneration"
            | "collabAgentToolCall" => "tool",
            "contextCompaction" | "enteredReviewMode" | "exitedReviewMode" => return,
            _ => {
                self.partial = true;
                return;
            }
        };
        let mut row = self.entry(id, kind, status);
        row["type"] = json!(kind);
        if item["durationMs"].is_number() {
            row["durationMs"] = item["durationMs"].clone();
        }
        match kind {
            "user" | "text" | "thinking" => {
                let text = if kind == "thinking" {
                    content(&item["summary"])
                } else if kind == "text" {
                    content(&item["text"])
                } else {
                    content(
                        item.get("content")
                            .or_else(|| item.get("input"))
                            .unwrap_or(&Value::Null),
                    )
                };
                let (text, truncated) = cut(&redact(&text), MAX_TEXT);
                row["text"] = json!(text);
                row["truncated"] = json!(truncated);
                self.partial |= truncated;
            }
            "command" => {
                self.tool_observed = true;
                for k in ["command", "cwd"] {
                    row[k] = json!(cut(&redact(string(item, k)), SUMMARY).0);
                }
                row["output"] = summary(&item["aggregatedOutput"]);
                if item["exitCode"].is_i64() {
                    row["exitCode"] = item["exitCode"].clone();
                }
            }
            "file" => {
                self.tool_observed = true;
                let changes: Vec<_>=item["changes"].as_array().into_iter().flatten().map(|c| json!({"path":cut(&redact(string(c,"path")),SUMMARY).0,"operation":match string(&c["kind"],"type") {"add"=>Some("create"),"update"=>Some("edit"),_=>None}})).collect();
                row["path"] = changes
                    .first()
                    .map(|c| c["path"].clone())
                    .unwrap_or(Value::Null);
                if let Some(operation) = changes.first().and_then(|c| c["operation"].as_str()) {
                    row["operation"] = json!(operation);
                }
                row["changes"] = json!(changes);
            }
            "plan" => {
                row["plan"] = if item["plan"].is_array() {
                    self.plan(&item["plan"])
                } else {
                    json!([{"content":summary(&item["text"]),"status":status}])
                };
            }
            "error" => {
                row["text"] = summary(item)["text"].clone();
            }
            _ => {
                self.tool_observed |= kind == "tool";
                row["title"] = json!(string(item, "tool"));
                row["input"] = summary(&item["arguments"]);
                row["output"] = summary(&item["result"]);
            }
        }
        self.buffers.remove(id);
        self.put(row, at);
    }
    pub fn codex(&mut self, method: &str, params: &Value, at: &str) {
        self.observed_events += 1;
        match method {
            "turn/started" => { self.turn=string(&params["turn"],"id").into();self.status="running".into(); }
            "turn/completed" => {self.finish(match string(&params["turn"],"status") {"failed"=>"failed","interrupted"=>"cancelled",_=>"completed"},at);}
            "item/started"|"item/completed" => {
                if let Some(turn)=params["turnId"].as_str() {self.turn=turn.into();}
                let status=match string(&params["item"],"status") {"failed"|"declined"=>"failed",_ if method=="item/completed"=>"completed",_=>"running"};
                self.codex_item(&params["item"],status,at);
            }
            "item/agentMessage/delta"|"item/reasoning/summaryTextDelta"|"item/reasoning/textDelta"|"item/commandExecution/outputDelta" => {
                let kind=if method.contains("reasoning") {"thinking"} else if method.contains("commandExecution") {"command"} else {"text"};
                self.delta(string(params,"itemId"),kind,string(params,"delta"),at);
            }
            "turn/plan/updated" => self.put(json!({"id":format!("{}:plan",self.turn),"type":"plan","status":"completed","plan":self.plan(&params["plan"])}),at),
            "error" => self.error(params,at),
            _=>(),
        }
    }
    pub fn execution_evidence(&self) -> Value {
        if self.partial {
            json!("partial")
        } else {
            json!(self.tool_observed)
        }
    }
    pub fn evidence(&self, turn: Option<&str>) -> Value {
        json!(self
            .entries
            .iter()
            .filter(|r| matches!(string(r, "type"), "command" | "file")
                && turn.is_none_or(|t| r["turnId"] == t))
            .collect::<Vec<_>>())
    }
    pub fn response(&self, session: &str, after: u64) -> Value {
        json!({"sessionId":session,"status":self.status,"entries":self.entries.iter().enumerate().filter(|(_,r)|r["cursor"].as_u64().unwrap_or(0)>after).map(|(i,r)| { let mut row=r.clone(); if row.get("position").is_none() { row["position"]=json!(i); } row }).collect::<Vec<_>>(),"cursor":self.revision,"coverage":{"state":if self.partial {"partial"} else {"complete"},"truncated":self.partial},"executionEvidence":self.execution_evidence()})
    }
    pub fn session(&self, info: &Value, source: &str, pending: Option<Value>) -> Value {
        let latest = self
            .activity_entry
            .as_ref()
            .and_then(|id| {
                self.entries
                    .iter()
                    .find(|r| r["id"] == *id && r["type"] != "interaction")
            })
            .or_else(|| {
                self.entries
                    .iter()
                    .filter(|r| r["type"] != "interaction")
                    .max_by_key(|r| r["cursor"].as_u64())
            });
        let interaction = pending.or_else(|| {
            self.entries
                .iter()
                .rev()
                .find(|r| r["type"] == "interaction" && r["status"] == "pending")
                .map(|r| r["interaction"].clone())
        });
        let mut row = json!({"id":info["id"],"source":source,"title":redact(string(info,"title")),"project":info["project"],"phase":"idle","headline":"","startedAt":info["startedAt"],"phaseSince":info["startedAt"],"timeline":true});
        if let Some(item) = latest {
            let kind = string(item, "type");
            row["phase"] = json!(if matches!(
                kind,
                "thinking" | "command" | "file" | "tool" | "text"
            ) {
                kind
            } else {
                "idle"
            });
            let text = match kind {
                "command" => string(item, "command"),
                "file" => string(item, "path"),
                "tool" => string(item, "title"),
                _ => string(item, "text"),
            };
            row["headline"] = json!(headline(kind, text));
            row["phaseSince"] = item["startedAt"].clone();
        }
        if let Some(mut interaction) = interaction {
            if interaction["respond"]["op"] == "agent_respond" {
                interaction["respond"]["args"]["agent"] = info["agent"].clone();
                interaction["respond"]["args"]["taskId"] = info["taskId"].clone();
            }
            row["phase"] = json!("interaction");
            row["headline"] = interaction["summary"].clone();
            if let Some(pending) = self
                .entries
                .iter()
                .rev()
                .find(|r| r["type"] == "interaction" && r["status"] == "pending")
            {
                row["phaseSince"] = pending["startedAt"].clone();
            }
            row["interaction"] = interaction;
        }
        if source == "codex-thread" {
            if let Some(open) = codex_open(string(info, "id")) {
                row["open"] = open;
            }
        }
        row
    }
}
pub(crate) fn codex_open(id: &str) -> Option<Value> {
    if cfg!(target_os = "linux")
        || crate::desktop::installation().is_none()
        || uuid::Uuid::parse_str(id).is_err()
    {
        return None;
    }
    Some(json!({"kind":"url","target":format!("codex://threads/{id}")}))
}

/// Separate stream state, shared by the RPC readers; it never changes codex_* responses.
pub(crate) fn observe(
    timelines: &mut HashMap<String, Timeline>,
    session: &str,
    method: &str,
    params: &Value,
    at: &str,
    durable: bool,
) {
    if durable {
        timelines
            .entry(session.into())
            .or_default()
            .agent(method, params, at);
        return;
    }
    let thread = params["threadId"]
        .as_str()
        .or_else(|| params["conversationId"].as_str())
        .unwrap_or("");
    let Some(t) = timelines.get_mut(thread) else {
        return;
    };
    if method == "desktop/thread-stream-state-changed" {
        if params["change"]["type"] == "snapshot" {
            let state = &params["change"]["conversationState"];
            match crate::desktop::turns(state) {
                Ok(turns) => {
                    for turn in turns {
                        t.turn = string(&turn, "id").into();
                        t.status = string(&turn, "status").into();
                        for item in turn["items"].as_array().into_iter().flatten() {
                            t.codex_item(
                                item,
                                if t.status == "inProgress" {
                                    "running"
                                } else {
                                    "completed"
                                },
                                at,
                            );
                        }
                    }
                }
                Err(_) => t.partial = true,
            }
        }
    } else {
        t.codex(method, params, at);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const AT: &str = "2026-01-01T00:00:00.000Z";
    const LATER: &str = "2026-01-01T00:00:01.000Z";
    fn acp(t: &mut Timeline, update: Value, at: &str) {
        t.agent("session/update", &json!({"params":{"update":update}}), at);
    }
    fn fixture() -> Timeline {
        let rows: Vec<Value> =
            serde_json::from_str(include_str!("agents/fixtures/tracking-acp.json")).unwrap();
        let mut timeline = Timeline::default();
        for row in rows {
            timeline.agent(string(&row, "method"), &row["params"], AT);
        }
        timeline
    }
    #[test]
    fn codex_history_merges_by_item_and_preserves_inflight_updates() {
        let mut t = Timeline::default();
        t.turn = "turn".into();
        t.status = "running".into();
        t.codex_item(
            &json!({"id":"reply","type":"agentMessage","text":"partial"}),
            "running",
            AT,
        );
        let baseline = t.revision;
        t.codex_item(
            &json!({"id":"reply","type":"agentMessage","text":"new live reply"}),
            "completed",
            LATER,
        );
        let history = json!({"id":"thread","turns":[{"id":"turn","status":"completed","items":[
            {"id":"request","type":"userMessage","content":[{"text":"Example request"}]},
            {"id":"cmd","type":"commandExecution","status":"completed","command":"printf example","aggregatedOutput":"example","durationMs":750,"exitCode":0},
            {"id":"reply","type":"agentMessage","text":"older snapshot"}
        ]}]});
        t.backfill_codex(&history, baseline, 0, LATER);
        assert_eq!(t.entries.len(), 3);
        assert_eq!(t.entries[0]["id"], "request");
        assert!(t.entries[0]["startedAt"].is_null());
        assert_eq!(t.entries[1]["durationMs"], 750);
        assert_eq!(t.entries[2]["text"], "new live reply");
        assert_eq!(t.entries[2]["startedAt"], AT);
        assert_eq!(t.entries[2]["endedAt"], LATER);
        assert!(!t.partial);
        assert!(t.history_loaded);
        assert_eq!(
            t.response("thread", baseline)["entries"]
                .as_array()
                .unwrap()
                .len(),
            3
        );
        assert!(t
            .entries
            .windows(2)
            .all(|rows| rows[0]["position"].as_u64() < rows[1]["position"].as_u64()));
        let revision = t.revision;
        t.codex_item(
            &json!({"id":"reply","type":"agentMessage","text":"new live reply"}),
            "completed",
            LATER,
        );
        assert_eq!(t.revision, revision);
        assert_eq!(t.entries.len(), 3);
    }
    #[test]
    fn codex_history_completes_unobserved_items_and_detects_missing_history() {
        let mut t = Timeline::default();
        t.partial = true;
        t.codex_item(
            &json!({"id":"reply","type":"agentMessage","text":"partial"}),
            "running",
            AT,
        );
        t.backfill_codex(
            &json!({"turns":[{"id":"turn","status":"completed","items":[
                {"id":"reply","type":"agentMessage","text":"full reply"}
            ]}]}),
            t.revision,
            0,
            LATER,
        );
        assert!(!t.partial);
        assert_eq!(t.entries[0]["text"], "full reply");
        assert_eq!(t.entries[0]["status"], "completed");
        assert_eq!(t.entries[0]["startedAt"], AT);
        let mut missing = Timeline::default();
        missing.backfill_codex(&json!({"turns":[{"id":"turn"}]}), 0, 0, AT);
        assert!(missing.partial);
        let mut absent = Timeline::default();
        absent.backfill_codex(&json!({}), 0, 0, AT);
        assert!(absent.partial);
        let mut empty = Timeline::default();
        empty.backfill_codex(&json!({"turns":[]}), 0, 0, AT);
        assert!(!empty.partial);
        let mut running = Timeline::default();
        running.backfill_codex(
            &json!({"turns":[{"id":"turn","status":"inProgress","items":[
                {"id":"reply","type":"agentMessage","text":"Hello "}
            ]}]}),
            0,
            0,
            AT,
        );
        running.codex(
            "item/agentMessage/delta",
            &json!({"itemId":"reply","delta":"world"}),
            LATER,
        );
        assert_eq!(running.entries[0]["text"], "Hello world");
    }
    #[test]
    fn acp_fixture_projects_entries_evidence_and_snapshot() {
        let t = fixture();
        assert_eq!(
            t.entries
                .iter()
                .map(|r| string(r, "type"))
                .collect::<Vec<_>>(),
            ["user", "thinking", "command", "file", "plan", "text"]
        );
        assert_eq!(t.entries[1]["text"], "Inspecting the workspace");
        assert_eq!(t.entries[2]["id"], "cmd-example");
        assert_eq!(t.entries[2]["exitCode"], 0);
        assert_eq!(t.entries[2]["status"], "completed");
        assert_eq!(t.entries[3]["operation"], "read");
        assert_eq!(
            t.evidence(Some("turn-example")).as_array().unwrap().len(),
            2
        );
        assert_eq!(t.execution_evidence(), true);
        let snapshot = t.session(
            &json!({"id":"task-example","title":"Example","startedAt":AT}),
            "arc-task",
            None,
        );
        assert_eq!(snapshot["phase"], "text");
        assert_eq!(snapshot["headline"], "Check complete.");
        assert_eq!(snapshot["timeline"], true);
        assert_eq!(
            headline("text", "First sentence. Last sentence."),
            "Last sentence."
        );
    }
    #[test]
    fn incremental_chunks_and_tool_updates_keep_identity_and_start_time() {
        let mut t = Timeline::default();
        acp(
            &mut t,
            json!({"sessionUpdate":"agent_message_chunk","content":{"text":"Hello "}}),
            AT,
        );
        let cursor = t.revision;
        let id = t.entries[0]["id"].clone();
        acp(
            &mut t,
            json!({"sessionUpdate":"agent_message_chunk","content":{"text":"world"}}),
            LATER,
        );
        let delta = t.response("example", cursor);
        assert_eq!(delta["entries"][0]["id"], id);
        assert_eq!(delta["entries"][0]["text"], "Hello world");
        assert_eq!(delta["entries"][0]["startedAt"], AT);
        acp(
            &mut t,
            json!({"sessionUpdate":"tool_call","toolCallId":"shell","rawInput":{"command":"true"},"status":"in_progress"}),
            LATER,
        );
        acp(
            &mut t,
            json!({"sessionUpdate":"tool_call_update","toolCallId":"shell","status":"completed","content":[{"content":{"text":"Process exited with code 0"}}]}),
            LATER,
        );
        assert_eq!(t.entries[1]["exitCode"], 0);
        assert_eq!(t.entries[0]["endedAt"], LATER);
        assert!(t.response("example", t.revision)["entries"]
            .as_array()
            .unwrap()
            .is_empty());
    }
    #[test]
    fn resolved_approval_restores_running_command_phase_and_start() {
        let mut t = Timeline::default();
        let info = json!({"id":"task","taskId":"task","agent":"example","startedAt":AT});
        acp(
            &mut t,
            json!({"sessionUpdate":"tool_call","toolCallId":"command","kind":"execute","rawInput":{"command":"printf example"},"status":"in_progress"}),
            AT,
        );
        let request = json!({"id":17,"params":{"toolCall":{"toolCallId":"command","command":"printf example"}}});
        t.agent("session/request_permission", &request, LATER);
        assert_eq!(t.session(&info, "arc-task", None)["phase"], "interaction");
        t.resolve(&json!(17), LATER);
        let snapshot = t.session(&info, "arc-task", None);
        assert_eq!(snapshot["phase"], "command");
        assert_eq!(snapshot["headline"], "printf example");
        assert_eq!(snapshot["phaseSince"], AT);
        assert!(snapshot.get("interaction").is_none());
        // A command first observed after the approval is also selected.
        acp(
            &mut t,
            json!({"sessionUpdate":"tool_call","toolCallId":"next","kind":"execute","rawInput":{"command":"printf next"},"status":"in_progress"}),
            LATER,
        );
        t.resolve(&json!(17), "2026-01-01T00:00:02.000Z");
        let snapshot = t.session(&info, "arc-task", None);
        assert_eq!(snapshot["headline"], "printf next");
        assert_eq!(snapshot["phaseSince"], LATER);
        let mut only_interaction = Timeline::default();
        only_interaction.agent("session/request_permission", &request, AT);
        only_interaction.resolve(&json!(17), LATER);
        assert_eq!(
            only_interaction.session(&info, "arc-task", None)["phase"],
            "idle"
        );
    }
    #[test]
    fn headlines_are_plain_text_without_changing_commands_or_paths() {
        for (source, expected) in [
            (
                "**Configuring session timing**",
                "Configuring session timing",
            ),
            ("**Configuring session timin…", "Configuring session timin…"),
            ("## **Session configuration**", "Session configuration"),
            ("First sentence. **Last sentence.**", "Last sentence."),
            (
                "Use `session_config` with *defaults* and _options_.",
                "Use session_config with defaults and options.",
            ),
            (
                "See [the guide](https://example.test/guide).",
                "See the guide.",
            ),
            (
                "Read [guide][reference] and ![diagram](image.png).",
                "Read guide and diagram.",
            ),
            (
                "Keep snake_case_name intact.",
                "Keep snake_case_name intact.",
            ),
            ("~~Old~~ **New**", "Old New"),
        ] {
            assert_eq!(headline("text", source), expected, "{source}");
        }
        assert_eq!(
            headline("thinking", "First line\n### **Last thought**"),
            "Last thought"
        );
        assert_eq!(
            headline("command", "printf '**example**' && echo `pwd`"),
            "printf '**example**' && echo `pwd`"
        );
        assert_eq!(
            headline("file", "/example/snake_case/file_name.rs"),
            "/example/snake_case/file_name.rs"
        );
    }
    #[test]
    fn permission_backfill_preserves_request_and_respond_identity() {
        let mut t = Timeline::default();
        acp(
            &mut t,
            json!({"sessionUpdate":"tool_call","toolCallId":"read-1","title":"Read example","rawInput":{"file_path":"src/example.rs"}}),
            AT,
        );
        let mut req = json!({"id":17,"method":"session/request_permission","params":{"toolCall":{"toolCallId":"read-1"},"options":[{"optionId":"allow","kind":"allow_once"}]}});
        t.enrich_permission(&mut req);
        assert_eq!(req["params"]["toolCall"]["path"], "src/example.rs");
        assert_eq!(req["params"]["toolCall"]["title"], "Read example");
        assert_eq!(req["id"], 17);
        t.agent("session/request_permission", &req, LATER);
        let info = json!({"id":"task","taskId":"task","agent":"example","startedAt":AT});
        let snapshot = t.session(&info, "arc-task", None);
        assert_eq!(snapshot["phase"], "interaction");
        assert_eq!(snapshot["headline"], "src/example.rs");
        assert_eq!(
            snapshot["interaction"]["respond"]["args"],
            json!({"agent":"example","taskId":"task","interactionId":17})
        );
        t.resolve(&json!(17), LATER);
        assert_eq!(t.entries.last().unwrap()["status"], "completed");
    }
    #[test]
    fn exit_code_is_conservative_and_raw_output_wins() {
        assert_eq!(exit_code(&json!({"exitCode":3}), "Exit code: 0"), Some(3));
        assert_eq!(
            exit_code(&Value::Null, "all tests passed: 0 failures"),
            None
        );
        assert_eq!(exit_code(&Value::Null, "example says Exit code: 2"), None);
        assert_eq!(exit_code(&Value::Null, "Exit code: 2 (example)"), None);
        let mut t = fixture();
        acp(
            &mut t,
            json!({"sessionUpdate":"tool_call_update","toolCallId":"cmd-example","content":[{"content":{"text":"Exit code: 7"}}]}),
            LATER,
        );
        assert_eq!(t.entries[2]["exitCode"], 0);
        assert_eq!(t.entries[2]["status"], "completed");
        acp(
            &mut t,
            json!({"sessionUpdate":"tool_call","toolCallId":"pending-command","title":"Bash","status":"pending"}),
            AT,
        );
        acp(
            &mut t,
            json!({"sessionUpdate":"tool_call_update","toolCallId":"pending-command","status":"in_progress"}),
            LATER,
        );
        assert_eq!(t.entries.last().unwrap()["status"], "running");
        assert_eq!(
            tool_kind("other", "mcp__files__read_file", &json!({})),
            ("file", Some("read"))
        );
        t.agent(
            "arc/settled",
            &json!({"status":"failed","error":"Example error"}),
            LATER,
        );
        assert!(t
            .entries
            .iter()
            .any(|r| r["type"] == "error" && r["text"] == "Example error"));
    }
    #[test]
    fn secrets_redacted_before_summary_truncation_and_across_chunks() {
        let input = json!({"command":"echo example","nested":{"api_key":"fixture-only-value","refreshToken":"fixture-only-refresh"}});
        let out = summary(&input).to_string();
        assert!(!out.contains("fixture-only-value"));
        assert!(!out.contains("fixture-only-refresh"));
        for raw in [
            "Authorization: Bearer example-token",
            "API_KEY=example-secret",
            "password='example with spaces'",
            "https://example:password@example.test/",
            "-----BEGIN PRIVATE KEY-----\nexample-key\n-----END PRIVATE KEY-----",
        ] {
            assert!(redact(raw).contains("[REDACTED]"), "{raw}");
        }
        let mut t = Timeline::default();
        acp(
            &mut t,
            json!({"sessionUpdate":"agent_message_chunk","content":{"text":"Bearer example-"}}),
            AT,
        );
        acp(
            &mut t,
            json!({"sessionUpdate":"agent_message_chunk","content":{"text":"secret"}}),
            LATER,
        );
        assert_eq!(t.entries[0]["text"], "[REDACTED]");
        assert!(!serde_json::to_string(&t)
            .unwrap()
            .contains("example-secret"));
        assert_eq!(summary(&json!("字".repeat(1024)))["truncated"], true);
    }
    #[test]
    fn bounded_window_and_text_report_partial_and_survive_persistence() {
        let mut t = Timeline::default();
        for i in 0..=MAX_ENTRIES {
            t.put(
                json!({"id":i.to_string(),"type":"command","status":"completed"}),
                AT,
            );
        }
        assert_eq!(t.entries.len(), MAX_ENTRIES);
        assert_eq!(t.response("example", 0)["coverage"]["state"], "partial");
        assert_eq!(t.execution_evidence(), "partial");
        let saved: Timeline = serde_json::from_value(serde_json::to_value(&t).unwrap()).unwrap();
        assert_eq!(saved.response("example", 0), t.response("example", 0));
        let mut text = Timeline::default();
        acp(
            &mut text,
            json!({"sessionUpdate":"agent_message_chunk","content":{"text":"a".repeat(MAX_TEXT+1)}}),
            AT,
        );
        assert_eq!(text.entries[0]["text"].as_str().unwrap().len(), MAX_TEXT);
        assert!(text.partial);
    }
    #[test]
    fn pi_streams_final_messages_tools_and_interactions_without_duplicates() {
        let mut t = Timeline::default();
        t.agent("arc/user", &json!({"turnId":"turn","text":"Example"}), AT);
        for part in ["first ", "message"] {
            t.agent("message_update",&json!({"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":part}}),AT);
        }
        t.agent("message_end",&json!({"message":{"role":"assistant","content":[{"type":"text","text":"first message"}]}}),LATER);
        t.agent(
            "tool_execution_start",
            &json!({"toolCallId":"tool","toolName":"bash","args":{"command":"true"}}),
            LATER,
        );
        t.agent("tool_execution_end",&json!({"toolCallId":"tool","toolName":"bash","result":{"content":[{"type":"text","text":"Exit code: 0"}]},"isError":false}),LATER);
        t.agent("message_end",&json!({"message":{"role":"assistant","content":[{"type":"text","text":"second message"}]}}),LATER);
        t.agent("extension_ui_request",&json!({"id":"question","method":"select","title":"Choose an option","options":["A","B"]}),LATER);
        assert_eq!(t.entries.iter().filter(|r| r["type"] == "text").count(), 2);
        assert_eq!(t.evidence(None)[0]["exitCode"], 0);
        assert_eq!(t.entries.last().unwrap()["interaction"]["kind"], "question");
        t.resolve(&json!("question"), LATER);
        t.agent("agent_settled", &json!({}), LATER);
        assert_eq!(t.status, "completed");
    }
    #[test]
    fn codex_typed_items_deltas_and_pending_requests() {
        let mut t = Timeline::default();
        t.codex("turn/started", &json!({"turn":{"id":"turn"}}), AT);
        t.codex(
            "item/started",
            &json!({"turnId":"turn","item":{"id":"reason","type":"reasoning","summary":[]}}),
            AT,
        );
        t.codex(
            "item/reasoning/summaryTextDelta",
            &json!({"itemId":"reason","delta":"Inspect the example"}),
            LATER,
        );
        let cursor = t.revision;
        t.codex(
            "item/completed",
            &json!({"item":{"id":"reason","type":"reasoning","summary":["Inspect the example"]}}),
            LATER,
        );
        assert_eq!(
            t.response("example", cursor)["entries"][0]["text"],
            "Inspect the example"
        );
        let requests = vec![
            json!({"id":1,"method":"item/commandExecution/requestApproval","params":{"command":"printf example"},"canRespond":true,"next":{"via":"act","op":"codex_respond","args":{"id":"1","backendSession":"example"}}}),
        ];
        t.sync_interactions(&requests, LATER);
        let revision = t.revision;
        t.sync_interactions(&requests, "2026-01-01T00:00:02.000Z");
        assert_eq!(t.revision, revision);
        assert_eq!(
            t.session(&json!({"id":"example"}), "codex-thread", None)["interaction"]["respond"]
                ["op"],
            "codex_respond"
        );
        t.sync_interactions(&[], LATER);
        t.codex("item/completed",&json!({"item":{"id":"command","type":"commandExecution","command":"printf example","cwd":"/workspace/example","exitCode":0,"aggregatedOutput":"example"}}),LATER);
        t.codex(
            "turn/completed",
            &json!({"turn":{"status":"completed"}}),
            LATER,
        );
        assert_eq!(t.evidence(None)[0]["exitCode"], 0);
        assert_eq!(t.status, "completed");
    }
    #[tokio::test]
    async fn shared_codex_event_window_marks_only_observed_thread_partial() {
        let events: SharedEvents = Default::default();
        events
            .lock()
            .await
            .timelines
            .insert("example".into(), Timeline::default());
        crate::event(
            &events,
            "backend",
            "turn/started",
            json!({"threadId":"example","turn":{"id":"turn"}}),
        )
        .await;
        for _ in 0..2000 {
            crate::event(&events, "backend", "unrelated", json!({})).await;
        }
        let e = events.lock().await;
        assert!(e.timelines["example"].partial);
        assert_eq!(e.rows.len(), 2000);
    }
}
