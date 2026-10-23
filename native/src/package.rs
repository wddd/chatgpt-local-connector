//! Native macOS package checks, also used by the detached replacement worker.
use crate::*;
use std::fs;

const IDENTIFIER: &str = "com.whzxc.agent-remote-control";
const CERTIFICATE: &str = "dce238666578502cf7de81a7b4d5e835a186bc60";
include!(concat!(env!("OUT_DIR"), "/package_skills.rs"));

pub(crate) async fn plist(app: &Path, key: &str) -> Result<String> {
    Ok(output(
        "/usr/libexec/PlistBuddy",
        &[
            "-c",
            &format!("Print :{key}"),
            &app.join("Contents/Info.plist").to_string_lossy(),
        ],
    )
    .await?
    .trim()
    .into())
}

pub(crate) async fn signature(app: &Path, identifier: &str) -> Result<()> {
    if ![IDENTIFIER, "com.whzxc.agent-remote-control.dev"].contains(&identifier) {
        return Err("REPLACE_INVALID_PACKAGE: unsupported bundle identifier".into());
    }
    for (path, suffix) in [
        (app.to_path_buf(), ""),
        (app.join("Contents/Resources/bin/arc"), ".core"),
        (app.join("Contents/Resources/bin/arc-screen"), ".screen"),
    ] {
        let mut args = vec!["--verify", "--strict"];
        let requirement = format!(
            "=identifier \"{identifier}{suffix}\" and certificate leaf = H\"{CERTIFICATE}\""
        );
        if identifier == IDENTIFIER {
            args.extend(["-R", &requirement]);
        }
        let name = path.to_string_lossy();
        args.push(&name);
        output("/usr/bin/codesign", &args).await?;
    }
    Ok(())
}

fn inspect(path: &Path) -> Result<()> {
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        if [
            "node_modules",
            "runtime",
            "node",
            "node.exe",
            "npm",
            "npx",
            "desktop-launch.mjs",
        ]
        .iter()
        .any(|n| name == *n)
        {
            return Err("REPLACE_INVALID_PACKAGE: legacy runtime resource".into());
        }
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        // ARC has no framework symlinks. Reject them instead of following paths outside the bundle.
        if kind.is_symlink() || (!kind.is_file() && !kind.is_dir()) {
            return Err(
                "REPLACE_INVALID_PACKAGE: links and special files are not supported".into(),
            );
        }
        if kind.is_dir() {
            inspect(&entry.path())?;
        }
    }
    Ok(())
}

/// Run with the candidate Core so embedded resources and version describe that package.
pub async fn check(app: &Path) -> Result<Value> {
    if app.extension().is_none_or(|e| e != "app") {
        return Err("REPLACE_INVALID_PACKAGE: expected .app".into());
    }
    inspect(app)?;
    let identifier = plist(app, "CFBundleIdentifier").await?;
    signature(app, &identifier).await?;
    let resources = app.join("Contents/Resources");
    let version = plist(app, "CFBundleShortVersionString").await?;
    let core = resources.join("bin/arc");
    if version != env!("ARC_BUILD_VERSION")
        || output(&core, &["--version"]).await?.trim() != version
    {
        return Err("REPLACE_INVALID_PACKAGE: Desktop and Core versions differ".into());
    }
    if plist(app, "CFBundleExecutable").await? != "agent-remote-control-desktop"
        || !app
            .join("Contents/MacOS/agent-remote-control-desktop")
            .is_file()
    {
        return Err("REPLACE_INVALID_PACKAGE: missing Desktop executable".into());
    }
    for (name, bytes) in SKILLS {
        if fs::read(resources.join("skills/arc-setup").join(name)).map_err(|e| e.to_string())?
            != *bytes
        {
            return Err(format!(
                "REPLACE_INVALID_PACKAGE: skill resource differs: {name}"
            ));
        }
    }
    let name = plist(app, "CFBundleIconName").await?;
    if name.contains('/')
        || name != plist(app, "CFBundleIconFile").await?
        || !resources.join(format!("{name}.icns")).is_file()
    {
        return Err("REPLACE_INVALID_PACKAGE: invalid icon name".into());
    }
    let assets: Value = serde_json::from_str(
        &output(
            "/usr/bin/xcrun",
            &[
                "assetutil",
                "--info",
                &resources.join("Assets.car").to_string_lossy(),
            ],
        )
        .await?,
    )
    .map_err(|e| e.to_string())?;
    let assets = assets
        .as_array()
        .ok_or("REPLACE_INVALID_PACKAGE: invalid icon assets")?;
    if !assets
        .iter()
        .any(|a| a["AssetType"] == "Icon Image" && a["Name"] == name)
        || ["NSAppearanceNameAqua", "NSAppearanceNameDarkAqua"]
            .iter()
            .any(|appearance| {
                !assets.iter().any(|a| {
                    a["AssetType"] == "IconImageStack"
                        && a["Name"] == name
                        && a["Appearance"] == *appearance
                })
            })
    {
        return Err("REPLACE_INVALID_PACKAGE: missing native icon appearance".into());
    }
    Ok(
        json!({"identifier":identifier,"version":version,"coreBuild":crate::runtime::build_id(&core)?,"desktopBuild":crate::runtime::build_id(&app.join("Contents/MacOS/agent-remote-control-desktop"))?}),
    )
}
