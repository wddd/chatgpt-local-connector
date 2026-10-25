//! Application composition: tool routing over shared execution owners.
use crate::{agents::AgentHost, control::Control, *};
pub struct Execution {
    pub(crate) control: Arc<Control>,
    agents: Arc<AgentHost>,
    subscriptions: Arc<crate::subscriptions::SubscriptionService>,
}
impl Execution {
    pub fn new(
        control: Arc<Control>,
        agents: Arc<AgentHost>,
        subscriptions: Arc<crate::subscriptions::SubscriptionService>,
    ) -> Arc<Self> {
        Arc::new(Self {
            control,
            agents,
            subscriptions,
        })
    }
    pub fn approval_mode(&self) -> Result<bool> {
        self.control.approval_mode()
    }
    pub fn auto_open_codex(&self) -> Result<bool> {
        self.control.auto_open_codex()
    }
    pub async fn available(&self, name: &str) -> bool {
        if name == "agents" || name.starts_with("agent_") {
            return self.agents.ui_inventory(false).await["agents"]
                .as_array()
                .is_some_and(|rows| {
                    rows.iter().any(|r| {
                        r["agent"] != "codex" && r["available"] == true && r["enabled"] == true
                    })
                });
        }
        true
    }
    pub async fn call(&self, name: &str, args: Value, policy: Value) -> Result<Value> {
        if matches!(
            name,
            "context_resolve"
                | "context_search"
                | "context_read"
                | "context_check"
                | "context_amend"
        ) {
            let mut args = args;
            // The frozen act envelope's request ID is ARC metadata, not a provider argument.
            if name == "context_amend" {
                args.as_object_mut().map(|args| args.remove("requestId"));
            }
            let spec = catalog()["ops"]
                .as_array()
                .unwrap()
                .iter()
                .find(|op| op["name"] == name)
                .unwrap();
            crate::egress::validate_op(spec, &args)?;
            let timeout = std::time::Duration::from_secs(match name {
                "context_amend" | "context_check" => 120,
                _ => 10,
            });
            return crate::context_provider::call(
                name.strip_prefix("context_").unwrap(),
                args,
                timeout,
            )
            .await;
        }
        if name == "dispatch_policy" {
            let catalog = crate::catalog();
            let spec = catalog["ops"]
                .as_array()
                .unwrap()
                .iter()
                .find(|t| t["name"] == name)
                .unwrap();
            crate::egress::validate_op(spec, &args)?;
            return crate::dispatch_policy::query(
                &self.control,
                &self.agents,
                &self.subscriptions,
                &args,
            )
            .await;
        }
        if matches!(
            name,
            "task_timeline"
                | "task_reviews"
                | "task_review_undo"
                | "task_panel"
                | "task_panel_control"
                | "task_open"
                | "task_resource"
        ) {
            let spec = catalog()["ops"]
                .as_array()
                .unwrap()
                .iter()
                .find(|op| op["name"] == name)
                .unwrap();
            crate::egress::validate_op(spec, &args)?;
            return match name {
                "task_timeline" => {
                    let mut result = self
                        .agents
                        .conversation_timeline(&self.control, &args)
                        .await?;
                    if args["expectedHash"].is_string()
                        && args["expectedHash"] == result["snapshotHash"]
                    {
                        result["entries"] = json!([]);
                        result["unchanged"] = json!(true);
                    }
                    Ok(result)
                }
                "task_reviews" => {
                    Ok(json!({"reviews":crate::dispatch_policy::reviews(string(&args,"id"))?}))
                }
                "task_review_undo" => crate::dispatch_policy::undo_local_review(
                    string(&args, "id"),
                    string(&args, "turnId"),
                    string(&args, "reviewRequestId"),
                ),
                "task_panel" | "task_panel_control" => {
                    let full = args["view"] == "full";
                    let mut panel_args = args.clone();
                    panel_args.as_object_mut().unwrap().remove("view");
                    let result = crate::transport::forward_request(
                        "app/snapshot",
                        "POST",
                        json!({"modelOnly":true,"taskPanel":panel_args}),
                    )
                    .await?;
                    Ok(if full {
                        result["model"]["taskDetail"].clone()
                    } else {
                        crate::egress::panel_state(&result["model"]["taskDetail"])
                    })
                }
                "task_open" => {
                    crate::transport::forward_request(
                        "tasks/open",
                        "POST",
                        json!({"agent":args["agent"],"taskId":args["id"]}),
                    )
                    .await
                }
                _ => crate::transport::forward_request("agents/resources", "POST", args).await,
            };
        }
        if name == "receipt" {
            let spec = crate::catalog()["ops"]
                .as_array()
                .unwrap()
                .iter()
                .find(|t| t["name"] == name)
                .unwrap();
            crate::egress::validate_op(spec, &args)?;
            if let Some(receipt) = self.agents.receipt(args.clone()).await? {
                return Ok(receipt);
            }
            return self.control.tool(name, args).await;
        }
        if name == "agent_context" {
            crate::context::read(&self.agents, &self.control, args, policy).await
        } else if name == "agents" || name.starts_with("agent_") {
            self.agents.tool(&self.control, name, args).await
        } else {
            self.control.tool(name, args).await
        }
    }
}
