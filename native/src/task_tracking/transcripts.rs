//! Native transcript framing feeds the same entry converters as live streams.
use super::*;

impl Timeline {
    pub fn transcript_turn_start(&self) -> Option<(&str, &str)> {
        self.turn_started_at
            .as_deref()
            .map(|at| (self.turn.as_str(), at))
    }
    pub fn prompt_headline(&self) -> String {
        self.entries
            .iter()
            .rev()
            .find(|row| row["type"] == "user")
            .map(entry_headline)
            .unwrap_or_default()
    }
    fn transcript_metadata(&mut self, record: &Value) {
        if self.info.is_null() {
            self.info = json!({});
        }
        if self.info["startedAt"].is_null() && record["timestamp"].is_string() {
            self.info["startedAt"] = record["timestamp"].clone();
        }
        let payload = &record["payload"];
        if let Some(project) = record["cwd"].as_str().or_else(|| payload["cwd"].as_str()) {
            self.info["project"] = json!(project);
        }
        if let Some(id) = record["sessionId"].as_str().or_else(|| {
            (record["type"] == "session_meta")
                .then(|| payload["id"].as_str())
                .flatten()
        }) {
            self.info["id"] = json!(id);
        }
    }

    pub fn backfill_transcript(&mut self, agent: &str, records: &[Value]) {
        if agent == "claude" {
            self.backfill_claude(records);
        } else {
            self.backfill_codex_records(records);
        }
    }

    /// Rollout framing is translated to native item inputs, then uses codex_item
    /// just like app-server history and live item notifications.
    pub fn backfill_codex_records(&mut self, records: &[Value]) {
        for record in records {
            self.transcript_metadata(record);
            let at = string(record, "timestamp");
            let p = &record["payload"];
            if record["type"] == "turn_context" {
                if let Some(turn) = p["turn_id"].as_str() {
                    self.turn = turn.into();
                }
                continue;
            }
            if record["type"] == "event_msg" {
                match string(p, "type") {
                    "task_started" => {
                        self.codex("turn/started", &json!({"turn":{"id":p["turn_id"]}}), at);
                        self.transcript_activity = Some((at.into(), 90));
                    }
                    "task_complete" | "turn_aborted" => self.finish(
                        if p["type"] == "task_complete" {
                            "completed"
                        } else {
                            "cancelled"
                        },
                        at,
                    ),
                    "warning" => self.notice(None, "warning", "message", p, at),
                    "stream_error" => self.notice(None, "retry", "start", p, at),
                    "context_compacted" => self.notice(None, "compaction", "end", p, at),
                    _ => (),
                }
                continue;
            }
            if record["type"] == "compacted" {
                self.notice(None, "compaction", "end", p, at);
                continue;
            }
            if record["type"] != "response_item" {
                continue;
            }
            let generated_id = format!("rollout:{}", self.revision + 1);
            let id = p["id"]
                .as_str()
                .or_else(|| p["call_id"].as_str())
                .unwrap_or(&generated_id);
            match string(p, "type") {
                "message" => {
                    let role = string(p, "role");
                    if !matches!(role, "user" | "assistant") {
                        continue;
                    }
                    let text = transcript_text(&content(&p["content"]));
                    if text.trim().is_empty() {
                        continue;
                    }
                    self.codex_item(&json!({"id":id,"type":if role == "user" {"userMessage"} else {"agentMessage"},"content":text,"text":text,"phase":p["phase"]}), "completed", at);
                }
                "reasoning" => self.codex_item(
                    &json!({"id":id,"type":"reasoning","summary":p["summary"]}),
                    "completed",
                    at,
                ),
                "function_call" | "custom_tool_call" | "local_shell_call" => {
                    let input = if p["type"] == "local_shell_call" {
                        let command = p["action"]["command"].as_array().map(|parts| {
                            parts
                                .iter()
                                .filter_map(Value::as_str)
                                .collect::<Vec<_>>()
                                .join(" ")
                        });
                        json!({"command":command,"cwd":p["action"]["working_directory"]})
                    } else {
                        parsed_input(p.get("arguments").unwrap_or(&p["input"]))
                    };
                    self.tool(&json!({"toolCallId":p.get("call_id").unwrap_or(&json!(id)),"title":p["name"],"rawInput":input,"status":"unknown"}), at);
                    self.transcript_activity = Some((at.into(), 300));
                }
                "function_call_output" | "custom_tool_call_output" => {
                    self.tool(&json!({"toolCallId":p["call_id"],"rawOutput":p["output"],"status":"completed"}), at);
                    self.transcript_activity = Some((at.into(), 90));
                }
                "web_search_call" | "tool_search_call" => {
                    self.codex_item(&json!({"id":id,"type":"dynamicToolCall","tool":p["type"],"arguments":p["action"]}), "unknown", at);
                    self.transcript_activity = Some((at.into(), 300));
                }
                "tool_search_output" => {
                    self.transcript_activity = Some((at.into(), 90));
                }
                _ => self.partial = true,
            }
        }
    }

