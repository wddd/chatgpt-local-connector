include!("../tooling/build-version.rs");
fn main() {
    build_version();
    let base = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("../skills/arc-setup");
    println!("cargo:rerun-if-changed={}", base.display());
    let mut files = vec![base.join("SKILL.md")];
    files.extend(
        std::fs::read_dir(base.join("playbooks"))
            .unwrap()
            .map(|e| e.unwrap().path()),
    );
    files.sort();
    let entries = files
        .iter()
        .map(|file| {
            format!(
                "({:?}, include_bytes!({:?})),",
                file.strip_prefix(&base)
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .replace('\\', "/"),
                file.to_str().unwrap()
            )
        })
        .collect::<String>();
    std::fs::write(
        std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("package_skills.rs"),
        format!("const SKILLS: &[(&str, &[u8])] = &[{entries}];"),
    )
    .unwrap();
}
