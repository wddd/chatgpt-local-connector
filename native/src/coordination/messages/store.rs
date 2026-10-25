//! Atomic bounded owner snapshot, including reply reservations and pending projections.
use super::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
const DAY: i64 = 86400;
const MAX_ROWS: usize = 2000;
const BYTES: usize = 4 * 1024 * 1024; // Snapshot plus atomic temporary fits 8 MiB.
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Data {
    epoch: String,
    next: u64,
    floor: u64,
    messages: Vec<Row>,
    negotiations: Vec<Negotiation>,
    pending: Vec<EventInput>,
    last_push: BTreeMap<String, i64>,
    #[serde(default)]
    routes: BTreeMap<String, Route>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Row {
    pub envelope: Value,
    sequence: u64,
    digest: String,
    pub route: Option<Route>,
    pub due: i64,
    pub attempts: u32,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Negotiation {
    id: String,
    participants: [String; 2],
    initiator: String,
    resources: Vec<ResourceKey>,
    state: String,
    automatic_reply_count: u32,
    reply_limit: u32,
    created_at: i64,
    expires_at: i64,
    last_message_id: String,
    escalation_id: Option<String>,
    decisions: Vec<Value>,
}
pub(super) struct Store {
    path: PathBuf,
    data: Data,
}
impl Store {
    pub fn open(path: PathBuf) -> Result<Self> {
        private_dir(
            path.parent()
                .ok_or("COORDINATION_STORAGE: invalid messages path")?,
        )?;
        let data = if path.exists() {
            if std::fs::metadata(&path)
                .map_err(|_| "COORDINATION_STORAGE: cannot stat messages")?
                .len()
                > BYTES as u64
            {
                return Err("COORDINATION_CAPACITY: messages snapshot exceeds capacity".into());
            }
            serde_json::from_slice(
                &std::fs::read(&path).map_err(|_| "COORDINATION_STORAGE: cannot read messages")?,
            )
            .map_err(|_| "COORDINATION_CORRUPT: preserve messages snapshot for local recovery")?
        } else {
            Data {
                epoch: id(),
                next: 1,
                ..Default::default()
            }
        };
        let store = Self { path, data };
        if !store.path.exists() {
            store.save()?;
        }
        Ok(store)
    }
    fn save(&self) -> Result<()> {
        let bytes = serde_json::to_vec(&self.data).map_err(|e| e.to_string())?;
        if bytes.len() > BYTES
            || self.data.messages.len() > MAX_ROWS
            || self.data.negotiations.len() > 128
            || self.data.pending.len() > MAX_ROWS
            || self.data.last_push.len() > 128
            || self.data.routes.len() > 128
        {
            return Err("COORDINATION_CAPACITY: use local messages management to resolve escalations; wait for closed history retention".into());
        }
        super::super::journal::atomic_bytes(&self.path, &bytes)
    }
    fn transaction<T>(&mut self, f: impl FnOnce(&mut Self) -> Result<T>) -> Result<T> {
        let before = self.data.clone();
        let result = f(self).and_then(|v| {
            if serde_json::to_vec(&self.data).map_err(|e| e.to_string())?
                != serde_json::to_vec(&before).map_err(|e| e.to_string())?
            {
                self.save()?;
            }
            Ok(v)
        });
        if result.is_err() {
            self.data = before;
        }
        result
    }
    fn event(&mut self, transition: String, kind: EventKind, resources: Vec<ResourceKey>) {
        self.data
            .pending
            .push(EventInput::new(transition, kind, resources));
    }
    pub fn route_sessions(&self) -> Vec<(String, String)> {
        self.data
            .routes
            .keys()
            .filter_map(|key| {
                key.split_once(':')
                    .map(|(source, session)| (source.to_owned(), session.to_owned()))
            })
            .collect()
    }
    pub fn route(&self, source: &str, session: &str) -> Option<Route> {
        self.data
            .routes
            .get(&format!("{source}:{session}"))
            .cloned()
    }
    pub fn bind(&mut self, source: &str, session: &str, route: Option<Route>) -> Result<Value> {
        self.transaction(|s| {
            let key=format!("{source}:{session}");
            if let Some(mut route)=route {
                route.binding_id=s.data.routes.get(&key).and_then(|r|r.binding_id.clone());
                if s.data.routes.get(&key)!=Some(&route) {route.binding_id=Some(id());s.data.routes.insert(key,route);}
            } else {s.data.routes.remove(&key);}
            Ok(json!({"sessionId":session,"deliveryMode":if s.route(source,session).is_some(){"proactive"}else{"pull-only"}}))
        })
    }
    pub fn pending(&self) -> Vec<EventInput> {
        self.data.pending.iter().take(64).cloned().collect()
    }
    pub fn projected(&mut self, id: &str) -> Result<()> {
        self.transaction(|s| {
            s.data.pending.retain(|e| e.transition_id != id);
            Ok(())
        })
    }
    fn maintain(&mut self, time: i64) {
        for n in &mut self.data.negotiations {
            if n.state == "open" && n.expires_at <= time {
                n.state = "expired".into();
                self.data.pending.push(EventInput::new(
                    format!("{}-expired", n.id),
                    EventKind::NegotiationChanged,
                    n.resources.clone(),
                ));
            }
        }
        for row in &mut self.data.messages {
            if row.envelope["deliveryState"] == "pending"
                && row.envelope["expiresAt"].as_i64().unwrap_or(0) <= time
            {
                row.envelope["deliveryState"] = json!("expired");
            }
            // A reserved send may have reached the peer before restart. Never wake it again.
            if row.envelope["deliveryState"] == "sending" {
                row.envelope["deliveryState"] = json!("unconfirmed");
            }
        }
        self.data.messages.retain(|r| {
            let keep = r.envelope["createdAt"].as_i64().unwrap_or(time) > time - 7 * DAY;
            if !keep {
                self.data.floor = self.data.floor.max(r.sequence);
            }
            keep
        });
        self.data
            .negotiations
            .retain(|n| n.state == "escalated" || n.expires_at > time - 7 * DAY);
        self.data.last_push.retain(|_, at| *at > time - DAY);
    }
    fn result(&self, row: &Row) -> Value {
        let n = self
            .data
            .negotiations
            .iter()
            .find(|n| row.envelope["negotiationId"] == n.id);
        json!({"message":row.envelope,"negotiation":n,"deliveryMode":if row.route.is_some(){"proactive"}else{"pull-only"}})
    }
    pub fn send(
        &mut self,
        args: &Value,
        actor: &str,
        route: Option<Route>,
        time: i64,
    ) -> Result<Value> {
        let digest = hash(json!([actor, args]).to_string());
        if let Some(row) = self
            .data
            .messages
            .iter()
            .find(|r| r.envelope["messageId"] == args["requestId"])
        {
            if row.digest != digest {
                return Err("REQUEST_ID_CONFLICT: retain the original message arguments".into());
            }
            return Ok(self.result(row));
        }
        self.transaction(|s| s.insert(args, actor, route, time, digest))
    }
    fn insert(
        &mut self,
        args: &Value,
        actor: &str,
        route: Option<Route>,
        time: i64,
        digest: String,
    ) -> Result<Value> {
        self.maintain(time);
        let target = string(args, "toSourceId");
        if target == actor {
            return Err("INVALID_ARGUMENT: address another control source".into());
        }
        let mut participants = [actor.to_owned(), target.to_owned()];
        participants.sort();
        let resources = resources(args)?;
        let negotiation = args["negotiationId"].as_str();
        // Source pairs deliberately outlive session/account changes. Partial overlap also holds.
        if self.data.negotiations.iter().any(|n| {
            n.state == "escalated"
                && n.participants == participants
                && n.resources.iter().any(|r| resources.contains(r))
        }) {
            return Err(limit());
        }
        let reply = args["inReplyTo"].as_str();
        let mut ni = None;
        if let Some(reference) = reply {
            let n = self
                .data
                .negotiations
                .iter()
                .position(|n| Some(n.id.as_str()) == negotiation)
                .ok_or("NEGOTIATION_NOT_FOUND: read messages before replying")?;
            let old = self
                .data
                .messages
                .iter()
                .find(|r| r.envelope["messageId"] == reference)
                .ok_or("NEGOTIATION_NOT_FOUND: referenced message expired or unavailable")?;
            if old.envelope["fromSourceId"] != target
                || old.envelope["toSourceId"] != actor
                || old.envelope["negotiationId"] != self.data.negotiations[n].id
                || self.data.negotiations[n].participants != participants
                || self.data.negotiations[n].resources != resources
            {
                return Err("INVALID_ARGUMENT: reply must reference this peer's message in the same negotiation and resource set".into());
            }
            if matches!(string(args, "type"), "grant" | "deny")
                && !matches!(string(&old.envelope, "type"), "request" | "conditional")
            {
                return Err(
                    "INVALID_ARGUMENT: grant or deny must answer a request or conditional".into(),
                );
            }
            if self.data.negotiations[n].expires_at <= time {
                return Err("NEGOTIATION_EXPIRED: inspect messages and start a new request".into());
            }
            if self.data.negotiations[n].state == "resolved"
                && self.data.negotiations[n]
                    .decisions
                    .last()
                    .is_some_and(|d| d["action"] == "resolve")
            {
                return Err("NEGOTIATION_RESOLVED: the user resolved this exchange; inspect messages before starting a new request".into());
            }
            self.data.negotiations[n].automatic_reply_count += 1;
            ni = Some(n);
        } else if args["type"] == "request" {
            if self
                .data
                .negotiations
                .iter()
                .any(|n| Some(n.id.as_str()) == negotiation)
            {
                return Err("INVALID_ARGUMENT: existing negotiation requires inReplyTo".into());
            }
            if self
                .data
                .negotiations
                .iter()
                .filter(|n| n.initiator == actor && n.created_at > time - 3600)
                .count()
                >= 10
                || participants.iter().any(|participant| {
                    self.data
                        .negotiations
                        .iter()
                        .filter(|n| n.participants.contains(participant) && n.state == "open")
                        .count()
                        >= 4
                })
            {
                return Err("COORDINATION_RATE_LIMIT: at most four open negotiations per source and ten initiations per hour".into());
            }
            self.data.negotiations.push(Negotiation {
                id: negotiation.map(str::to_owned).unwrap_or_else(id),
                participants,
                initiator: actor.into(),
                resources: resources.clone(),
                state: "open".into(),
                automatic_reply_count: 0,
                reply_limit: 3,
                created_at: time,
                expires_at: time + DAY,
                last_message_id: String::new(),
                escalation_id: None,
                decisions: vec![],
            });
            ni = Some(self.data.negotiations.len() - 1);
        } else if negotiation.is_some()
            || matches!(string(args, "type"), "grant" | "deny" | "conditional")
        {
            return Err("INVALID_ARGUMENT: replies require negotiationId and inReplyTo".into());
        }
        let mid = string(args, "requestId").to_owned();
        let mut escalated = false;
        if let Some(n) = ni {
            let n = &mut self.data.negotiations[n];
            if n.automatic_reply_count > n.reply_limit {
                return Err(limit());
            }
            n.last_message_id = mid.clone();
            n.state = if n.automatic_reply_count == n.reply_limit {
                escalated = true;
                n.escalation_id = Some(id());
                "escalated"
            } else if matches!(string(args, "type"), "grant" | "deny") {
                "resolved"
            } else {
                "open"
            }
            .into();
        }
        let envelope = json!({"messageId":mid,"negotiationId":ni.map(|n|&self.data.negotiations[n].id),"inReplyTo":args["inReplyTo"],"fromSourceId":actor,"fromSessionId":args["sessionId"],"toSourceId":target,"toSessionId":args["toSessionId"],"type":args["type"],"resources":resources,"summary":args["summary"],"conditions":args["conditions"],"relatedIds":args["relatedIds"],"automatic":true,"createdAt":time,"expiresAt":time+args["ttlSeconds"].as_i64().unwrap_or(DAY),"deliveryState":if route.is_some(){"pending"}else{"pull-only"},"escalated":escalated,"dataOnly":true});
        if envelope.to_string().len() > 4096 {
            return Err("COORDINATION_CAPACITY: message envelope exceeds 4 KiB".into());
        }
        self.data.messages.push(Row {
            envelope,
            sequence: self.data.next,
            digest,
            route,
            due: time + 30,
            attempts: 0,
        });
        self.data.next += 1;
        let result = self.result(self.data.messages.last().unwrap());
        self.event(
            format!("{mid}-created"),
            EventKind::MessageCreated,
            resources.clone(),
        );
        if ni.is_some() {
            self.event(
                format!("{mid}-negotiation"),
                EventKind::NegotiationChanged,
                resources.clone(),
            );
        }
        if escalated {
            let n = self.data.negotiations[ni.unwrap()].clone();
            for participant in &n.participants {
                let recipient = self
                    .data
                    .messages
                    .iter()
                    .rev()
                    .find(|r| {
                        r.envelope["toSourceId"] == *participant
                            && r.envelope["negotiationId"] == n.id
                    })
                    .cloned();
                let route = recipient.as_ref().and_then(|r| r.route.clone());
                let to_session = recipient
                    .as_ref()
                    .map(|r| r.envelope["toSessionId"].clone());
                let envelope = json!({"messageId":format!("{}-{}",n.escalation_id.as_ref().unwrap(),hash(participant)),"negotiationId":n.id,"fromSourceId":null,"localOrigin":"arc","toSourceId":participant,"toSessionId":to_session,"type":"notice","resources":resources,"summary":"Automatic reply budget exhausted. Ask the user to mediate; further automatic negotiation is stopped.","automatic":true,"createdAt":time,"expiresAt":time+DAY,"deliveryState":if route.is_some(){"pending"}else{"pull-only"},"escalated":true,"dataOnly":true});
                self.data.messages.push(Row {
                    envelope,
                    sequence: self.data.next,
                    digest: String::new(),
                    route,
                    due: time + 30,
                    attempts: 0,
                });
                self.data.next += 1;
            }
        }
        Ok(result)
    }
    pub fn list(&mut self, args: &Value, actor: &str, revision: &str, time: i64) -> Result<Value> {
        self.transaction(|s| {
            s.maintain(time);
            Ok(())
        })?;
        let direction = args["direction"].as_str().unwrap_or("inbox");
        let scope = hash(
            json!([
                actor,
                revision,
                direction,
                args["sessionId"],
                args["negotiationId"]
            ])
            .to_string(),
        );
        let after = if let Some(cursor) = args["cursor"].as_str() {
            let v: Value = URL_SAFE_NO_PAD
                .decode(cursor)
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
                .ok_or("MESSAGES_CURSOR_EXPIRED: restart messages pagination")?;
            let sequence = v["after"]
                .as_u64()
                .ok_or("MESSAGES_CURSOR_EXPIRED: invalid cursor")?;
            if v["epoch"] != self.data.epoch
                || v["scope"] != scope
                || sequence < self.data.floor
                || sequence >= self.data.next
            {
                return Err("MESSAGES_CURSOR_EXPIRED: restart pagination with current authority and filters".into());
            }
            sequence
        } else {
            self.data.floor
        };
        let limit = args["limit"].as_u64().unwrap_or(50) as usize;
        let matching: Vec<_> = self
            .data
            .messages
            .iter()
            .filter(|r| {
                r.sequence > after
                    && (actor == "local-authority"
                        || if direction == "outbox" {
                            r.envelope["fromSourceId"] == actor
                        } else {
                            r.envelope["toSourceId"] == actor
                        })
                    && args["negotiationId"]
                        .as_str()
                        .is_none_or(|n| r.envelope["negotiationId"] == n)
                    && args["sessionId"].as_str().is_none_or(|n| {
                        r.envelope[if direction == "outbox" {
                            "fromSessionId"
                        } else {
                            "toSessionId"
                        }] == n
                    })
            })
            .collect();
        let rows: Vec<_> = matching
            .iter()
            .take(limit)
            .map(|r| r.envelope.clone())
            .collect();
        let last = matching
            .iter()
            .take(limit)
            .last()
            .map_or(self.data.next - 1, |r| r.sequence);
        let cursor = URL_SAFE_NO_PAD
            .encode(json!({"epoch":self.data.epoch,"scope":scope,"after":last}).to_string());
        let negotiations: Vec<_> = self
            .data
            .negotiations
            .iter()
            .filter(|n| {
                (actor == "local-authority" || n.participants.contains(&actor.to_owned()))
                    && args["negotiationId"].as_str().is_none_or(|id| id == n.id)
            })
            .collect();
        Ok(
            json!({"messages":rows,"negotiations":negotiations,"nextCursor":cursor,"hasMore":matching.len()>limit,"dataOnly":true,"projectionPending":!self.data.pending.is_empty()}),
        )
    }
    pub fn batches(&mut self, time: i64) -> Result<Vec<Vec<Row>>> {
        self.transaction(|s| {
            s.maintain(time);
            Ok(())
        })?;
        let mut groups: BTreeMap<String, Vec<Row>> = BTreeMap::new();
        for row in &self.data.messages {
            if row.envelope["deliveryState"] != "pending" || row.due > time {
                continue;
            }
            if let Some(route) = &row.route {
                if self
                    .data
                    .last_push
                    .get(&route.key())
                    .is_none_or(|at| time - at >= 60)
                {
                    groups.entry(route.key()).or_default().push(row.clone());
                }
            }
        }
        // Include later arrivals in the same target's first due batch.
        for rows in groups.values_mut() {
            let key = rows[0].route.as_ref().unwrap().key();
            *rows = self
                .data
                .messages
                .iter()
                .filter(|r| {
                    r.envelope["deliveryState"] == "pending"
                        && r.route.as_ref().is_some_and(|t| t.key() == key)
                })
                .cloned()
                .collect();
        }
        Ok(groups.into_values().take(16).collect())
    }
    pub fn mark(&mut self, rows: &[Row], state: &str, time: i64) -> Result<()> {
        self.transaction(|s| {
            for row in rows {
                if let Some(r) = s
                    .data
                    .messages
                    .iter_mut()
                    .find(|r| r.sequence == row.sequence)
                {
                    r.envelope["deliveryState"] = json!(state);
                    if state == "sending" {
                        r.attempts += 1;
                        s.data
                            .last_push
                            .insert(r.route.as_ref().unwrap().key(), time);
                    }
                    if state == "pending" {
                        r.due = time + 60;
                        r.attempts = r.attempts.saturating_sub(1);
                    }
                }
            }
            if !matches!(state, "sending" | "pending") {
                if let Some(row) = rows.first() {
                    s.event(
                        format!("{}-delivery-{}", string(&row.envelope, "messageId"), state),
                        EventKind::MessageDelivery,
                        resources(&row.envelope)?,
                    );
                }
            }
            Ok(())
        })
    }
    pub fn mediate(&mut self, args: &Value, time: i64) -> Result<Value> {
        self.transaction(|s| {
            let n=s.data.negotiations.iter_mut().find(|n|n.id==string(args,"negotiationId")).ok_or("NEGOTIATION_NOT_FOUND: inspect local messages")?;
            if n.last_message_id!=string(args,"expectedLastMessageId") {return Err("NEGOTIATION_CONFLICT: reread the local negotiation".into());}
            if n.decisions.len()>=64 {return Err("COORDINATION_CAPACITY: local decision history is full".into());}
            n.decisions.push(json!({"at":time,"actor":"local-authority","action":args["action"],"reason":args["reason"]}));
            n.state=if args["action"]=="reopen" {"open"}else{"resolved"}.into(); if args["action"]=="reopen" {n.automatic_reply_count=0; n.expires_at=time+DAY;} n.escalation_id=None;
            let result=json!(n); let resources=n.resources.clone();
            s.event(format!("{}-mediated-{}",string(args,"negotiationId"),id()),EventKind::NegotiationChanged,resources);
            Ok(json!({"negotiation":result}))
        })
    }
}
fn limit() -> String {
    "NEGOTIATION_LIMIT: three combined automatic replies exhausted; both participants must stop and ask the user to mediate in local ARC management".into()
}
