//! Presentation only. Dispatch validation and native configuration stay with their owners.
use crate::*;
use std::collections::BTreeMap;

fn criteria(row: &mut Value, text: &str, key: &str, args: &Value) {
    let digest = hash(text);
    row["criteriaHash"] = json!(digest);
    if args["knownCriteriaHash"].as_str() == Some(digest.as_str())
        || args["knownCriteriaHash"][key] == digest
    {
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
    let mut grouped = BTreeMap::<String, Vec<String>>::new();
    for m in models.as_array().into_iter().flatten() {
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
        grouped
            .entry(parts.join(", "))
            .or_default()
            .push(string(m, "model").into());
    }
    grouped
        .into_iter()
        .map(|(settings, ids)| {
            if settings.is_empty() {
                ids.join(",")
            } else {
                format!("{}: {settings}", ids.join(","))
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
            let mut label = ["model", "effort"]
                .iter()
                .filter_map(|k| g[k].as_str())
                .filter(|v| !v.is_empty() && *v != "unknown")
                .collect::<Vec<_>>()
                .join("/");
            match g["serviceTier"].as_str() {
                Some("default" | "") | None => {}
                Some("unknown") => label.push_str("/?"),
                Some(tier) => label.push_str(&format!("/{tier}")),
            }
            for (k, v) in g["options"].as_object().into_iter().flatten() {
                label.push_str(&format!(" {k}={}", v.as_str().unwrap_or("")));
            }
            let mut s = format!("{label}: n{}", g["dispatches"]);
            if let Some(ms) = g["medianObservedDurationMs"].as_f64() {
                s.push_str(&format!(" med{:.1}m", ms / 60000.0));
            }
            s.push_str(&format!(
                " pass{} rework{} unrev{}",
                g["pass"], g["rework"], g["unreviewed"]
            ));
            if let Some(n) = g["external"]["reviews"].as_u64() {
                s.push_str(&format!(
                    " ext{n} pass{} rework{}",
                    g["external"]["pass"], g["external"]["rework"]
                ));
            }
            for (k, short) in [("failed", "fail"), ("interrupted", "int")] {
                if g[k].as_u64().unwrap_or(0) > 0 {
                    s.push_str(&format!(" {short}{}", g[k]));
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

fn accounts(row: &Value) -> Value {
    json!(row["accounts"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|a| {
            let mut out = json!({"id":a["id"],"alias":a["alias"],"health":a["health"]["state"]});
            if a["default"] == true {
                out["default"] = json!(true);
            }
            let q = &a["quota"];
            let windows = q["windows"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|w| {
                    let used = w["usedPercent"].as_f64()?;
                    let label = w["label"].as_str().unwrap_or_else(|| string(w, "id"));
                    let reset = w["resetsAt"]
                        .as_str()
                        .map(|at| format!(" reset={at}"))
                        .unwrap_or_default();
                    Some(format!("{label} {used}%{reset}"))
                })
                .collect::<Vec<_>>();
            out["quota"] = json!({"state":q["state"],"summary":windows.join(", ")});
            for key in ["observedAt", "error", "accountBlocked", "blockedPoolIds"] {
                if q[key] != false {
                    out["quota"][key] = q[key].clone();
                }
            }
            out
        })
        .collect::<Vec<_>>())
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
        let mut out = json!({"agent":agent,"accounts":accounts(row),"availability":if no_policy { format!("{status}, no policy") } else {status.into()}});
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
    if rows.iter().any(|r| !r["history"].is_null()) {
        facts["legend"] = json!("30d; no self-test; n=dispatches med=successful observed minutes unrev=unreviewed int=interrupted fail=failed ext=external reviews with own pass/rework; /tier omitted=default ?=unknown; other=mixed n<10; quota=% used");
    }
    facts["agents"] = json!(rows);
    clean(&mut facts);
    facts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_selection_facts_survive_projection_and_full_view_retains_detail() {
        // Property: compact projection retains account identity, readiness, quota units, resets and stale/blocking evidence without inventing usage.
        let accounts = json!([
            {"id":"account-one","alias":"Primary","default":true,"health":{"state":"attention"},
             "agentProfiles":[{"profileId":"profile-one","state":"signed-in"}],
             "quota":{"state":"stale","observedAt":"2026-01-01T00:00:00Z","accountBlocked":true,
                      "windows":[{"id":"weekly","label":"7d","usedPercent":100,"resetsAt":"2026-01-02T00:00:00Z"}]}},
            {"id":"account-two","alias":"Secondary","health":{"state":"ready"},"quota":{"state":"unavailable"}}
        ]);
        let facts = json!({"agents":[{"agent":"example","accounts":accounts,
            "availability":{"installed":true,"enabled":true,"available":true},
            "policy":{"criteria":"Use current evidence.","denyModels":["denied"]}}]});
        let first = present(facts.clone(), &json!({}));
        let row = &first["agents"][0];
        let primary = &row["accounts"][0];
        assert_eq!(primary["id"], accounts[0]["id"]);
        assert_eq!(primary["alias"], accounts[0]["alias"]);
        assert_eq!(primary["default"], true);
        assert_eq!(primary["health"], accounts[0]["health"]["state"]);
        assert_eq!(primary["quota"]["state"], "stale");
        assert_eq!(
            primary["quota"]["observedAt"],
            accounts[0]["quota"]["observedAt"]
        );
        assert_eq!(primary["quota"]["accountBlocked"], true);
        let summary = primary["quota"]["summary"].as_str().unwrap();
        assert!(
            summary.contains("7d")
                && summary.contains("100%")
                && summary.contains("2026-01-02T00:00:00Z")
        );
        assert_eq!(row["accounts"][1]["quota"]["state"], "unavailable");
        assert!(row["accounts"][1]["quota"].get("summary").is_none());
        assert_eq!(
            row["denyModels"],
            facts["agents"][0]["policy"]["denyModels"]
        );
        let cached = present(
            facts.clone(),
            &json!({"knownCriteriaHash":row["criteriaHash"]}),
        );
        assert_eq!(cached["agents"][0]["accounts"], row["accounts"]);
        let full = present(facts, &json!({"view":"full"}));
        assert_eq!(full["agents"][0]["accounts"], accounts);
    }
}
