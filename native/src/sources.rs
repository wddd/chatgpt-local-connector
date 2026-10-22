//! Core-owned control-source identity. Credentials anchor identity; names never do.
use crate::*;
use std::collections::BTreeMap;
use std::sync::{OnceLock, RwLock};
use std::time::{Duration, Instant};

struct Cache {
    current: Value,
    persisted: Value,
    last_seen_writes: BTreeMap<String, Instant>,
}
static CACHE: OnceLock<RwLock<Cache>> = OnceLock::new();
static WRITER: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
fn path() -> PathBuf {
    root().join("sources.json")
}
fn read() -> Result<Value> {
    if path().exists() {
        load(&path())
    } else {
        Ok(json!({"version":0,"sources":[]}))
    }
}
fn cache() -> Result<&'static RwLock<Cache>> {
    CACHE
        .get()
        .ok_or_else(|| "Source store is not initialized".into())
}
/// Called once after the state lock, before serving requests.
pub fn initialize() -> Result<()> {
    migrate()?;
    let mut store = read()?;
    let previous = store.clone();
    reconcile(
        store["sources"]
            .as_array_mut()
            .ok_or("Invalid source store")?,
    )?;
    if store != previous {
        save(&path(), &store)?;
    }
    let last_seen_writes = store["sources"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|s| !s["lastSeenAt"].is_null())
        .map(|s| (string(s, "id").to_owned(), Instant::now()))
        .collect();
    CACHE
        .set(RwLock::new(Cache {
            current: store.clone(),
            persisted: store,
            last_seen_writes,
        }))
        .map_err(|_| "Source store is already initialized".into())
}
async fn change<T: Send + 'static>(
    f: impl FnOnce(&mut Vec<Value>) -> Result<T> + Send + 'static,
) -> Result<T> {
    transaction(false, f).await
}
async fn transaction<T: Send + 'static>(
    activity: bool,
    f: impl FnOnce(&mut Vec<Value>) -> Result<T> + Send + 'static,
) -> Result<T> {
    // Own the transaction so request cancellation cannot separate a disk commit
    // from its cache update. The async writer gate never blocks executor threads.
    tokio::spawn(async move {
        let _writer = WRITER.lock().await;
        let (mut current, persisted, mut last_seen_writes) = {
            let cache = cache()?.read().map_err(|e| e.to_string())?;
            (
                cache.current.clone(),
                cache.persisted.clone(),
                cache.last_seen_writes.clone(),
            )
        };
        let previous = current.clone();
        let result = f(current["sources"]
            .as_array_mut()
            .ok_or("Invalid source store")?)?;
        if current == previous && !activity {
            return Ok(result);
        }
        let mut disk = current.clone();
        let at = Instant::now();
        let mut seen_changes = vec![];
        for source in disk["sources"].as_array_mut().unwrap() {
            let id = string(source, "id").to_owned();
            let old = persisted["sources"]
                .as_array()
                .unwrap()
                .iter()
                .find(|s| s["id"] == id);
            let old_seen = old.map(|s| s["lastSeenAt"].clone()).unwrap_or(Value::Null);
            if source["lastSeenAt"] != old_seen {
                if last_seen_writes
                    .get(&id)
                    .is_some_and(|t| at.duration_since(*t) < Duration::from_secs(60))
                {
                    source["lastSeenAt"] = old_seen;
                } else {
                    seen_changes.push(id);
                }
            }
        }
        if disk != persisted {
            let snapshot = disk.clone();
            tokio::task::spawn_blocking(move || save(&path(), &snapshot))
                .await
                .map_err(|e| e.to_string())??;
        }
        // Measure the throttle from completed persistence, not queue time.
        for id in seen_changes {
            last_seen_writes.insert(id, Instant::now());
        }
        let mut cache = cache()?.write().map_err(|e| e.to_string())?;
        // Activity may advance while the disk snapshot is being saved.
        for source in current["sources"].as_array_mut().unwrap() {
            if let Some(live) = cache.current["sources"]
                .as_array()
                .unwrap()
                .iter()
                .find(|s| s["id"] == source["id"])
            {
                source["lastSeenAt"] = live["lastSeenAt"].clone();
            }
        }
        cache.current = current;
        cache.persisted = disk;
        cache.last_seen_writes = last_seen_writes;
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
pub fn list() -> Result<Vec<Value>> {
    let cache = cache()?.read().map_err(|e| e.to_string())?;
    Ok(cache.current["sources"]
        .as_array()
        .ok_or("Invalid source store")?
        .clone())
}
pub fn get(id: &str) -> Result<Value> {
    list()?
        .into_iter()
        .find(|s| s["id"] == id)
        .ok_or("SOURCE_NOT_FOUND".into())
}
fn product(id: &str) -> Result<Value> {
    crate::control_sources::presets()
        .iter()
        .find(|p| p["id"] == id)
        .cloned()
        .ok_or("UNKNOWN_PRODUCT: read ingress presets".into())
}
fn normalized(id: &str) -> &str {
    if crate::control_sources::presets()
        .iter()
        .any(|p| p["id"] == id)
    {
        id
    } else {
        "custom"
    }
}
pub fn match_product(name: &str) -> String {
    let name = name.to_lowercase();
    // Product inference is a correctable default, never an identity match.
    for p in crate::control_sources::presets().iter().rev() {
        if p["id"] == "custom" || p["id"] == "local-cli" {
            continue;
        }
        if [string(p, "id"), string(p, "displayName")]
            .iter()
            .any(|s| !s.is_empty() && name.contains(&s.to_lowercase()))
        {
            return string(p, "id").into();
        }
    }
    for p in crate::control_sources::presets() {
        if !["custom", "local"].contains(&string(p, "platform"))
            && name.contains(string(p, "platform"))
        {
            return string(p, "id").into();
        }
    }
    "custom".into()
}
fn make(
    rows: &[Value],
    ingress: &Value,
    credential: Value,
    product_id: &str,
    connected: Value,
) -> Value {
    let product_id = normalized(product_id);
    let p = crate::control_sources::preset(product_id);
    let names = rows
        .iter()
        .map(|s| string(s, "label").to_owned())
        .collect::<Vec<_>>();
    json!({"id":id(),"ingressId":ingress["id"],"credential":credential,
        "product":product_id,"platform":p["platform"],"label":crate::control_sources::default_name(product_id,&names),
        "createdAt":now(),"connectedAt":connected,"lastSeenAt":null,"state":"disconnected"})
}
pub async fn ensure_ingress(entry: &Value) -> Result<Value> {
    let entry = entry.clone();
    change(move |rows| {
        if let Some(s) = rows
            .iter()
            .find(|s| s["ingressId"] == entry["id"] && s["credential"]["type"] != "oauth-grant")
        {
            return Ok(s.clone());
        }
        let credential =
            json!({"type":if entry["transport"] == "local" { "local" } else { "ingress" }});
        let source = make(
            rows,
            &entry,
            credential,
            string(&entry, "controlSource"),
            Value::Null,
        );
        rows.push(source.clone());
        Ok(source)
    })
    .await
}
pub async fn pending(entry: &Value, grant: &str, client: &str, name: &str) -> Result<Value> {
    let entry = entry.clone();
    let grant = grant.to_owned();
    let client = client.to_owned();
    let name = name.to_owned();
    change(move |rows| {
        if let Some(s) = rows
            .iter()
            .find(|s| s["ingressId"] == entry["id"] && s["credential"]["grantId"] == grant)
        {
            return Ok(s.clone());
        }
        let product = if entry["transport"] == "relay" {
            match_product(&name)
        } else {
            normalized(string(&entry, "controlSource")).into()
        };
        let s = make(
            rows,
            &entry,
            json!({"type":"oauth-grant","grantId":grant,"clientId":client}),
            &product,
            Value::Null,
        );
        rows.push(s.clone());
        Ok(s)
    })
    .await
}
pub fn for_grant(ingress: &str, grant: &str) -> Result<Value> {
    list()?
        .into_iter()
        .find(|s| s["ingressId"] == ingress && s["credential"]["grantId"] == grant)
        .ok_or("SOURCE_NOT_FOUND".into())
}
pub async fn update(id: &str, body: &Value) -> Result<Value> {
    let id = id.to_owned();
    let body = body.clone();
    if !body.is_object()
        || body
            .as_object()
            .unwrap()
            .keys()
            .any(|k| !["label", "product"].contains(&k.as_str()))
    {
        return Err("Expected label and/or product".into());
    }
    let p = body
        .get("product")
        .map(|v| product(v.as_str().unwrap_or("")))
        .transpose()?;
    if let Some(label) = body.get("label") {
        if !label.as_str().is_some_and(|v| {
            !v.trim().is_empty() && v.len() <= 120 && !v.chars().any(char::is_control)
        }) {
            return Err("Invalid source label".into());
        }
    }
    change(move |rows| {
        let s = rows
            .iter_mut()
            .find(|s| s["id"] == id)
            .ok_or("SOURCE_NOT_FOUND")?;
        if let Some(p) = p {
            s["product"] = p["id"].clone();
            s["platform"] = p["platform"].clone();
        }
        if let Some(label) = body.get("label") {
            s["label"] = label.clone();
        }
        Ok(s.clone())
    })
    .await
}
pub fn candidates(source: &Value, grants: &[String]) -> Result<Vec<Value>> {
    Ok(list()?
        .into_iter()
        .filter(|s| {
            s["id"] != source["id"]
                && s["ingressId"] == source["ingressId"]
                && s["product"] == source["product"]
                && s["credential"]["type"] == "oauth-grant"
                && (s["state"] == "revoked"
                    || !s["connectedAt"].is_null()
                    || grants.iter().any(|g| *g == s["credential"]["grantId"]))
        })
        .collect())
}
pub fn validate_claim(pending: &Value, target: &str, grants: &[String]) -> Result<()> {
    if target == "new" {
        return Ok(());
    }
    if candidates(pending, grants)?
        .iter()
        .any(|s| s["id"] == target)
    {
        Ok(())
    } else {
        Err("INVALID_SOURCE_CLAIM: select new or an existing source of the same product on this connection".into())
    }
}
/// Move the anchor only after PKCE succeeds. The caller removes the returned old grant before issuing tokens.
pub async fn connect(
    ingress: &str,
    grant: &str,
    target: &str,
    grants: &[String],
) -> Result<Option<String>> {
    let pending = for_grant(ingress, grant)?;
    validate_claim(&pending, target, grants)?;
    let target = target.to_owned();
    change(move |rows| {
        let current = rows
            .iter()
            .find(|s| s["id"] == pending["id"])
            .ok_or("SOURCE_NOT_FOUND")?;
        if current["credential"] != pending["credential"]
            || current["product"] != pending["product"]
            || current["state"] == "revoked"
        {
            return Err("SOURCE_CHANGED: retry consent".into());
        }
        let chosen = if target == "new" {
            string(&pending, "id")
        } else {
            &target
        };
        let s = rows
            .iter_mut()
            .find(|s| s["id"] == chosen)
            .ok_or("SOURCE_NOT_FOUND")?;
        if s["product"] != pending["product"]
            || s["ingressId"] != pending["ingressId"]
            || s["credential"]["type"] != "oauth-grant"
        {
            return Err("SOURCE_CHANGED: retry consent".into());
        }
        let old = (target != "new").then(|| string(&s["credential"], "grantId").to_owned());
        s["credential"] = pending["credential"].clone();
        if s["connectedAt"].is_null() {
            s["connectedAt"] = json!(chrono::Utc::now().timestamp());
        }
        s["state"] = json!("connected");
        if target != "new" {
            rows.retain(|s| s["id"] != pending["id"]);
        }
        Ok(old)
    })
    .await
}
pub async fn revoke_grants(ingress: &str, grants: &[String]) -> Result<()> {
    if grants.is_empty() {
        return Ok(());
    }
    let ingress = ingress.to_owned();
    let grants = grants.to_vec();
    change(move |rows| {
        for s in rows {
            if s["ingressId"] == ingress && grants.iter().any(|g| s["credential"]["grantId"] == *g)
            {
                s["state"] = json!("revoked");
            }
        }
        Ok(())
    })
    .await
}
pub async fn disconnect(id: &str) -> Result<Value> {
    let id = id.to_owned();
    change(move |rows| {
        let s = rows
            .iter_mut()
            .find(|s| s["id"] == id)
            .ok_or("SOURCE_NOT_FOUND")?;
        s["state"] = json!("revoked");
        Ok(s.clone())
    })
    .await
}
pub async fn connection_state(ingress: &str, connected: bool) -> Result<()> {
    let ingress = ingress.to_owned();
    change(move |rows| {
        for s in rows {
            if s["ingressId"] == ingress
                && s["state"] != "revoked"
                && (s["credential"]["type"] != "oauth-grant" || !s["connectedAt"].is_null())
            {
                s["state"] = json!(if connected {
                    "connected"
                } else {
                    "disconnected"
                });
            }
        }
        Ok(())
    })
    .await
}
pub fn origin(source: &Value, auth: &str) -> Value {
    json!({"ingressId":source["ingressId"],"sourceId":source["id"],"controlSource":source["product"],"authType":auth,"sourceLabel":source["label"]})
}
pub async fn touch(source: &Value, auth: &str) -> Result<Value> {
    let source_id = string(source, "id");
    let (result, persist) = {
        let mut cache = cache()?.write().map_err(|e| e.to_string())?;
        let due = cache
            .last_seen_writes
            .get(source_id)
            .is_none_or(|t| t.elapsed() >= Duration::from_secs(60));
        let s = cache.current["sources"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|s| s["id"] == source_id)
            .ok_or("SOURCE_NOT_FOUND")?;
        if s["state"] == "revoked" || s["credential"] != source["credential"] {
            return Err("SOURCE_REVOKED".into());
        }
        // Telemetry is immediately visible, even while a durable mutation is in flight.
        s["lastSeenAt"] = json!(chrono::Utc::now().timestamp());
        (
            origin(s, auth),
            due || s["state"] != "connected" || s["connectedAt"].is_null(),
        )
    };
    if !persist {
        return Ok(result);
    }
    let source = source.clone();
    let auth = auth.to_owned();
    transaction(true, move |rows| {
        let s = rows
            .iter_mut()
            .find(|s| s["id"] == source["id"])
            .ok_or("SOURCE_NOT_FOUND")?;
        if s["state"] == "revoked" || s["credential"] != source["credential"] {
            return Err("SOURCE_REVOKED".into());
        }
        s["state"] = json!("connected");
        if s["connectedAt"].is_null() {
            s["connectedAt"] = s["lastSeenAt"].clone();
        }
        Ok(origin(s, &auth))
    })
    .await
}
pub async fn local_origin() -> Result<Value> {
    let s =
        ensure_ingress(&json!({"id":"local-cli","transport":"local","controlSource":"local-cli"}))
            .await?;
    touch(&s, "local").await
}
/// Labels are read from the current store, including retained revoked sources.
pub fn decorate(value: &mut Value) {
    let Ok(rows) = list() else {
        return;
    };
    fn visit(v: &mut Value, rows: &[Value]) {
        match v {
            Value::Object(o) => {
                if let Some(s) = o
                    .get("sourceId")
                    .filter(|_| o.contains_key("authType"))
                    .and_then(|id| rows.iter().find(|s| s["id"] == *id))
                {
                    o.insert("sourceLabel".into(), s["label"].clone());
                }
                for (key, v) in o.iter_mut() {
                    if ![
                        "arguments",
                        "args",
                        "input",
                        "output",
                        "metadata",
                        "items",
                        "finalResponse",
                        "externalUserInputs",
                    ]
                    .contains(&key.as_str())
                    {
                        visit(v, rows);
                    }
                }
            }
            Value::Array(a) => {
                for v in a {
                    visit(v, rows);
                }
            }
            _ => {}
        }
    }
    visit(value, &rows);
}

/// Restartable one-time conversion. Persist identities before rewriting references.
pub fn migrate() -> Result<()> {
    let mut store = read()?;
    if store["version"] == 1 {
        return Ok(());
    }
    let pref_path = root().join("ui-preferences.json");
    let mut prefs = if pref_path.exists() {
        load(&pref_path)?
    } else {
        json!({"values":{}})
    };
    let raw = &prefs["values"]["arc.approved-source-labels"];
    let labels: Value = if let Some(s) = raw.as_str() {
        serde_json::from_str(s).map_err(|e| e.to_string())?
    } else {
        raw.clone()
    };
    if store["sources"].as_array().is_some_and(Vec::is_empty) {
        let index = root().join("ingresses/index.json");
        let ids = if index.exists() {
            load(&index)?
        } else {
            json!([])
        };
        let mut rows = vec![];
        for id in ids.as_array().ok_or("Invalid ingress index")? {
            let dir = root()
                .join("ingresses")
                .join(id.as_str().ok_or("Invalid ingress ID")?);
            let entry = load(&dir.join("config.json"))?;
            let start = rows.len();
            if entry["auth"] == "oauth" {
                let oauth = if dir.join("oauth.json").exists() {
                    load(&dir.join("oauth.json"))?
                } else {
                    json!({})
                };
                for grant in oauth["grants"].as_array().into_iter().flatten() {
                    let product = if let Some(p) = labels[string(grant, "id")].as_str() {
                        normalized(p).into()
                    } else if entry["transport"] != "relay" {
                        normalized(string(&entry, "controlSource")).into()
                    } else {
                        match_product(string(&oauth["clients"][string(grant, "client")], "name"))
                    };
                    let mut s = make(
                        &rows,
                        &entry,
                        json!({"type":"oauth-grant","grantId":grant["id"],"clientId":grant["client"]}),
                        &product,
                        grant["connected_at"].clone(),
                    );
                    s["label"] = json!(format!(
                        "{} {}",
                        string(&crate::control_sources::preset(&product), "displayName"),
                        grant["connected_at"]
                            .as_i64()
                            .and_then(|t| chrono::DateTime::from_timestamp(t, 0))
                            .map(|t| t.format("%Y-%m-%d").to_string())
                            .unwrap_or_else(|| "unknown date".into())
                    ));
                    rows.push(s);
                }
            } else {
                rows.push(make(
                    &rows,
                    &entry,
                    json!({"type":if entry["transport"] == "local" {"local"} else {"ingress"}}),
                    string(&entry, "controlSource"),
                    Value::Null,
                ));
            }
            if rows.len() == start + 1 {
                rows[start]["label"] = entry["name"].clone();
            }
        }
        rows.push(make(
            &rows,
            &json!({"id":"local-cli"}),
            json!({"type":"local"}),
            "local-cli",
            Value::Null,
        ));
        store["sources"] = json!(rows);
        save(&path(), &store)?;
    }
    let rows = store["sources"].as_array().ok_or("Invalid source store")?;
    // Explicit owned stores only: never rewrite upstream task/user content.
    for dir in [
        "notifications",
        "respond-tokens",
        "send-queue",
        "dispatches",
        "agents/requests",
        "agents/tasks",
    ] {
        migrate_files(&root().join(dir), rows)?;
    }
    // Codex operation receipts live directly under the state root.
    for e in std::fs::read_dir(root()).map_err(|e| e.to_string())? {
        let p = e.map_err(|e| e.to_string())?.path();
        if p.extension().is_some_and(|e| e == "json")
            && p.file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(|s| uuid::Uuid::parse_str(s).is_ok())
        {
            migrate_file(&p, rows)?;
        }
    }
    migrate_notification_keys()?;
    migrate_dispatch_origins()?;
    if let Some(values) = prefs["values"].as_object_mut() {
        values.remove("arc.approved-source-labels");
    }
    if pref_path.exists() {
        save(&pref_path, &prefs)?;
    }
    store["version"] = json!(1);
    save(&path(), &store)
}
fn unique<'a>(rows: &'a [Value], ingress: &str) -> Option<&'a Value> {
    let mut matches = rows.iter().filter(|s| s["ingressId"] == ingress);
    let one = matches.next()?;
    if matches.next().is_some() {
        None
    } else {
        Some(one)
    }
}
fn migrate_files(dir: &Path, rows: &[Value]) -> Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    for e in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let p = e.map_err(|e| e.to_string())?.path();
        if p.is_dir() {
            migrate_files(&p, rows)?;
        } else if p.extension().is_some_and(|e| e == "json") {
            migrate_file(&p, rows)?;
        }
    }
    Ok(())
}
fn migrate_file(path: &Path, rows: &[Value]) -> Result<()> {
    let mut value = load(path)?;
    fn visit(v: &mut Value, rows: &[Value]) {
        match v {
            Value::Object(o) => {
                let old = o.remove("ingress");
                let ingress = old
                    .as_ref()
                    .and_then(Value::as_str)
                    .or_else(|| o.get("ingressId").and_then(Value::as_str))
                    .unwrap_or("")
                    .to_owned();
                if !ingress.is_empty() && !o.contains_key("sourceId") {
                    o.insert("ingressId".into(), json!(ingress));
                    if let Some(s) = unique(rows, &ingress) {
                        o.insert("sourceId".into(), s["id"].clone());
                        if o.contains_key("controlSource") {
                            o.insert("controlSource".into(), s["product"].clone());
                            o.insert("sourceLabel".into(), s["label"].clone());
                        }
                    } else {
                        o.insert("sourceId".into(), json!(""));
                    }
                }
                for (k, v) in o.iter_mut() {
                    if ![
                        "arguments",
                        "args",
                        "prompt",
                        "input",
                        "output",
                        "result",
                        "request",
                        "finalResponse",
                        "externalUserInputs",
                        "metadata",
                    ]
                    .contains(&k.as_str())
                    {
                        visit(v, rows);
                    }
                }
            }
            Value::Array(a) => {
                for v in a {
                    visit(v, rows);
                }
            }
            _ => {}
        }
    }
    visit(&mut value, rows);
    // Inbox filenames were keyed by ingress; only unambiguous histories can move.
    if path.parent().is_some_and(|p| p.ends_with("inboxes")) {
        for s in rows {
            if unique(rows, string(s, "ingressId")).is_some()
                && path.file_stem().and_then(|s| s.to_str())
                    == Some(hash(string(s, "ingressId")).as_str())
            {
                let target = path.with_file_name(format!("{}.json", hash(string(s, "id"))));
                save(&target, &value)?;
                std::fs::remove_file(path).map_err(|e| e.to_string())?;
                return Ok(());
            }
        }
    }
    if path.parent().is_some_and(|p| p.ends_with("respond-tokens"))
        && !string(&value, "sourceId").is_empty()
    {
        let request = &value["request"];
        let digest = hash(
            json!([
                value["sourceId"],
                request["owner"],
                request["id"],
                if request["owner"] == "desktop" {
                    Value::Null
                } else {
                    request["backendSession"].clone()
                }
            ])
            .to_string(),
        );
        let target = path.with_file_name(format!("{digest}.json"));
        if target != path {
            save(&target, &value)?;
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    save(path, &value)
}

fn reconcile(rows: &mut Vec<Value>) -> Result<()> {
    for s in rows {
        if s["credential"]["type"] == "oauth-grant" && s["state"] != "revoked" {
            let path = root()
                .join("ingresses")
                .join(string(s, "ingressId"))
                .join("oauth.json");
            let oauth = if path.exists() {
                load(&path)?
            } else {
                json!({})
            };
            if !oauth["grants"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|g| g["id"] == s["credential"]["grantId"])
            {
                s["state"] = json!("revoked");
            } else {
                s["state"] = json!("disconnected");
            }
        }
    }
    Ok(())
}

pub fn task_origin(thread: &str, turn: Option<&str>) -> Value {
    let mut origin = crate::dispatch_policy::records(thread)
        .ok()
        .and_then(|rows| {
            rows.into_iter()
                .rev()
                .find(|r| turn.is_none_or(|turn| r["turnId"] == turn))
        })
        .map(|r| r["origin"].clone())
        .unwrap_or(Value::Null);
    decorate(&mut origin);
    origin
}

fn migrate_dispatch_origins() -> Result<()> {
    let dir = root().join("dispatches");
    if !dir.exists() {
        return Ok(());
    }
    for folder in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let folder = folder.map_err(|e| e.to_string())?.path();
        if !folder.is_dir() {
            continue;
        }
        for e in std::fs::read_dir(folder).map_err(|e| e.to_string())? {
            let p = e.map_err(|e| e.to_string())?.path();
            if p.extension().is_none_or(|e| e != "json") {
                continue;
            }
            let mut row = load(&p)?;
            if row["origin"].is_object() {
                continue;
            }
            let request = string(&row, "requestId");
            if uuid::Uuid::parse_str(request).is_err() {
                continue;
            }
            for base in ["", "agents/requests"] {
                let receipt = root().join(base).join(format!("{request}.json"));
                if receipt.exists() {
                    row["origin"] = load(&receipt)?["origin"].clone();
                    save(&p, &row)?;
                    break;
                }
            }
        }
    }
    Ok(())
}
fn migrate_notification_keys() -> Result<()> {
    let dir = root().join("notifications");
    let path = dir.join("subscriptions/state.json");
    if !path.exists() {
        return Ok(());
    }
    let mut state = load(&path)?;
    let mut tasks = vec![];
    if dir.join("tasks").exists() {
        for e in std::fs::read_dir(dir.join("tasks")).map_err(|e| e.to_string())? {
            let path = e.map_err(|e| e.to_string())?.path();
            if path.extension().is_some_and(|e| e == "json") {
                tasks.push((path.clone(), load(&path)?));
            }
        }
    }
    let mut ids = std::collections::BTreeMap::new();
    for sub in state["subscriptions"].as_array_mut().into_iter().flatten() {
        if string(sub, "sourceId").is_empty() {
            continue;
        }
        let old = string(sub, "id").to_owned();
        let new = if sub["channel"] == "claude-session" {
            tasks
                .iter()
                .find(|(_, b)| {
                    b["sourceId"] == sub["sourceId"]
                        && b["turnId"] == sub["turn"]
                        && (sub["args"]["threadId"] == b["threadId"]
                            || sub["args"]["taskId"] == b["threadId"])
                })
                .map(|(_, b)| {
                    format!(
                        "sub_{}",
                        hash(
                            json!([
                                "claude-session",
                                b["sourceId"],
                                b["agent"],
                                b["threadId"],
                                b["turnId"]
                            ])
                            .to_string()
                        )
                    )
                })
        } else {
            Some(format!("sub_{}",hash(json!([sub["sourceId"],sub["webhook"]["principal"],"notification",{"op":sub["op"],"args":sub["args"]},sub["webhook"]["url"]]).to_string())))
        };
        if let Some(new) = new {
            let legacy = if sub["channel"] == "claude-session" {
                tasks
                    .iter()
                    .find(|(_, b)| {
                        b["sourceId"] == sub["sourceId"]
                            && b["turnId"] == sub["turn"]
                            && (sub["args"]["threadId"] == b["threadId"]
                                || sub["args"]["taskId"] == b["threadId"])
                    })
                    .map(|(_, b)| {
                        format!(
                            "sub_{}",
                            hash(
                                json!([
                                    "claude-session",
                                    b["ingressId"],
                                    b["agent"],
                                    b["threadId"],
                                    b["turnId"]
                                ])
                                .to_string()
                            )
                        )
                    })
            } else {
                Some(format!("sub_{}",hash(json!([sub["ingressId"],sub["webhook"]["principal"],"notification",{"op":sub["op"],"args":sub["args"]},sub["webhook"]["url"]]).to_string())))
            };
            if let Some(legacy) = legacy {
                ids.insert(legacy, new.clone());
            }
            if sub["target"] == old {
                sub["target"] = json!(new);
            }
            sub["id"] = json!(new);
            ids.insert(old, new);
        }
    }
    // A historical global bucket is attributable only if every associated binding
    // and subscription has the same nonempty migrated source identity.
    let subscriptions = state["subscriptions"].clone();
    for target in state["targets"].as_array_mut().into_iter().flatten() {
        if let Some(new) = ids.get(string(target, "target")) {
            target["target"] = json!(new);
        }
        if !string(target, "sourceId").is_empty() {
            continue;
        }
        let scopes = subscriptions
            .as_array()
            .into_iter()
            .flatten()
            .filter(|s| s["target"] == target["target"] && s["channel"] == target["channel"])
            .map(|s| string(s, "sourceId").to_owned())
            .chain(
                tasks
                    .iter()
                    .filter(|(_, b)| {
                        b["target"] == target["target"] && b["channel"] == target["channel"]
                    })
                    .map(|(_, b)| string(b, "sourceId").to_owned()),
            )
            .collect::<std::collections::BTreeSet<_>>();
        target["sourceId"] = json!(if scopes.len() == 1 {
            scopes.iter().next().unwrap().as_str()
        } else {
            ""
        });
    }
    save(&path, &state)?;
    for (path, mut task) in tasks {
        for delivery in task["deliveries"].as_array_mut().into_iter().flatten() {
            if let Some(new) = ids.get(string(delivery, "subscription")) {
                delivery["subscription"] = json!(new);
            }
            if let Some(new) = ids.get(string(delivery, "target")) {
                delivery["target"] = json!(new);
            }
        }
        save(&path, &task)?;
    }
    Ok(())
}
