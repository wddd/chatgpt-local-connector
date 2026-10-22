//! Install only an owned symlink; never replace a user's launcher.
use crate::*;
pub(crate) fn install() -> Result<Value> {
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
        let marker = root().join("app/cli-shim.json");
        if std::fs::symlink_metadata(&path).is_ok() {
            if std::fs::read_link(&path).is_ok_and(|p| p == target) {
                return Ok(json!({"path":path,"target":target,"created":false}));
            }
            return Err("SHIM_EXISTS: ~/.local/bin/arc already exists; nothing overwritten".into());
        }
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        std::os::unix::fs::symlink(&target, &path).map_err(|e| e.to_string())?;
        if let Err(error) = save(&marker, &json!({"path":path,"target":target})) {
            let _ = std::fs::remove_file(&path);
            return Err(error);
        }
        Ok(json!({"path":path,"target":target,"created":true}))
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
