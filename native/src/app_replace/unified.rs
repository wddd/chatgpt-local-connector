//! Public update projection and worker commands. Only the worker writes its journal.
use super::*;

pub fn project(receipt: &Value) -> Value {
    let state = match string(receipt, "state") {
        "none" => "idle",
        "preparing" | "awaiting-receipt" | "waiting-for-turns" => "settling",
        "stopping" | "installing" => "swapping",
        value => value,
    };
    let item = |row: &Value| {
        let mut row = row.clone();
        row["kind"] = json!("turn");
        row["owner"] = row["executionOwner"].clone();
        row
    };
    let waiting = &receipt["waiting"];
    let mut blocking: Vec<Value> = waiting["blockingTurns"]
        .as_array()
        .into_iter()
        .flatten()
        .map(item)
        .collect();
    for (field, kind) in [
        ("activeWrites", "writes"),
        ("pendingInteractions", "interactions"),
    ] {
        if waiting[field].as_u64().is_some_and(|n| n > 0)
            && (kind != "interactions" || !blocking.iter().any(|v| v["question"].is_object()))
        {
            blocking.push(json!({"kind":kind,"count":waiting[field],"owner":"connector"}));
        }
    }
    if state == "settling"
        && (waiting["unknownActivity"] != false
            || !waiting["activeWrites"].is_number()
            || !waiting["pendingInteractions"].is_number())
    {
        blocking.push(json!({"kind":"unknown","owner":"unknown"}));
    }
    let mut value = json!({"state":state,"source":receipt["updateSource"],"instance":receipt["instance"],
        "work":{"blocking":blocking,"willResume":waiting["willResume"].as_array().into_iter().flatten().map(item).collect::<Vec<_>>(),"unaffected":waiting["unaffected"].as_array().cloned().unwrap_or_default()},
        "when":receipt["when"].as_str().unwrap_or(if receipt["immediate"] == true {"now"} else {"settled"}),
        "notes":receipt["notes"],"supported":cfg!(target_os="macos"),
        "next":{"op":"update_status","args":{},"hint":if active(receipt) {"End the replacing turn after its receipt. Held dispatches start after the terminal outcome."} else {"Read the outcome and continuation receipts before retrying."}}});
    if value["source"].is_null() && receipt["package"].is_object() {
        value["source"] = json!({"kind":"local","version":receipt["package"]["version"],"build":receipt["package"]["coreBuild"]});
    }
    for key in [
        "id",
        "createdAt",
        "updatedAt",
        "restartAt",
        "deferUntil",
        "error",
        "backup",
        "backupMoved",
        "backupReady",
        "statusPath",
        "logPath",
        "settleStartedAt",
        "settleDurationMs",
        "resumedCount",
        "droppedInteractions",
        "interruptedTurns",
    ] {
        value[key] = receipt[key].clone();
    }
    value["paths"] =
        json!({"source":receipt["source"],"target":receipt["target"],"staged":receipt["staged"]});
    value
}

pub fn history() -> Result<Value> {
    let path = directory().join("history.json");
    let mut rows = if path.exists() {
        load(&path)?
    } else {
        json!([])
    };
    for row in rows.as_array_mut().into_iter().flatten() {
        if let Ok(path) = job(string(row, "id")) {
            if let Ok(mut receipt) = load(&path.join("status.json")) {
                super::resume::status_details(&mut receipt)?;
                row["resumedCount"] = receipt["resumedCount"].clone();
            }
        }
    }
    Ok(rows)
}

pub(super) fn record_history(receipt: &Value) -> Result<()> {
    let mut rows = history()?.as_array().cloned().unwrap_or_default();
    rows.retain(|r| r["id"] != receipt["id"]);
    let mut row = project(receipt);
    row["outcome"] = receipt["state"].clone();
    row.as_object_mut().unwrap().remove("interruptedTurns");
    rows.insert(0, row);
    rows.truncate(20);
    // Backup retention and journal retention have separate safety boundaries.
    for row in &mut rows {
        row["backupReady"] = json!(row["backup"]
            .as_str()
            .is_some_and(|p| Path::new(p).is_dir()));
    }
    save(&directory().join("history.json"), &json!(rows))
}

