use super::*;
use std::{fs, fs::File, os::unix::fs::PermissionsExt, time::Duration};

fn io<T>(value: std::io::Result<T>) -> Result<T> {
    value.map_err(|e| e.to_string())
}
fn lock() -> Result<File> {
    private_dir(&directory())?;
    let file = io(File::options()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(directory().join("lock")))?;
    file.try_lock()
        .map_err(|_| "REPLACE_BUSY: another replacement owns the installation".to_owned())?;
    Ok(file)
}
fn bundle(executable: &str) -> Result<PathBuf> {
    Path::new(executable)
        .ancestors()
        .find(|p| p.extension().is_some_and(|e| e == "app"))
        .ok_or("REPLACE_INVALID_PACKAGE: Desktop is not inside an app bundle")?
        .canonicalize()
        .map_err(|e| e.to_string())
}
async fn phase(path: &Path, receipt: &mut Value, state: &str, error: Option<&str>) -> Result<()> {
    receipt["state"] = json!(state);
    receipt["updatedAt"] = json!(now());
    receipt["phaseStartedAt"] = receipt["updatedAt"].clone();
    if let Some(error) = error {
        receipt["error"] = json!(error);
    }
    if let Some(next) = terminal_next(state) {
        receipt["next"] = json!(next);
    }
    save(&path.join("status.json"), receipt)?;
    eprintln!("{} {state} {}", now(), error.unwrap_or(""));
    // NSUserNotificationCenter needs a main-thread run loop. A bounded child keeps
    // notification delivery independent of both Desktop and the worker runtime.
    receipt["notificationError"] = match tokio::time::timeout(
        Duration::from_secs(5),
        output(
            io(std::env::current_exe())?,
            &["replace-notify", string(receipt, "id")],
        ),
    )
    .await
    {
        Ok(Ok(_)) => Value::Null,
        Ok(Err(error)) => json!(error),
        Err(_) => json!("NOTIFICATION_UNAVAILABLE: Read app.replace.status for progress"),
    };
    save(&path.join("status.json"), receipt)
}

