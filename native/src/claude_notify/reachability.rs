//! A successful send is not proof that the controller received it.
use super::*;

#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct Reachability {
    pub state: String,
    pub reason: String,
    pub attempts: u64,
    pub delivery_status: String,
    challenge_hash: String,
    source_id: String,
    expires_at: i64,
}
impl Default for Reachability {
    fn default() -> Self {
        Self {
            state: "unverified".into(),
            reason: "handshake-required".into(),
            attempts: 0,
            delivery_status: "not-attempted".into(),
            challenge_hash: String::new(),
            source_id: String::new(),
            expires_at: 0,
        }
    }
}
impl Reachability {
    pub fn expire(&mut self, now: i64) {
        if !self.challenge_hash.is_empty() && now >= self.expires_at {
            self.fail("handshake-timeout");
        }
    }
    pub fn fail(&mut self, reason: &str) {
        self.state = "failed".into();
        self.reason = reason.into();
        self.challenge_hash.clear();
        self.expires_at = 0;
    }
}

pub(super) async fn verify(source_id: &str, args: &Value) -> Result<Value> {
    verify_in(&directory(), source_id, args, &settings()?, &Cli {service:std::sync::Weak::new()}).await
}
pub(super) async fn verify_in(dir: &Path, source_id: &str, args: &Value, settings: &Value, executor: &impl Executor) -> Result<Value> {
    let target = session_id(string(args, "target"))?;
    let code = id();
    let digest = hash(&code);
    let now = chrono::Utc::now().timestamp();
    {
        let _guard = LOCK.lock().await;
        let bound = records(&dir)?.iter().any(|b| b.source_id == source_id && b.channel == Channel::ClaudeSession && b.target.as_deref() == Some(&target));
        let registered=State::load(&dir)?.targets.iter().any(|t|t.registered && t.source_id==source_id && t.channel==Channel::ClaudeSession && t.target==target);
        if !bound && !registered { return Err(json!({
            "code":"NOTIFICATION_TARGET_NOT_BOUND_TO_SOURCE",
            "message":"Call notify_control action:bind with this cloud-session target to register and verify it in one step. Optionally include an existing source-owned threadId to bind its wakeups without resending work. Future dispatches need the returned notify object.",
            "target":target,
            "next":{"via":"act","op":"notify_control","args":{"action":"bind","target":target}},
            "guide":{"tool":"guide","arguments":{"topic":"notify"}}
        }).to_string()); }
        if settings["notificationsEnabled"] == false {
            return Err("NOTIFICATIONS_DISABLED".into());
        }
        let mut state = State::load(&dir)?;
        let t = state.target(source_id, Channel::ClaudeSession, &target, now, &settings);
        if t.breaker {
            return Err("NOTIFICATION_BREAKER_ACTIVE".into());
        }
        if t.tokens == 0 {
            return Err("NOTIFICATION_TOKEN_WAIT".into());
        }
        t.reachability.expire(now);
        if !t.reachability.challenge_hash.is_empty() {
            return Err("HANDSHAKE_PENDING: receive the code or retry after expiry".into());
        }
        t.tokens -= 1;
        t.reachability = Reachability {
            reason: "handshake-pending".into(),
            attempts: t.reachability.attempts + 1,
            delivery_status: "sending".into(),
            challenge_hash: digest.clone(),
            source_id: source_id.into(),
            expires_at: now + 300,
            ..Default::default()
        };
        state.save(&dir)?;
    }
    // The code exists only in the delivered message; receipts and status cannot confirm it.
    let body = format!("[ARC] Notification reachability check. Only after receiving this message in this conversation, call act with {}. This confirms delivery, not task acceptance.", json!({"op":"notification_ack","args":{"target":target,"code":code}}));
    let sent = deliver_target(
        executor,
        &target,
        &body,
    )
    .await;
    let _guard = LOCK.lock().await;
    let mut state = State::load(&dir)?;
    let t = state.target(
        source_id,
        Channel::ClaudeSession,
        &target,
        chrono::Utc::now().timestamp(),
        settings,
    );
    if t.reachability.challenge_hash == digest || t.reachability.state == "verified" {
        t.reachability.delivery_status=sent.into();
        if sent == "failed" {t.reachability.fail("handshake-delivery-failed");}
    }
    let mut result = json!({"target":target,"reachability":t.reachability.state,"reason":t.reachability.reason,"expiresAt":t.reachability.expires_at,"verificationAttempts":t.reachability.attempts,"deliveryStatus":sent,"next":{"via":"query","op":"notify_status","args":{"target":target}},"hint":"Confirm only with the code received in the target conversation via notification_ack. A successful send alone does not verify reachability."});
    if sent == "failed" {result["next"]=json!({"via":"act","op":"notify_control","args":{"action":"verify","target":target},"hint":"Correct the reported delivery failure before retrying verification. Binding is retained."});result["ok"]=json!(false);result["error"]=json!({"code":"NOTIFICATION_DELIVERY_FAILED","message":"The verification message could not be delivered. Inspect notification logs, correct the destination or transport, and retry notify_control action:verify. Binding remains registered."});}
    state.save(&dir)?;
    Ok(result)
}

pub(super) fn acknowledge(dir: &Path, source_id: &str, args: &Value) -> Result<Value> {
    let target = session_id(string(args, "target"))?;
    let mut state = State::load(dir)?;
    let t = state
        .targets
        .iter_mut()
        .find(|t| {
            t.source_id == source_id && t.channel == Channel::ClaudeSession && t.target == target
        })
        .ok_or("HANDSHAKE_NOT_FOUND")?;
    t.reachability.expire(chrono::Utc::now().timestamp());
    let r = &mut t.reachability;
    if r.source_id != source_id
        || r.challenge_hash.is_empty()
        || r.challenge_hash != hash(string(args, "code"))
    {
        state.save(dir)?;
        return Err(
            "HANDSHAKE_INVALID_OR_EXPIRED: use notify_control action=verify for this target".into(),
        );
    }
    r.state = "verified".into();
    r.reason = "handshake-confirmed".into();
    r.challenge_hash.clear();
    r.expires_at = 0;
    state.save(dir)?;
    Ok(json!({"target":target,"reachability":"verified","reason":"handshake-confirmed"}))
}
