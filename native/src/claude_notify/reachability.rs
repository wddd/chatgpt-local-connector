//! A successful send is not proof that the controller received it.
use super::*;

#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct Reachability {
    pub state: String,
    pub reason: String,
    challenge_hash: String,
    ingress: String,
    expires_at: i64,
}
impl Default for Reachability {
    fn default() -> Self {
        Self {
            state: "unverified".into(),
            reason: "handshake-required".into(),
            challenge_hash: String::new(),
            ingress: String::new(),
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

pub(super) async fn verify(ingress: &str, args: &Value) -> Result<Value> {
    let target = session_id(string(args, "target"))?;
    let dir = directory();
    let code = id();
    let digest = hash(&code);
    let now = chrono::Utc::now().timestamp();
    let b = {
        let _guard = LOCK.lock().await;
        let b = records(&dir)?
            .into_iter()
            .find(|b| {
                b.ingress == ingress
                    && b.channel == Channel::ClaudeSession
                    && b.target.as_deref() == Some(&target)
            })
            .ok_or("NOTIFICATION_TARGET_NOT_BOUND_TO_INGRESS")?;
        let settings = settings()?;
        if settings["notificationsEnabled"] == false {
            return Err("NOTIFICATIONS_DISABLED".into());
        }
        let mut state = State::load(&dir)?;
        let t = state.target(Channel::ClaudeSession, &target, now, &settings);
        if t.breaker {
            return Err("NOTIFICATION_BREAKER_ACTIVE".into());
        }
        if t.tokens == 0 {
            return Err("NOTIFICATION_TOKEN_WAIT".into());
        }
        if !t.reachability.challenge_hash.is_empty() {
            return Err("HANDSHAKE_PENDING: receive the code or retry after expiry".into());
        }
        t.tokens -= 1;
        t.reachability = Reachability {
            reason: "handshake-pending".into(),
            challenge_hash: digest.clone(),
            ingress: ingress.into(),
            expires_at: now + 300,
            ..Default::default()
        };
        state.save(&dir)?;
        b
    };
    // The code exists only in the delivered message; receipts and status cannot confirm it.
    let body = format!("[ARC] Notification reachability check. Only after receiving this message in this conversation, call act with {}. This confirms delivery, not task acceptance.", json!({"op":"notification_ack","args":{"target":target,"code":code}}));
    let sent = deliver_message(
        &Cli {
            service: std::sync::Weak::new(),
        },
        &b,
        &body,
    )
    .await;
    let _guard = LOCK.lock().await;
    let mut state = State::load(&dir)?;
    let t = state.target(
        Channel::ClaudeSession,
        &target,
        chrono::Utc::now().timestamp(),
        &settings()?,
    );
    if sent == "failed" && t.reachability.challenge_hash == digest {
        t.reachability.fail("handshake-delivery-failed");
    }
    let result = json!({"target":target,"reachability":t.reachability.state,"reason":t.reachability.reason,"expiresAt":now+300,"hint":"Confirm only with the code received in the target conversation via notification_ack. A successful send alone does not verify reachability."});
    state.save(&dir)?;
    Ok(result)
}

pub(super) fn acknowledge(dir: &Path, ingress: &str, args: &Value) -> Result<Value> {
    let target = session_id(string(args, "target"))?;
    let mut state = State::load(dir)?;
    let t = state
        .targets
        .iter_mut()
        .find(|t| t.channel == Channel::ClaudeSession && t.target == target)
        .ok_or("HANDSHAKE_NOT_FOUND")?;
    t.reachability.expire(chrono::Utc::now().timestamp());
    let r = &mut t.reachability;
    if r.ingress != ingress
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
