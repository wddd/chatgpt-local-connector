//! Install only an owned symlink; never replace a user's launcher.
use crate::*;

/// Discover a directly executable CLI without relying on a shell PATH or shim.
pub(crate) fn executable() -> Result<PathBuf> {
    crate::runtime::binary()
        .or_else(|_| std::env::current_exe().map_err(|e| e.to_string()))?
        .canonicalize()
        .map_err(|e| e.to_string())
}

pub(crate) async fn install() -> Result<Value> {
    #[cfg(not(target_os = "macos"))]
    {
        Err("NOT_SUPPORTED: install-shim is macOS only".into())
    }
    #[cfg(target_os = "macos")]
    {
        let exe = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let app = exe
            .ancestors()
            .find(|p| p.extension().is_some_and(|e| e == "app"))
            .ok_or("INVALID_ARGUMENT: run the CLI bundled in the App")?;
        let target = app
            .join("Contents/Resources/bin/arc")
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let path = dirs::home_dir()
            .ok_or("home unavailable")?
            .join(".local/bin/arc");
        let path_hint = path_hint(path.parent().unwrap()).await;
        let marker = root().join("app/cli-shim.json");
        if std::fs::symlink_metadata(&path).is_ok() {
            if std::fs::read_link(&path).is_ok_and(|p| p == target) {
                return Ok(
                    json!({"path":path,"target":target,"created":false,"pathHint":path_hint}),
                );
            }
            return Err("SHIM_EXISTS: ~/.local/bin/arc already exists; nothing overwritten".into());
        }
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        std::os::unix::fs::symlink(&target, &path).map_err(|e| e.to_string())?;
        if let Err(error) = save(&marker, &json!({"path":path,"target":target})) {
            let _ = std::fs::remove_file(&path);
            return Err(error);
        }
        Ok(json!({"path":path,"target":target,"created":true,"pathHint":path_hint}))
    }
}
pub(crate) fn owned(executable: &Path) -> Option<PathBuf> {
    let record = load(&root().join("app/cli-shim.json")).ok()?;
    let path = dirs::home_dir()?.join(".local/bin/arc");
    if record["path"].as_str()? != path.to_str()? {
        return None;
    }
    let target = std::fs::read_link(&path).ok()?;
    let app = executable
        .ancestors()
        .find(|p| p.extension().is_some_and(|e| e == "app"))?;
    (target == Path::new(record["target"].as_str()?) && target.starts_with(app)).then_some(path)
}

#[cfg(target_os = "macos")]
async fn path_hint(directory: &Path) -> Value {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut command = tokio::process::Command::new(&shell);
    // Probe SSH-style non-interactive startup without an interactive parent's PATH additions.
    command
        .args(["-c", "printf '\\036%s' \"$PATH\""])
        .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
        .kill_on_drop(true);
    let output = tokio::time::timeout(std::time::Duration::from_secs(3), command.output()).await;
    let in_path = output
        .ok()
        .and_then(|r| r.ok())
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| {
            s.rsplit_once('\u{1e}')
                .map(|(_, path)| std::env::split_paths(path).any(|p| p == directory))
        });
    let fix = match Path::new(&shell).file_name().and_then(|s| s.to_str()) {
        Some("zsh") => Some(
            r#"printf '%s\n' 'export PATH="$HOME/.local/bin:$PATH"' >> "${ZDOTDIR:-$HOME}/.zshenv""#,
        ),
        _ => None,
    };
    json!({"shell":shell,"inPath":in_path,"baselinePath":"/usr/bin:/bin:/usr/sbin:/sbin",
        "command":if in_path == Some(true) { None } else { fix },
        "message":match in_path { Some(true) => "Available in non-interactive shell PATH", Some(false) => "Add ~/.local/bin to non-interactive shell startup; shell configuration was not changed", None => "Could not inspect non-interactive shell PATH; shell configuration was not changed" }})
}