pub async fn update_status(full: bool) -> Result<Value> {
    let receipt = status()?;
    let mut value = project(&receipt);
    value["canSchedule"] = json!(
        matches!(
            string(&receipt, "state"),
            "awaiting-receipt" | "waiting-for-turns" | "verifying" | "countdown"
        ) && job(string(&receipt, "id"))
            .is_ok_and(|path| !path.join("swap-committed.json").exists())
    );
    if !active(&receipt) {
        if let Ok(acquisition) =
            crate::transport::forward_request("updates", "GET", json!({})).await
        {
            let phase = string(&acquisition, "phase");
            if matches!(phase, "checking" | "downloading")
                || acquisition["update"]["available"] == true
                || acquisition["error"].is_string()
            {
                value = json!({"state":if phase == "installing" {"swapping"} else if phase == "idle" {if acquisition["update"]["available"] == true {"available"} else {"idle"}} else {phase},"source":{"kind":"release","version":acquisition["update"]["version"]},"notes":acquisition["update"]["notes"],"when":"settled","work":{"blocking":[],"willResume":[],"unaffected":[]},"supported":cfg!(target_os="macos"),"downloaded":acquisition["downloaded"],"total":acquisition["total"],"error":acquisition["error"],"revision":acquisition["revision"],"next":{"op":"update_status","args":{},"hint":"Release updates start from Desktop."}});
            }
        }
    }
    if value["state"] == "available" {
        let read = |route: &'static str| crate::transport::forward_request(route, "GET", json!({}));
        let (activity, status, tasks, snapshot) = tokio::join!(
            read("agents/activity"),
            read("status"),
            read("tasks"),
            read("app/replace/snapshot")
        );
        let mut work = waiting(
            &activity.unwrap_or(Value::Null),
            &status.unwrap_or(Value::Null),
            &tasks.unwrap_or(Value::Null),
        );
        if let Ok(snapshot) = snapshot {
            work = resumable_waiting(work, &snapshot);
        }
        value["work"] =
            project(&json!({"state":"waiting-for-turns","waiting":work}))["work"].clone();
    }
    if value["instance"].is_null() {
        let identity = crate::transport::forward_request("app", "GET", json!({}))
            .await
            .unwrap_or(Value::Null);
        let marker = load(&root().join("acceptance-instance.json")).unwrap_or(Value::Null);
        value["instance"] = json!(if let Some(id) = marker["instanceId"].as_str() {
            format!("isolated:{id}")
        } else {
            receipt["instance"]
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| {
                    if string(&identity, "bundleId").ends_with(".dev") {
                        "dev".into()
                    } else {
                        "production".into()
                    }
                })
        });
    }
    value["recent"] = history()?;
    if !full {
        value.as_object_mut().unwrap().remove("interruptedTurns");
    }
    Ok(value)
}

pub async fn update_request(mut args: Value) -> Result<Value> {
    let origin = crate::kernel::origin::current_origin();
    let local = origin["authType"] == "local";
    let prefs = crate::preferences::read();
    if !local && prefs["update-control-scheduling"] == "off" {
        return Err("UPDATE_SCHEDULING_DISABLED: change Settings > Updates locally".into());
    }
    match string(&args, "action") {
        "submit" => {
            if !local {
                return Err(
                    "LOCAL_ONLY: update_request submit requires authenticated local administration"
                        .into(),
                );
            }
            if args["source"]["kind"] != "local" {
                return Err("INVALID_ARGUMENT: submit accepts source.kind local only; release updates start from Desktop".into());
            }
            let mut body = json!({"path":args["source"]["path"]});
            for key in ["when", "continuation"] {
                if let Some(value) = args.get(key) {
                    body[key] = value.clone();
                }
            }
            let receipt = prepare(body).await?;
            let mut value = project(&receipt);
            value["replacementReceipt"] = json!(true);
            value["continuationRequestId"] = receipt["continuation"]["requestId"].clone();
            Ok(value)
        }
        "now" | "defer" | "cancel" => {
            let receipt = status()?;
            if !active(&receipt) {
                return Err("UPDATE_NOT_SETTLING: query update_status before scheduling".into());
            }
            let path = job(string(&receipt, "id"))?;
            let guard = command_lock(&path)?;
            if path.join("swap-committed.json").exists() {
                return Err("UPDATE_NOT_SETTLING: swap is committed; query update_status".into());
            }
            if args["id"].is_string() && args["id"] != receipt["id"] {
                return Err("UPDATE_CHANGED: query update_status before retrying".into());
            }
            if !matches!(
                string(&receipt, "state"),
                "awaiting-receipt" | "waiting-for-turns" | "verifying" | "countdown"
            ) {
                return Err(
                    "UPDATE_NOT_SETTLING: query update_status; swap cannot be cancelled".into(),
                );
            }
            if args["action"] == "defer" {
                let seconds = args["seconds"].as_i64().unwrap_or(3600);
                if !(1..=604800).contains(&seconds) {
                    return Err("INVALID_ARGUMENT: seconds must be 1..604800".into());
                }
                args["deferUntil"] =
                    json!((chrono::Utc::now() + chrono::Duration::seconds(seconds)).to_rfc3339());
            }
            save(&job(string(&receipt, "id"))?.join("command.json"), &args)?;
            drop(guard);
            Ok(
                json!({"id":receipt["id"],"accepted":true,"action":args["action"],"next":{"op":"update_status","args":{},"hint":"The worker applies this request before swap. Read back the outcome."}}),
            )
        }
        _ => Err(
            "INVALID_ARGUMENT: update_request action must be submit, now, defer or cancel".into(),
        ),
    }
}

