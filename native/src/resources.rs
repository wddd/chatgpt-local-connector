//! Process-local startup policy and passive, on-demand resource observations.
use crate::{json, now, Result, Value};
use std::sync::{Mutex, OnceLock};

pub const NOFILE_TARGET: u64 = 8192;
pub const FD_WARNING_RATIO: f64 = 0.9;
static STARTUP: OnceLock<Value> = OnceLock::new();
static ADJUST: Mutex<()> = Mutex::new(());

pub fn initialize() -> &'static Value {
    STARTUP.get_or_init(|| ensure_nofile("core-startup"))
}

pub fn before_spawn() -> Value {
    initialize();
    ensure_nofile("app-server-spawn")["actual"].clone()
}

fn unknown_limits(reason: &str) -> Value {
    json!({"state":"unknown","soft":null,"hard":null,"source":"unavailable","observedAt":null,"error":reason})
}

#[cfg(unix)]
fn read_limits() -> Result<libc::rlimit> {
    let mut limits = libc::rlimit {
        rlim_cur: 0,
        rlim_max: 0,
    };
    // SAFETY: getrlimit writes one initialized rlimit owned by this call.
    if unsafe { libc::getrlimit(libc::RLIMIT_NOFILE, &mut limits) } != 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(limits)
}

#[cfg(unix)]
fn measured(limits: &libc::rlimit, source: &str) -> Value {
    let value = |v| {
        if v == libc::RLIM_INFINITY {
            json!("unlimited")
        } else {
            json!(v)
        }
    };
    json!({"state":"available","soft":value(limits.rlim_cur),"hard":value(limits.rlim_max),"source":source,"observedAt":now(),"error":null})
}

pub fn current_limits() -> Value {
    #[cfg(unix)]
    return match read_limits() {
        Ok(limits) => measured(&limits, "self-measured"),
        Err(error) => unknown_limits(&error),
    };
    #[cfg(not(unix))]
    json!({"state":"not_applicable","soft":null,"hard":null,"source":"unavailable","observedAt":null,"error":null})
}

