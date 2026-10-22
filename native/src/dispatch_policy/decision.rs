//! Presentation only. Dispatch validation and native configuration stay with their owners.
use crate::*;
use std::collections::BTreeMap;

fn criteria(row: &mut Value, text: &str, key: &str, args: &Value) {
    if text.is_empty() {
        return;
    }
    let digest = hash(text);
    row["criteriaHash"] = json!(digest);
    if args["knownCriteriaHash"][key] == digest {
        row.as_object_mut().unwrap().remove("criteria");
        row["criteriaUnchanged"] = json!(true);
    } else {
        row["criteria"] = json!(text);
    }
}

// Providers mark stale cached quotas themselves. Catalog snapshots have no TTL contract.
// A persisted catalog is explicitly historical, so retain its observation timestamp.
fn clean(value: &mut Value) {
    match value {
        Value::Object(map) => {
            let stale = map.get("state").is_some_and(|v| v == "stale")
                || map.get("stale") == Some(&json!(true))
                || map.get("source").is_some_and(|v| {
                    v == "persistent-snapshot" || v == "persisted-session-snapshot"
                });
            map.retain(|key, value| {
                clean(value);
                !(key == "observedAt" && !stale || empty(value))
            });
        }
        Value::Array(values) => {
            values.iter_mut().for_each(clean);
            values.retain(|v| !empty(v));
        }
        _ => {}
    }
}
fn empty(value: &Value) -> bool {
    value.is_null()
        || value
            .as_str()
            .is_some_and(|s| s.is_empty() || s == "unknown")
        || value.as_array().is_some_and(Vec::is_empty)
        || value.as_object().is_some_and(serde_json::Map::is_empty)
}
fn model_list(row: &Value) -> Vec<String> {
    let models = row.get("models").unwrap_or(&row["capabilities"]["models"]);
    models
        .as_array()
        .into_iter()
        .flatten()
        .map(|m| {
            let mut parts = vec![];
            let efforts: Vec<_> = m["efforts"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .collect();
            let order = [
                "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra",
            ];
            if !efforts.is_empty() {
                let contiguous = order.windows(efforts.len()).any(|v| v == efforts);
                parts.push(if contiguous && efforts.len() > 2 {
                    format!("{}-{}", efforts[0], efforts[efforts.len() - 1])
                } else {
                    efforts.join("/")
                });
            }
            for tier in m["serviceTiers"].as_array().into_iter().flatten() {
                parts.push(format!(
                    "{}={}",
                    string(tier, "name").to_lowercase(),
                    string(tier, "id")
                ));
            }
            for option in m["options"].as_array().into_iter().flatten() {
                let values = option["values"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|v| v["value"].as_str())
                    .collect::<Vec<_>>()
                    .join("/");
                if !values.is_empty() {
                    parts.push(format!("{}={values}", string(option, "id")));
                }
            }
            let id = string(m, "model");
            if parts.is_empty() {
                id.into()
            } else {
                format!("{id}: {}", parts.join(", "))
            }
        })
        .collect()
}
fn history(row: &Value) -> Value {
    if row["history"]["unavailable"].is_string() {
        return row["history"].clone();
    }
    let groups = row["history"]["groups"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|g| {
            let mut label = ["model", "effort", "serviceTier"]
                .iter()
                .filter_map(|k| g[k].as_str())
                .filter(|v| !v.is_empty() && *v != "unknown")
                .collect::<Vec<_>>()
                .join("/");
            for (k, v) in g["options"].as_object().into_iter().flatten() {
                label.push_str(&format!(" {k}={}", v.as_str().unwrap_or("")));
            }
            let mut s = format!("{label}: {} dispatches", g["dispatches"]);
            if let Some(ms) = g["medianObservedDurationMs"].as_f64() {
                s.push_str(&format!(", {:.1}m median", ms / 60000.0));
            }
            s.push_str(&format!(
                ", {}/{}/{} pass/rework/unreviewed",
                g["pass"], g["rework"], g["unreviewed"]
            ));
            for k in ["failed", "interrupted"] {
                if g[k].as_u64().unwrap_or(0) > 0 {
                    s.push_str(&format!(", {} {k}", g[k]));
                }
            }
            s
        })
        .collect::<Vec<_>>();
    if groups.is_empty() {
        return Value::Null;
    }
    let mut value = json!({"groups":groups});
    if let Some(n) = row["history"].get("omittedGroups") {
        value["omittedGroups"] = n.clone();
    }
    value
}
fn quota_summary(windows: Vec<(String, f64)>) -> String {
    windows
        .into_iter()
        .map(|(name, percent)| format!("{name} {percent}%"))
        .collect::<Vec<_>>()
        .join(", ")
}
fn quotas(row: &Value) -> Vec<(String, Value)> {
    let q = &row["quota"];
    let mut result = vec![];
    for pool in q["pools"].as_array().into_iter().flatten() {
        let windows = ["primary", "secondary"]
            .iter()
            .filter_map(|k| {
                let w = &pool[k];
                let used = w["usedPercent"].as_f64()?;
                let name = match w["windowDurationMins"].as_u64() {
                    Some(10080) => "weekly".into(),
                    Some(300) => "5h".into(),
                    Some(n) => format!("{n}m"),
                    None => (*k).into(),
                };
                Some((name, used))
            })
            .collect();
        let mut v = json!({"summary":quota_summary(windows)});
        for k in ["rateLimitReachedType", "spendControlReached"] {
            if !pool[k].is_null() && pool[k] != false {
                v[k] = pool[k].clone();
            }
        }
        if q["ordinaryUsageAllowed"] == false {
            v["ordinaryUsageAllowed"] = json!(false);
        }
        result.push((format!("codex/{}", string(pool, "id")), v));
    }
    for p in q["providers"].as_array().into_iter().flatten() {
        let mut pools = BTreeMap::<String, Vec<(String, f64)>>::new();
        for w in p["windows"].as_array().into_iter().flatten() {
            if let Some(used) = w["usedPercent"].as_f64() {
                pools
                    .entry(string(w, "poolId").into())
                    .or_default()
                    .push((string(w, "label").replace("weekly_all", "weekly"), used));
            }
        }
        // Preserve failures even when there are no windows.
        if pools.is_empty() {
            pools.insert(String::new(), vec![]);
        }
        for (pool, windows) in pools {
            let mut v = json!({"summary":quota_summary(windows)});
            if p["state"] != "ready" {
                v["state"] = p["state"].clone();
                v["observedAt"] = p["observedAt"].clone();
            }
            for k in ["error", "accountBlocked", "blockedPoolIds"] {
                if p[k] != false {
                    v[k] = p[k].clone();
                }
            }
            result.push((format!("{}/{}", string(p, "providerId"), pool), v));
        }
    }
    result
}

pub(super) fn present(mut facts: Value, args: &Value) -> Value {
    let global = string(&facts, "criteria").to_owned();
    criteria(&mut facts, &global, "global", args);
    if args["view"] == "full" {
        for row in facts["agents"].as_array_mut().into_iter().flatten() {
            let agent = string(row, "agent").to_owned();
            let text = string(&row["policy"], "criteria").to_owned();
            criteria(&mut row["policy"], &text, &agent, args);
        }
        clean(&mut facts);
        return facts;
    }
    let mut seen = BTreeMap::<String, String>::new();
    let mut rows = vec![];
    for row in facts["agents"].as_array().into_iter().flatten() {
        let agent = string(row, "agent");
        let available = &row["availability"];
        let status = if available["installed"] != true {
            "not installed"
        } else if available["enabled"] != true {
            "disabled"
        } else if available["available"] == true {
            "available"
        } else {
            "unavailable"
        };
        let policy = &row["policy"];
        let text = string(policy, "criteria");
        let history = history(row);
        let no_policy = text.is_empty() && history.is_null();
        let mut out = json!({"agent":agent,"availability":if no_policy { format!("{status}, no policy") } else {status.into()}});
        if available["discoveryError"].is_string() {
            out["error"] = available["discoveryError"].clone();
        }
        criteria(&mut out, text, agent, args);
        let mut defaults = json!({});
        for k in ["model", "effort", "options", "serviceTier", "serviceTiers"] {
            defaults[k] = policy[k].clone();
        }
        out["defaults"] = defaults;
        // Restrictions still matter when there is no prose guidance or history.
        for k in [
            "allowModels",
            "denyModels",
            "allowEfforts",
            "denyEfforts",
            "allowOptions",
            "denyOptions",
        ] {
            out[k] = policy[k].clone();
        }
        if !no_policy {
            out["history"] = history;
            out["models"] = json!(model_list(row));
            let options: Vec<_> = row["capabilities"]["options"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|o| {
                    let values = o["values"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(|v| v["value"].as_str())
                        .filter(|v| !v.is_empty())
                        .collect::<Vec<_>>()
                        .join("/");
                    format!("{}: {values}", string(o, "id"))
                })
                .collect();
            if !options.is_empty() {
                out["options"] = json!(options);
                out["optionsForModel"] = row["capabilities"]["optionsForModel"].clone();
                out["currentModel"] = row["capabilities"]["currentModel"].clone();
            }
            for k in ["source", "observedAt", "omittedModels", "unavailable"] {
                out[k] = row["capabilities"][k].clone();
            }
            if row["models"].is_object() {
                out["models"] = row["models"].clone();
            } else if row["capabilities"]["models"].is_object() {
                out["models"] = row["capabilities"]["models"].clone();
            }
        }
        let mut quota = vec![];
        for (id, value) in quotas(row) {
            if let Some(owner) = seen.get(&id) {
                quota.push(json!({"ref":format!("{owner}/{id}")}));
            } else {
                seen.insert(id.clone(), agent.into());
                let mut v = value;
                v["id"] = json!(id);
                quota.push(v);
            }
        }
        out["quota"] = if quota.is_empty() {
            row["quota"]["unavailable"].clone()
        } else {
            json!(quota)
        };
        rows.push(out);
    }
    facts["agents"] = json!(rows);
    clean(&mut facts);
    facts
}