pub fn notify(id: &str) -> Result<()> {
    let receipt = load(&job(id)?.join("status.json"))?;
    let state = string(&receipt, "state");
    let key = match state {
        "preparing" => "replacementPreparing",
        "awaiting-receipt" => "replacementHandoff",
        "waiting-for-turns" => "replacementWaiting",
        "countdown" => "replacementCountdownNotice",
        "verifying" => "replacementValidating",
        "stopping" => "replacementStopping",
        "installing" => "replacementInstalling",
        "starting" => "replacementStarting",
        "succeeded" => "replacementSucceeded",
        "rolling-back" => "replacementRestoring",
        "rolled-back" => "replacementPreviousRestored",
        "cancelled" => "replacementCancelled",
        _ => "replacementFailed",
    };
    let body = crate::i18n::text(&crate::i18n::locale(), key);
    notify_rust::set_application(string(&receipt["package"], "identifier"))
        .map_err(|e| e.to_string())?;
    notify_rust::Notification::new()
        .summary("Agent Remote Control")
        .body(body)
        .show()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// A signed bundle and both binary fingerprints are enough after a same-directory rename.
async fn verify_identity(app: &Path, expected: &Value) -> Result<()> {
    crate::package::signature(app, string(expected, "identifier")).await?;
    if crate::runtime::build_id(&app.join("Contents/Resources/bin/arc"))? != expected["coreBuild"]
        || crate::runtime::build_id(&app.join("Contents/MacOS/agent-remote-control-desktop"))?
            != expected["desktopBuild"]
    {
        return Err("REPLACE_INVALID_PACKAGE: bundle fingerprints changed".into());
    }
    Ok(())
}

async fn inspect(source: &Path) -> Result<Value> {
    let identifier = crate::package::plist(source, "CFBundleIdentifier").await?;
    // Authenticate before executing anything from the candidate package.
    crate::package::signature(source, &identifier).await?;
    let value = output(
        source.join("Contents/Resources/bin/arc"),
        &["package-check", &source.to_string_lossy()],
    )
    .await?;
    serde_json::from_str(&value).map_err(|e| format!("REPLACE_INVALID_PACKAGE: {e}"))
}

pub async fn prepare(body: Value) -> Result<Value> {
    let continuation = continuation_request(&body, &id())?;
    let source = Path::new(string(&body, "path"));
    if !source.is_absolute() || source.extension().is_none_or(|e| e != "app") {
        return Err("INVALID_ARGUMENT: path must be an absolute .app directory".into());
    }
    let source = io(source.canonicalize())?;
    let app = crate::transport::forward_request("app", "GET", json!({})).await?;
    let target = bundle(string(&app, "executable"))?;
    if let Some(args) = &continuation {
        crate::cli_acceptance::control(
            "codex_read",
            json!({"threadId":args["threadId"],"statusOnly":true}),
        )
        .await?;
    }
    if source == target || source.starts_with(&target) || target.starts_with(&source) {
        return Err("INVALID_ARGUMENT: source and installed bundle must be separate".into());
    }
    let expected = inspect(&source).await?;
    let identifier = crate::package::plist(&target, "CFBundleIdentifier").await?;
    if expected["identifier"] != identifier {
        return Err("REPLACE_INVALID_PACKAGE: bundle identifier differs from installed app".into());
    }
    crate::package::signature(&target, &identifier).await?;
    let core = crate::transport::forward_request("health", "GET", json!({})).await?;
    let old_core = crate::runtime::build_id(&target.join("Contents/Resources/bin/arc"))?;
    let old_desktop =
        crate::runtime::build_id(&target.join("Contents/MacOS/agent-remote-control-desktop"))?;
    if core["build"] != old_core || app["build"] != old_desktop {
        return Err(
            "REPLACE_OWNER_CHANGED: running processes do not match the installed bundle".into(),
        );
    }
    if body["check"] == true {
        return Ok(
            json!({"validated":true,"source":source,"target":target,"package":expected,"launched":false}),
        );
    }
    let guard = lock()?;
    let previous = status()?;
    if !matches!(
        string(&previous, "state"),
        "none" | "succeeded" | "rolled-back" | "cancelled" | "failed"
    ) {
        return Err("REPLACE_BUSY: read app.replace.status and its log before retrying".into());
    }
    // A failed rollback requires explicit recovery, not another destructive attempt.
    if previous["state"] == "failed" && previous["backupMoved"] == true {
        return Err(
            "REPLACE_RECOVERY_REQUIRED: restore the recorded backup before another replacement"
                .into(),
        );
    }
    let id = id();
    let path = job(&id)?;
    private_dir(&path)?;
    let label = format!("com.whzxc.arc.replace.{id}");
    let service = format!("gui/{}/{label}", unsafe { libc::geteuid() });
    let backup_directory = directory().join("backups").join(&id);
    private_dir(&backup_directory)?;
    let backup = backup_directory.join("Agent Remote Control.app");
    let staged = target.with_file_name(format!(
        "{}.replacement-{id}.app",
        target.file_name().unwrap().to_string_lossy()
    ));
    let mut receipt = json!({"replacementReceipt":true,"id":id,"state":"preparing","immediate":body["immediate"]==true,"backupDirectory":backup_directory,"source":source,"target":target,"backup":backup,"staged":staged,"backupMoved":false,"package":expected,"oldPackage":{"coreBuild":old_core,"desktopBuild":old_desktop,"identifier":identifier},"desktopPid":app["pid"],"corePid":core["pid"],"coreInstance":core["instance"],"service":service,"createdAt":now(),"statusPath":path.join("status.json"),"logPath":path.join("worker.log"),"next":"End this turn after the receipt. Do not continue work depending on ARC. Query app replace --status after reconnecting."});
    if let Some(args) = continuation {
        receipt["continuationBinding"] =
            crate::claude_notify::replacement_binding(string(&args, "threadId"))?;
        receipt["continuation"] = args;
        receipt["continuationState"] = json!("waiting-for-recovery");
    }
    save(&path.join("status.json"), &receipt)?;
    save(&directory().join("latest.json"), &json!({"id":id}))?;
    let prepared: Result<()> = async {
        phase(&path, &mut receipt, "preparing", None).await?;
        // Stage before acknowledging: source cleanup by the caller cannot race installation.
        output("/usr/bin/ditto", &[&source.to_string_lossy(), &staged.to_string_lossy()]).await?;
        let staged_package = inspect(&staged).await?;
        if staged_package != expected { return Err("REPLACE_INVALID_PACKAGE: staging changed package identity".into()); }
        // Back up while the installed app still runs. Do not remove any installed bytes until this copy is verified.
        output("/usr/bin/ditto", &[&target.to_string_lossy(), &backup.to_string_lossy()]).await?;
        verify_identity(&backup, &receipt["oldPackage"]).await?;
        receipt["backupReady"] = json!(true);
        let helper = path.join("arc-replace");
        io(fs::copy(staged.join("Contents/Resources/bin/arc"), &helper))?;
        io(fs::set_permissions(&helper, fs::Permissions::from_mode(0o700)))?;
        let plist = path.join(format!("{label}.plist"));
        // plutil converts JSON safely; paths never pass through shell interpolation.
        save(&plist, &json!({"Label":label,"ProgramArguments":[helper,"replace-worker",id],"EnvironmentVariables":{"ARC_STATE_DIR":root()},"RunAtLoad":true,"KeepAlive":false,"ProcessType":"Background","StandardOutPath":path.join("worker.log"),"StandardErrorPath":path.join("worker.log")}))?;
        output("/usr/bin/plutil", &["-convert", "xml1", &plist.to_string_lossy()]).await?;
        phase(&path, &mut receipt, "awaiting-receipt", None).await?;
        save(&directory().join("latest.json"), &json!({"id":id}))?;
        output("/bin/launchctl", &["bootstrap", &format!("gui/{}", unsafe { libc::geteuid() }), &plist.to_string_lossy()]).await?;
        Ok(())
    }.await;
    drop(guard);
    if let Err(error) = prepared {
        phase(&path, &mut receipt, "failed", Some(&error)).await?;
        let _ = fs::remove_dir_all(&staged);
        let _ = fs::remove_dir_all(&backup_directory);
        return Err(error);
    }
    // Confirm the launchd-owned worker started before returning an acceptance receipt.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    while !path.join("ready.json").exists() {
        if tokio::time::Instant::now() >= deadline {
            let _ = output("/bin/launchctl", &["bootout", &service]).await;
            phase(
                &path,
                &mut receipt,
                "failed",
                Some("REPLACE_HELPER_TIMEOUT"),
            )
            .await?;
            let _ = fs::remove_dir_all(&staged);
            let _ = fs::remove_dir_all(&backup_directory);
            return Err("REPLACE_HELPER_TIMEOUT: installation was not started".into());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    Ok(receipt)
}

async fn request(route: &str, method: &str) -> Result<Value> {
    tokio::time::timeout(
        Duration::from_secs(15),
        crate::transport::forward_request(route, method, json!({})),
    )
    .await
    .map_err(|_| format!("REPLACE_TIMEOUT: {route}"))?
}
async fn wait_idle(path: &Path, receipt: &mut Value) -> Result<()> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(300);
    let mut quiet = 0;
    loop {
        if tokio::time::Instant::now() >= deadline {
            return Err("REPLACE_TASKS_BUSY: no shutdown performed; inspect cli app replace --status for blocking work and retry when it is idle".into());
        }
        let owner = async {
            Ok::<_, String>((
                request("health", "GET").await?,
                request("app", "GET").await?,
                request("agents/activity", "GET").await?,
                request("status", "GET").await?,
                request("tasks", "GET")
                    .await
                    .unwrap_or_else(|error| json!({"error":error})),
                request("updates", "GET").await?,
            ))
        }
        .await;
        let (health, app, activity, status, tasks, update) = match owner {
            Ok(owner) => owner,
            Err(error) => {
                quiet = 0;
                receipt["waiting"] = json!({"idle":false,"reason":"owner-unavailable","error":error,"observedAt":now()});
                receipt["updatedAt"] = json!(now());
                save(&path.join("status.json"), receipt)?;
                // Closing a debug Desktop window used to cancel the handoff.
                // Restore only the validated original package; never adopt unknown code.
                let target = PathBuf::from(string(receipt, "target"));
                let desktop = target.join("Contents/MacOS/agent-remote-control-desktop");
                let processes = output("/bin/ps", &["-axo", "comm="]).await?;
                if !alive(pid(receipt, "desktopPid")?)
                    && !processes
                        .lines()
                        .any(|command| command.trim() == desktop.to_string_lossy())
                {
                    if crate::runtime::build_id(&target.join("Contents/Resources/bin/arc"))?
                        != receipt["oldPackage"]["coreBuild"]
                        || crate::runtime::build_id(&desktop)?
                            != receipt["oldPackage"]["desktopBuild"]
                    {
                        return Err(
                            "REPLACE_OWNER_CHANGED: installed bytes changed during handoff".into(),
                        );
                    }
                    crate::package::signature(
                        &target,
                        string(&receipt["oldPackage"], "identifier"),
                    )
                    .await?;
                    launch(&target, &receipt["oldPackage"]).await?;
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
        };
        if health["instance"] != receipt["coreInstance"] || app["pid"] != receipt["desktopPid"] {
            if !same_package_owner(receipt, &health, &app)
                || bundle(string(&app, "executable"))? != PathBuf::from(string(receipt, "target"))
            {
                return Err("REPLACE_OWNER_CHANGED: the running package changed; retry against the current owner".into());
            }
            receipt["coreInstance"] = health["instance"].clone();
            receipt["corePid"] = health["pid"].clone();
            receipt["desktopPid"] = app["pid"].clone();
            receipt["ownerReconnectedAt"] = json!(now());
            quiet = 0;
        }
        receipt["waiting"] = waiting(&activity, &status, &tasks);
        receipt["waiting"]["updatePhase"] = update["phase"].clone();
        if update["phase"] != "idle" {
            receipt["waiting"]["idle"] = json!(false);
        }
        receipt["waiting"]["observedAt"] = json!(now());
        receipt["updatedAt"] = json!(now());
        save(&path.join("status.json"), receipt)?;
        if receipt["waiting"]["idle"] == true {
            quiet += 1;
        } else {
            quiet = 0;
        }
        if quiet >= 3 && path.join("ack.json").exists() {
            return Ok(());
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(
                "REPLACE_TASKS_BUSY: no shutdown performed; inspect cli app replace --status for blocking work and retry when it is idle".into(),
            );
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}
fn alive(pid: u32) -> bool {
    unsafe {
        libc::kill(pid as i32, 0) == 0
            || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
    }
}
async fn wait_exit(pids: &[u32]) -> Result<File> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(45);
    loop {
        if pids.iter().all(|p| !alive(*p)) {
            // The Core lock outlives listener shutdown and excludes a racing new owner.
            let lock = io(File::options()
                .read(true)
                .write(true)
                .open(root().join("core.lock")))?;
            if lock.try_lock().is_ok() {
                return Ok(lock);
            }
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(
                "REPLACE_EXIT_TIMEOUT: Desktop or Core still running; bundle was not moved".into(),
            );
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}
fn pid(value: &Value, key: &str) -> Result<u32> {
    value[key]
        .as_u64()
        .filter(|p| *p > 1 && *p <= i32::MAX as u64)
        .map(|p| p as u32)
        .ok_or_else(|| format!("REPLACE_INVALID_OWNER: {key}"))
}
async fn launch(target: &Path, expected: &Value) -> Result<()> {
    output(
        "/usr/bin/open",
        &[
            "-n",
            "-a",
            &target.to_string_lossy(),
            "--args",
            "--state-dir",
            &root().to_string_lossy(),
        ],
    )
    .await?;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(60);
    loop {
        if let (Ok(core), Ok(app)) = (request("health", "GET").await, request("app", "GET").await) {
            if core["build"] == expected["coreBuild"]
                && app["build"] == expected["desktopBuild"]
                && bundle(string(&app, "executable"))? == target
            {
                return Ok(());
            }
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(
                "REPLACE_HEALTH_TIMEOUT: expected Desktop and Core builds did not become healthy"
                    .into(),
            );
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

async fn rollback(target: &Path, backup: &Path, receipt: &mut Value) -> Result<()> {
    // Ask the new owner to quit if it started. Never overwrite a running bundle.
    let mut pids = Vec::new();
    if let Ok(app) = request("app", "GET").await {
        if bundle(string(&app, "executable"))? != target {
            return Err("REPLACE_ROLLBACK_BLOCKED: another Desktop owns the state".into());
        }
        pids.push(pid(&app, "pid")?);
        let _ = request("app/quit", "POST").await;
    }
    if let Ok(core) = request("health", "GET").await {
        pids.push(pid(&core, "pid")?);
    }
    // Detect even partially started owners that never exposed a management endpoint.
    pids.extend(bundle_pids(target).await?);
    // A broken new build may not have a working HTTP endpoint. SIGTERM is the
    // Core's graceful shutdown path; never escalate to SIGKILL or move live code.
    for process in &pids {
        if bundle_pids(target).await?.contains(process) {
            unsafe {
                libc::kill(*process as i32, libc::SIGTERM);
            }
        }
    }
    let core_guard = wait_exit(&pids).await?;
    let failed = backup
        .parent()
        .ok_or("REPLACE_BACKUP_MISSING")?
        .join("failed.app");
    if target.exists() {
        output(
            "/usr/bin/ditto",
            &[&target.to_string_lossy(), &failed.to_string_lossy()],
        )
        .await?;
        io(fs::remove_dir_all(target))?;
    }
    output(
        "/usr/bin/ditto",
        &[&backup.to_string_lossy(), &target.to_string_lossy()],
    )
    .await?;
    receipt["backupMoved"] = json!(false);
    crate::package::signature(target, string(&receipt["oldPackage"], "identifier")).await?;
    drop(core_guard);
    launch(target, &receipt["oldPackage"]).await
}
async fn bundle_pids(target: &Path) -> Result<Vec<u32>> {
    let list = output("/bin/ps", &["-axo", "pid=,comm="]).await?;
    let desktop = target.join("Contents/MacOS/agent-remote-control-desktop");
    let core = target.join("Contents/Resources/bin/arc");
    let mut pids = Vec::new();
    for line in list.lines() {
        let line = line.trim();
        let Some((id, command)) = line.split_once(char::is_whitespace) else {
            continue;
        };
        if command.trim() == desktop.to_string_lossy() {
            if let Ok(id) = id.parse() {
                pids.push(id);
            }
        }
        // Core ownership is established by health/native.json, never by executable name:
        // MCP clients keep arc stdio processes from this bundle alive across restart.
        if command.trim() == core.to_string_lossy() {
            let args = output("/bin/ps", &["-p", id, "-o", "args="])
                .await
                .unwrap_or_default();
            if args.trim_end().ends_with(" serve") || args.trim_end().ends_with(" daemon") {
                if let Ok(id) = id.parse() {
                    pids.push(id);
                }
            }
        }
    }
    Ok(pids)
}

pub async fn worker(id: &str) -> Result<()> {
    // launchd jobs have their own process group but can share POSIX session 1.
    // Spawn once from this launchd-owned supervisor: the child is not a group
    // leader yet, so setsid succeeds before exec. Neither process belongs to ARC.
    if unsafe { libc::getppid() } != 1 {
        return Err("REPLACE_HELPER_NOT_DETACHED".into());
    }
    let mut child = command(io(std::env::current_exe())?);
    child
        .args(["replace-run", id])
        .stdin(std::process::Stdio::null());
    unsafe {
        child.pre_exec(|| {
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let status = io(child.status().await)?;
    if status.success() {
        Ok(())
    } else {
        Err("REPLACE_HELPER_FAILED: read app replace --status and its log".into())
    }
}

pub async fn run_worker(id: &str) -> Result<()> {
    let path = job(id)?;
    // launchd can start us before bootstrap returns to the submitting process.
    // Wait for that process to release its preparation lock before taking ownership.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    let _guard = loop {
        match lock() {
            Ok(guard) => break guard,
            Err(error) if tokio::time::Instant::now() >= deadline => return Err(error),
            Err(_) => tokio::time::sleep(Duration::from_millis(50)).await,
        }
    };
    let mut receipt = load(&path.join("status.json"))?;
    let service = string(&receipt, "service").to_owned();
    let target = PathBuf::from(string(&receipt, "target"));
    let staged = PathBuf::from(string(&receipt, "staged"));
    let backup = PathBuf::from(string(&receipt, "backup"));
    // The launchd-owned supervisor created a fresh POSIX session before exec.
    if unsafe { libc::getsid(0) } != std::process::id() as i32 {
        return Err("REPLACE_HELPER_NOT_DETACHED".into());
    }
    save(
        &path.join("ready.json"),
        &json!({"pid":std::process::id(),"parentPid":unsafe { libc::getppid() },"processGroup":unsafe { libc::getpgrp() },"sessionId":unsafe { libc::getsid(0) }}),
    )?;
    let result: Result<()> = async {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(60);
        while !path.join("ack.json").exists() {
            if tokio::time::Instant::now() >= deadline {
                return Err(
                    "REPLACE_RECEIPT_TIMEOUT: no response acknowledgment; no shutdown performed"
                        .into(),
                );
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        if receipt["immediate"] != true {
            receipt["waitDeadline"] =
                json!((chrono::Utc::now() + chrono::Duration::seconds(300)).to_rfc3339());
            phase(&path, &mut receipt, "waiting-for-turns", None).await?;
            wait_idle(&path, &mut receipt).await?;
        } else {
            // Explicit user-directed replacement bypasses activity and quiet-period probes.
            // Still establish the process owners to avoid stopping a different installation.
            let health = request("health", "GET").await?;
            let app = request("app", "GET").await?;
            if !same_package_owner(&receipt, &health, &app)
                || bundle(string(&app, "executable"))? != target
            {
                return Err(
                    "REPLACE_OWNER_CHANGED: retry against the current installed app".into(),
                );
            }
            receipt["corePid"] = health["pid"].clone();
            receipt["desktopPid"] = app["pid"].clone();
        }
        phase(&path, &mut receipt, "verifying", None).await?;
        crate::package::check(&staged).await?;
        verify_identity(&backup, &receipt["oldPackage"]).await?;
        if crate::runtime::build_id(&target.join("Contents/Resources/bin/arc"))?
            != receipt["oldPackage"]["coreBuild"]
            || crate::runtime::build_id(
                &target.join("Contents/MacOS/agent-remote-control-desktop"),
            )? != receipt["oldPackage"]["desktopBuild"]
        {
            return Err("REPLACE_OWNER_CHANGED: installed bytes changed during handoff".into());
        }
        if receipt["immediate"] != true {
            receipt["restartAt"] =
                json!((chrono::Utc::now() + chrono::Duration::seconds(10)).to_rfc3339());
            let restart = tokio::time::Instant::now() + Duration::from_secs(10);
            phase(&path, &mut receipt, "countdown", None).await?;
            tokio::time::sleep_until(restart).await;
        }
        phase(&path, &mut receipt, "stopping", None).await?;
        receipt["shutdownRequested"] = json!(true);
        request("app/quit", "POST").await?;
        let core_guard =
            wait_exit(&[pid(&receipt, "desktopPid")?, pid(&receipt, "corePid")?]).await?;
        phase(&path, &mut receipt, "installing", None).await?;
        // Journal before touching the original: even a partial removal must restore the verified backup.
        receipt["backupMoved"] = json!(true);
        save(&path.join("status.json"), &receipt)?;
        io(fs::remove_dir_all(&target))?;
        io(fs::rename(&staged, &target))?;
        verify_identity(&target, &receipt["package"]).await?;
        phase(&path, &mut receipt, "starting", None).await?;
        drop(core_guard);
        launch(&target, &receipt["package"]).await?;
        phase(&path, &mut receipt, "succeeded", None).await
    }
    .await;
    if let Err(error) = result {
        if receipt["backupMoved"] == true {
            // A journal write failure must not prevent restoring the backup.
            let _ = phase(&path, &mut receipt, "rolling-back", Some(&error)).await;
            match rollback(&target, &backup, &mut receipt).await {
                Ok(()) => {
                    receipt["backupMoved"] = json!(false);
                    phase(&path, &mut receipt, "rolled-back", Some(&error)).await?;
                }
                Err(rollback) => {
                    phase(&path, &mut receipt, "failed", Some(&format!("{error}; rollback: {rollback}. Preserve the backup and recover manually."))).await?;
                }
            }
        } else {
            // A failure after requesting quit must also restore availability of the old build.
            if receipt["shutdownRequested"] == true {
                if let Err(relaunch) = launch(&target, &receipt["oldPackage"]).await {
                    phase(
                        &path,
                        &mut receipt,
                        "failed",
                        Some(&format!("{error}; old app relaunch: {relaunch}")),
                    )
                    .await?;
                    return Ok(());
                }
            }
            phase(&path, &mut receipt, "cancelled", Some(&error)).await?;
        }
    }
    // Cleanup never rolls back a healthy app or removes a backup still needed for recovery.
    receipt["backupCleanup"] = match super::backups::cleanup(&receipt).await {
        Ok(result) => result,
        Err(error) => json!({"errors":[{"error":error}]}),
    };
    save(&path.join("status.json"), &receipt)?;
    if receipt["state"] == "succeeded" {
        // Continuation failures do not roll back a healthy replacement.
        if let Err(error) = deliver_continuation(&path, &mut receipt).await {
            crate::logs::record(
                "ERROR",
                &format!("Replacement continuation persistence failed: {error}"),
                None,
            );
        }
    }
    // Terminal recovery keeps no duplicate app copies; success keeps only its latest backup.
    let _ = fs::remove_dir_all(&staged);
    let _ = fs::remove_file(path.join("arc-replace"));
    // bootout may terminate us. The durable terminal result is written first.
    let _ = output("/bin/launchctl", &["bootout", &service]).await;
    Ok(())
}