    pub fn transcript_active(
        &self,
        modified: std::time::SystemTime,
        now: std::time::SystemTime,
    ) -> bool {
        if self.entries.is_empty() && self.omitted_sidechain_records > 0 {
            return false;
        }
        if matches!(self.status.as_str(), "completed" | "failed" | "cancelled") {
            return false;
        }
        let (at, grace) = self
            .transcript_activity
            .as_ref()
            .map(|(at, grace)| {
                (
                    chrono::DateTime::parse_from_rfc3339(at)
                        .ok()
                        .map(|at| std::time::SystemTime::from(at.with_timezone(&chrono::Utc)))
                        .unwrap_or(modified),
                    *grace,
                )
            })
            .unwrap_or((modified, 30));
        now.duration_since(at).unwrap_or_default() <= std::time::Duration::from_secs(grace)
    }

    pub fn transcript_session(&self, id: &str, agent: &str) -> Value {
        let mut info = self.info.clone();
        if !info.is_object() {
            info = json!({});
        }
        info["title"] = json!(self
            .entries
            .iter()
            .rev()
            .find(|r| r["type"] == "user")
            .map(entry_headline)
            .unwrap_or_default());
        let mut row = self.session(id, &info, "transcript", None);
        // A transcript's user prompt represents thinking while native work starts.
        if row["phase"] == "idle" {
            row["phase"] = json!("thinking");
        }
        if agent == "codex" {
            if let Some(open) = crate::agents::driver::AgentDriver::CodexNative.navigation(id) {
                row["open"] = open;
            }
        }
        row
    }
    /// Local Claude history uses the same text/tool vocabulary, without approvals.
    pub fn backfill_claude(&mut self, records: &[Value]) {
        for record in records {
            if record["isSidechain"] == true {
                self.omitted_sidechain_records += 1;
                continue;
            }
            let at = string(record, "timestamp");
            self.transcript_metadata(record);
            if record["type"] == "system" && record["subtype"] == "compact_boundary" {
                self.notice(
                    record["uuid"].as_str(),
                    "compaction",
                    "end",
                    &record["compactMetadata"],
                    at,
                );
                continue;
            }
            let role = record["message"]["role"]
                .as_str()
                .unwrap_or_else(|| string(record, "type"));
            if record["isMeta"] == true || !matches!(role, "user" | "assistant") {
                continue;
            }
            if at.is_empty() {
                self.partial = true;
                continue;
            }
            let native_id = string(record, "uuid");
            let generated_id;
            let id = if native_id.is_empty() {
                // Missing identity must not discard native content. Keep the
                // fallback stable across tail/history reads, with partial coverage.
                self.partial = true;
                generated_id = format!("claude:{}", hash(record.to_string()));
                generated_id.as_str()
            } else {
                native_id
            };
            if record["cwd"].is_string() {
                self.info["project"] = record["cwd"].clone();
            }
            let raw = &record["message"]["content"];
            let blocks = if raw.is_string() {
                vec![json!({"type":"text","text":raw})]
            } else {
                raw.as_array().cloned().unwrap_or_default()
            };
            let user_text = blocks
                .iter()
                .filter(|b| b["type"] == "text")
                .map(|b| transcript_text(string(b, "text")))
                .collect::<Vec<_>>()
                .join("\n");
            if role == "user" && !user_text.trim().is_empty() {
                self.turn = id.into();
                self.turn_started_at = Some(at.into());
                self.status.clear();
                self.start_turn(at);
            }
            self.transcript_activity = Some((
                at.into(),
                if role == "assistant" && record["message"]["stop_reason"] == "tool_use" {
                    300
                } else {
                    90
                },
            ));
            for (index, block) in blocks.iter().enumerate() {
                match string(block, "type") {
                    "text" | "thinking" => {
                        let thinking = block["type"] == "thinking";
                        let text = transcript_text(string(
                            block,
                            if thinking { "thinking" } else { "text" },
                        ));
                        if text.trim().is_empty() && !thinking {
                            continue;
                        }
                        let (text, truncated) = cut(&redact(&text), MAX_TEXT);
                        self.put(json!({"id":format!("{id}:{index}"),"type":if role == "user" {"user"} else if thinking {"thinking"} else {"text"},"status":"completed","text":text,"truncated":truncated}), at);
                    }
                    "tool_use" => {
                        self.tool(&json!({"toolCallId":block["id"],"title":block["name"],"rawInput":block["input"],"status":"unknown"}), at);
                        // A request alone does not establish execution or an end time.
                        if let Some(row) = self.entries.iter_mut().find(|r| r["id"] == block["id"])
                        {
                            row.as_object_mut().unwrap().remove("endedAt");
                        }
                    }
                    "tool_result" => {
                        if !self.entries.iter().any(|e| e["id"] == block["tool_use_id"]) {
                            self.partial = true;
                        }
                        self.tool(&json!({"toolCallId":block["tool_use_id"],"rawOutput":block["content"],"status":if block["is_error"] == true {"failed"} else {"completed"}}), at);
                    }
                    _ => self.partial = true,
                }
            }
            if role == "user" && user_text.contains("[Request interrupted by user") {
                self.finish("cancelled", at);
            }
            if role == "assistant"
                && matches!(
                    string(&record["message"], "stop_reason"),
                    "end_turn" | "stop_sequence"
                )
            {
                self.finish("completed", at);
            }
        }
    }
}