#[cfg(target_os = "macos")]
pub(super) fn command(path: &Path, receipt: &mut Value) -> Result<()> {
    let _guard = command_lock(path)?;
    read_command(path, receipt)
}
#[cfg(target_os = "macos")]
fn read_command(path: &Path, receipt: &mut Value) -> Result<()> {
    let command = path.join("command.json");
    if !command.exists() {
        return Ok(());
    }
    let value = load(&command)?;
    std::fs::remove_file(&command).map_err(|e| e.to_string())?;
    match string(&value, "action") {
        "cancel" => return Err("UPDATE_CANCELLED: cancelled before swap".into()),
        "now" => {
            receipt["when"] = json!("now");
            receipt["immediate"] = json!(true);
            receipt["deferUntil"] = Value::Null;
        }
        "defer" => {
            receipt["when"] = json!("defer");
            receipt["immediate"] = json!(false);
            receipt["deferUntil"] = value["deferUntil"].clone();
        }
        _ => (),
    }
    receipt["updatedAt"] = json!(now());
    save(&path.join("status.json"), receipt)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn update_projection_preserves_work_and_recovery_boundaries() {
        // Property: projection never drops blockers, resumes, unaffected work, or recovery paths.
        let receipt = json!({"id":"job","state":"waiting-for-turns","when":"defer","backup":"/backup/App.app","backupMoved":false,"waiting":{"blockingTurns":[{"taskId":"unknown","executionOwner":"unknown"}],"willResume":[{"taskId":"owned","executionOwner":"connector"}],"unaffected":[{"taskId":"desktop","owner":"desktop"}],"activeWrites":1,"pendingInteractions":0,"unknownActivity":false}});
        let value = project(&receipt);
        assert_eq!(value["state"], "settling");
        assert_eq!(value["when"], "defer");
        assert_eq!(value["work"]["blocking"].as_array().unwrap().len(), 2);
        assert_eq!(value["work"]["willResume"][0]["taskId"], "owned");
        assert_eq!(value["work"]["unaffected"][0]["taskId"], "desktop");
        assert_eq!(value["backup"], receipt["backup"]);
    }
    #[test]
    fn pending_questions_remain_blocking_while_eligible_turns_resume() {
        // Regression: update status omitted pending questions and the distinct unaffected group.
        let waiting = json!({"blockingTurns":[{"agent":"codex","taskId":"question","turnId":"a","executionOwner":"connector"},{"agent":"codex","taskId":"resume","turnId":"b","executionOwner":"connector"}],"unaffected":[{"taskId":"desktop","owner":"desktop"}],"activeWrites":0,"pendingInteractions":1,"unknownActivity":false});
        let snapshot = json!({"turns":[{"threadId":"question","turnId":"a","state":"needs-attention","reason":"pending-interaction-cannot-reconnect","pendingInteractions":[{"id":7}]},{"threadId":"resume","turnId":"b","state":"recorded"}]});
        let result = resumable_waiting(waiting, &snapshot);
        assert_eq!(result["idle"], false);
        assert_eq!(result["blockingTurns"][0]["question"]["id"], 7);
        assert_eq!(result["willResume"][0]["taskId"], "resume");
        assert_eq!(result["unaffected"][0]["taskId"], "desktop");
    }
}

fn command_lock(path: &Path) -> Result<std::fs::File> {
    let file = std::fs::File::options()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path.join("command.lock"))
        .map_err(|e| e.to_string())?;
    file.lock().map_err(|e| e.to_string())?;
    Ok(file)
}
#[cfg(target_os = "macos")]
pub(super) fn seal(path: &Path, receipt: &mut Value) -> Result<bool> {
    let _guard = command_lock(path)?;
    read_command(path, receipt)?;
    if receipt["when"] == "defer" {
        return Ok(false);
    }
    save(&path.join("swap-committed.json"), &json!({"at":now()}))?;
    Ok(true)
}