#[cfg(target_os = "macos")]
fn platform_ceiling() -> Result<u64> {
    // Darwin's OPEN_MAX (sys/syslimits.h) is not exported by libc. Never pass
    // RLIM_INFINITY to setrlimit; it can fail even with an unlimited hard limit.
    const OPEN_MAX: u64 = 10240;
    let mut maximum: libc::c_int = 0;
    let mut size = std::mem::size_of_val(&maximum);
    // SAFETY: sysctlbyname reads into a correctly sized integer; no global write.
    let result = unsafe {
        libc::sysctlbyname(
            c"kern.maxfilesperproc".as_ptr(),
            (&mut maximum as *mut libc::c_int).cast(),
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    if result != 0 {
        return Err(format!(
            "kern.maxfilesperproc: {}",
            std::io::Error::last_os_error()
        ));
    }
    if size != std::mem::size_of_val(&maximum) || maximum <= 0 {
        return Err("kern.maxfilesperproc returned an invalid limit".into());
    }
    Ok(OPEN_MAX.min(maximum as u64))
}

fn ensure_nofile(stage: &str) -> Value {
    let _guard = ADJUST.lock().unwrap();
    let original = current_limits();
    let report = json!({"targetSoft":NOFILE_TARGET,"original":original,"actual":original,"attemptedSoft":null,"platformCeiling":null,"state":"not_applicable","reasons":[],"observedAt":now()});
    #[cfg(unix)]
    let report = {
        let mut report = report;
        let mut reasons = Vec::<String>::new();
        let ceiling: Option<u64>;
        #[cfg(target_os = "macos")]
        {
            ceiling = match platform_ceiling() {
                Ok(value) => Some(value),
                Err(error) => {
                    reasons.push(error);
                    None
                }
            };
        }
        #[cfg(not(target_os = "macos"))]
        {
            ceiling = None;
        }
        report["platformCeiling"] = json!(ceiling);
        match read_limits() {
            Ok(mut limits) => {
                report["original"] = measured(&limits, "self-measured");
                if limits.rlim_max < NOFILE_TARGET as libc::rlim_t {
                    reasons.push(format!(
                        "hard limit {} is below target {NOFILE_TARGET}",
                        limits.rlim_max
                    ));
                }
                // Preserve the hard limit, and never lower an existing soft limit.
                let target = (NOFILE_TARGET as libc::rlim_t)
                    .min(limits.rlim_max)
                    .min(ceiling.unwrap_or(NOFILE_TARGET) as libc::rlim_t);
                if limits.rlim_cur < target {
                    limits.rlim_cur = target;
                    report["attemptedSoft"] = json!(target);
                    // SAFETY: setrlimit reads this valid rlimit; only this process changes.
                    if unsafe { libc::setrlimit(libc::RLIMIT_NOFILE, &limits) } != 0 {
                        reasons.push(format!("setrlimit: {}", std::io::Error::last_os_error()));
                    }
                }
            }
            Err(error) => reasons.push(format!("getrlimit: {error}")),
        }
        report["actual"] = current_limits();
        let reached = meets_target(&report["actual"]);
        if !reached {
            reasons.push(format!(
                "RLIMIT_NOFILE soft target {NOFILE_TARGET} not verified"
            ));
        }
        if ceiling.is_some_and(|v| v < NOFILE_TARGET) {
            reasons.push("platform ceiling is below the target".into());
        }
        report["state"] = json!(if reached && ceiling.is_none_or(|v| v >= NOFILE_TARGET) {
            "ok"
        } else {
            "degraded"
        });
        report["reasons"] = json!(reasons);
        report
    };
    crate::logs::record(
        if report["state"] == "degraded" {
            "WARN"
        } else {
            "INFO"
        },
        &format!("Resource limits ({stage}): {report}"),
        None,
    );
    report
}

fn meets_target(limits: &Value) -> bool {
    limits["soft"] == "unlimited" || limits["soft"].as_u64().is_some_and(|v| v >= NOFILE_TARGET)
}

pub fn core_status() -> Value {
    let startup = STARTUP.get().cloned().unwrap_or(Value::Null);
    let nofile = current_limits();
    let state = if nofile["state"] == "not_applicable" {
        "not_applicable"
    } else if startup["state"] == "degraded" {
        "degraded"
    } else if nofile["state"] == "unknown" {
        "unknown"
    } else if meets_target(&nofile) {
        "ok"
    } else {
        "degraded"
    };
    json!({"state":state,"nofile":nofile,"startup":startup})
}

#[cfg(target_os = "linux")]
fn child_limits(pid: u32, inherited: &Value) -> Value {
    let mut limits = libc::rlimit {
        rlim_cur: 0,
        rlim_max: 0,
    };
    // SAFETY: null new_limit makes prlimit read-only; old_limit is valid storage.
    if unsafe {
        libc::prlimit(
            pid as libc::pid_t,
            libc::RLIMIT_NOFILE,
            std::ptr::null(),
            &mut limits,
        )
    } == 0
    {
        measured(&limits, "child-measured")
    } else {
        let mut value = inherited.clone();
        value["measurementError"] = json!(std::io::Error::last_os_error().to_string());
        value
    }
}

#[cfg(not(target_os = "linux"))]
fn child_limits(_pid: u32, inherited: &Value) -> Value {
    inherited.clone()
}

#[cfg(target_os = "linux")]
fn fd_count(pid: u32) -> Result<u64> {
    std::fs::read_dir(format!("/proc/{pid}/fd"))
        .map_err(|e| e.to_string())?
        .try_fold(0, |count, entry| {
            entry.map(|_| count + 1).map_err(|e| e.to_string())
        })
}

#[cfg(target_os = "macos")]
fn fd_count(pid: u32) -> Result<u64> {
    // The size-only call describes allocated slots, not open descriptors.
    // Count the filled proc_fdinfo records, retrying a full buffer boundedly.
    let mut size = unsafe {
        libc::proc_pidinfo(
            pid as i32,
            libc::PROC_PIDLISTFDS,
            0,
            std::ptr::null_mut(),
            0,
        )
    };
    if size <= 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    for _ in 0..3 {
        size = size.saturating_add(32 * libc::PROC_PIDLISTFD_SIZE);
        if size > 16 * 1024 * 1024 {
            return Err("fd list exceeds sampling budget".into());
        }
        let mut buffer = vec![0u8; size as usize];
        // SAFETY: buffer owns size writable bytes; the kernel copies fd records.
        let used = unsafe {
            libc::proc_pidinfo(
                pid as i32,
                libc::PROC_PIDLISTFDS,
                0,
                buffer.as_mut_ptr().cast(),
                size,
            )
        };
        if used <= 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        if used < size {
            return Ok((used / libc::PROC_PIDLISTFD_SIZE) as u64);
        }
        size = size.saturating_mul(2);
    }
    Err("fd list changed during sampling".into())
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn fd_count(_pid: u32) -> Result<u64> {
    Err("fd sampling is not applicable on this platform".into())
}

pub fn child_running(pid: Option<u32>) -> Result<bool> {
    let Some(pid) = pid else { return Ok(false) };
    #[cfg(unix)]
    {
        // SAFETY: zero is a valid initial siginfo_t; waitid writes into it.
        // WNOWAIT observes exit without reaping the child or releasing its PID.
        // Rpc keeps its Child locked until both observations and sampling finish.
        let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
        if unsafe {
            libc::waitid(
                libc::P_PID,
                pid as libc::id_t,
                &mut info,
                libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
            )
        } != 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(unsafe { info.si_pid() } == 0)
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        Ok(true)
    } // No fd sampling on Windows.
}

pub fn child_status(pid: Option<u32>, inherited: Option<&Value>, unavailable: &str) -> Value {
    let mut nofile = inherited
        .cloned()
        .unwrap_or_else(|| unknown_limits(unavailable));
    if nofile["state"] == "available" {
        nofile["source"] = json!("inherited-at-spawn");
    }
    let mut fd = json!({"state":"unknown","count":null,"sampledAt":null,"attemptedAt":null,"error":unavailable});
    if let Some(pid) = pid {
        nofile = child_limits(pid, &nofile);
        fd["attemptedAt"] = json!(now());
        match fd_count(pid) {
            Ok(count) => {
                fd["state"] = json!("available");
                fd["count"] = json!(count);
                fd["sampledAt"] = json!(now());
                fd["error"] = Value::Null;
            }
            Err(error) => fd["error"] = json!(error),
        }
    }
    if cfg!(windows) {
        nofile = current_limits();
        fd["state"] = json!("not_applicable");
        fd["error"] = Value::Null;
    }
    let ratio = fd["count"]
        .as_u64()
        .zip(nofile["soft"].as_u64())
        .filter(|(_, soft)| *soft > 0)
        .map(|(count, soft)| count as f64 / soft as f64);
    let state = if cfg!(windows) {
        "not_applicable"
    } else if ratio.is_some_and(|r| r >= FD_WARNING_RATIO) {
        "pressure"
    } else if nofile["state"] == "available" && !meets_target(&nofile) {
        "degraded"
    } else if fd["state"] == "available" && nofile["state"] == "available" {
        "ok"
    } else {
        "unknown"
    };
    json!({"state":state,"nofile":nofile,"fd":fd,"usageRatio":ratio,"warningRatio":FD_WARNING_RATIO})
}
