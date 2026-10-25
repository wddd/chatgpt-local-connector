//! Backup deletion is limited to receipt-owned storage and obsolete sibling bundles.
use super::*;

/// Resolve only known backup directories for terminal, recoverable replacement receipts.
pub fn cleanup_candidate(
    base: &Path,
    temporary: &Path,
    receipt: &Value,
    target: &Path,
) -> Option<PathBuf> {
    let id = receipt["id"].as_str()?;
    if uuid::Uuid::parse_str(id).is_err()
        || receipt["target"].as_str()? != target.to_str()?
        || !matches!(
            string(receipt, "state"),
            "succeeded" | "rolled-back" | "cancelled" | "failed"
        )
        || (receipt["state"] == "failed" && receipt["backupMoved"] != false)
    {
        return None;
    }
    for directory in [
        base.join("backups").join(id),
        temporary.join(format!("arc-replacement-{id}")),
    ] {
        if receipt["backup"].as_str()? == directory.join("Agent Remote Control.app").to_str()? {
            return Some(directory);
        }
    }
    None
}

/// Match one installed application's obsolete sibling backup names, never arbitrary paths.
pub fn legacy_backup_name(target: &str, name: &str) -> bool {
    name.strip_prefix(&format!("{target}.backup-"))
        .is_some_and(|suffix| {
            !suffix.is_empty()
                && suffix
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
        })
}

#[cfg(target_os = "macos")]
pub(super) async fn cleanup(receipt: &Value) -> Result<Value> {
    let target = Path::new(string(receipt, "target"));
    let recovered = receipt["state"] == "rolled-back";
    let succeeded = receipt["state"] == "succeeded";
    let mut removed = Vec::new();
    let mut errors = Vec::new();
    let mut candidates = Vec::new();
    let mut retained = Vec::new();
    if succeeded || recovered {
        for entry in std::fs::read_dir(directory()).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_type().map_err(|e| e.to_string())?.is_dir()
                || uuid::Uuid::parse_str(&entry.file_name().to_string_lossy()).is_err()
            {
                continue;
            }
            let Ok(previous) = load(&entry.path().join("status.json")) else {
                continue;
            };
            if previous["id"].as_str() != entry.file_name().to_str() {
                continue;
            }
            if let Some(path) =
                cleanup_candidate(&directory(), &std::env::temp_dir(), &previous, target)
            {
                if previous["backupReady"] == true
                    && path.is_dir()
                    && matches!(string(&previous, "state"), "succeeded" | "rolled-back")
                {
                    retained.push((string(&previous, "createdAt").to_owned(), path));
                } else {
                    candidates.push(path);
                }
            }
        }
        retained.sort_by(|a, b| b.0.cmp(&a.0));
        candidates.extend(retained.iter().skip(3).map(|(_, p)| p.clone()));
        // These copies predate receipt-owned backup storage. Authenticate before removing them.
        let parent = target.parent().ok_or("REPLACE_TARGET_INVALID")?;
        let name = target
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("REPLACE_TARGET_INVALID")?;
        for entry in std::fs::read_dir(parent).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_type().map_err(|e| e.to_string())?.is_dir()
                || !legacy_backup_name(name, &entry.file_name().to_string_lossy())
            {
                continue;
            }
            match crate::package::signature(
                &entry.path(),
                string(&receipt["oldPackage"], "identifier"),
            )
            .await
            {
                Ok(()) => candidates.push(entry.path()),
                Err(error) => errors.push(json!({"path":entry.path(),"error":error})),
            }
        }
    } else if receipt["state"] == "cancelled" {
        if let Some(path) = cleanup_candidate(&directory(), &std::env::temp_dir(), receipt, target)
        {
            candidates.push(path);
        }
    } else {
        return Ok(json!({"retainedBackup":receipt["backup"],"removed":[],"errors":[]}));
    }
    for path in candidates {
        match std::fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
                match std::fs::remove_dir_all(&path) {
                    Ok(()) => removed.push(path),
                    Err(error) => errors.push(json!({"path":path,"error":error.to_string()})),
                }
            }
            Ok(_) => errors.push(json!({"path":path,"error":"REPLACE_BACKUP_PATH_INVALID"})),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(error) => errors.push(json!({"path":path,"error":error.to_string()})),
        }
    }
    Ok(
        json!({"retainedBackup":if succeeded {receipt["backup"].clone()}else{Value::Null},"removed":removed,"errors":errors}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cleanup_cannot_escape_owned_storage_or_remove_needed_recovery() {
        // Property: cleanup candidates belong to the same target and exact UUID-owned backup directory after a terminal recoverable outcome.
        let base = Path::new("/state/app-replacements");
        let temporary = Path::new("/temporary");
        let target = Path::new("/Applications/Fixture.app");
        let id = "00000000-0000-4000-8000-000000000001";
        let owned = base.join("backups").join(id);
        let receipt = json!({"id":id,"target":target,"state":"succeeded","backupMoved":true,"backup":owned.join("Agent Remote Control.app")});
        assert_eq!(
            cleanup_candidate(base, temporary, &receipt, target),
            Some(owned.clone())
        );
        for patch in [
            json!({"id":"../other"}),
            json!({"target":"/Applications/Other.app"}),
            json!({"backup":"/unrelated/Agent Remote Control.app"}),
            json!({"state":"installing"}),
            json!({"state":"failed"}),
        ] {
            let mut changed = receipt.clone();
            for (key, value) in patch.as_object().unwrap() {
                changed[key] = value.clone();
            }
            assert_eq!(cleanup_candidate(base, temporary, &changed, target), None);
        }
        let mut recovered = receipt;
        recovered["state"] = json!("rolled-back");
        assert_eq!(
            cleanup_candidate(base, temporary, &recovered, target),
            Some(owned)
        );
    }
    #[test]
    fn legacy_names_are_limited_to_the_selected_application() {
        // Property: legacy cleanup names cannot select the installed bundle, another app, or a path containing separators.
        assert!(legacy_backup_name(
            "Fixture.app",
            "Fixture.app.backup-20261025-1234"
        ));
        for name in [
            "Fixture.app",
            "Other.app.backup-1234",
            "Fixture.app.backup-",
            "Fixture.app.backup-../../Other.app",
        ] {
            assert!(!legacy_backup_name("Fixture.app", name));
        }
    }
}
