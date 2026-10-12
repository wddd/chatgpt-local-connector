# 发布维护

源码与下载仓库：`whzxc/chatgpt-local-connector`。版本以 `package.json` 为准，GitHub Releases 托管安装包、更新包、静态 `latest.json` 和 Homebrew cask；不发布公共 npm 包。

## 配置

Actions Secrets 设置 `TAURI_SIGNING_PRIVATE_KEY`，加密私钥另设 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。私钥必须对应 `desktop/tauri.conf.json` 中的更新公钥，在仓库外保存并备份。工作流使用 Contents 写权限发布文件，不提交源码。

本地发布需要 Node.js 24、Rust、npm 依赖及已登录的 `gh`，并有仓库推送权限。不需要 Apple Developer ID、公证或 Authenticode 证书；macOS 使用 ad-hoc 签名，Tauri 更新包使用 Minisign 签名。

## 默认发布 macOS

取得发布授权后，在干净的 `main` 工作区执行：

```sh
npm run release
# 已完成测试时可跳过本次本地测试：
npm run release -- --skip-tests
```

命令获取远端 main 和标签，沿用 prepare 逻辑准备版本与 CHANGELOG，默认只运行一次 `npm test`，然后打 `v<版本>` 标签并原子推送 main 与该标签。远端 main 已领先时先合并再发布；命令不会自动重写历史。推送失败时，本地版本提交和标签仍保留，解决原因后可执行 `git push --atomic origin main refs/tags/v<版本>`。

`release:prepare` 查询 GitHub 已公开正式 Release 的最高稳定版本，忽略草稿和预发布：当前版本不高于它时升至其下一个 patch，同步 npm/Tauri/Cargo 版本文件，生成自上次发布以来的 CHANGELOG，并创建一条 `chore(release)` 提交。当前版本已更高或没有正式 Release 时保留当前版本，只检查一致性。单独运行 prepare 不打标签或推送；`npm run release:prepare -- --dry-run` 仅显示版本计划。

需要 minor/major 时先修改版本并运行 `npm run release:sync`，在普通开发提交中提交。sync 同步版本文件并检查一次一致性，不提交。prepare 修改版本时复用这次检查，不重复校验。已有版本没有 CHANGELOG 条目时，发布说明从 Git 历史生成，要求上次发布标签是当前提交的祖先。

标签触发 `release.yml` 的单个 macOS 作业：

1. 构建 `aarch64-apple-darwin` 的 DMG、更新包和签名。
2. stage 统一文件名；生成元数据时验签一次，生成仅含 `darwin-aarch64` 的 `latest.json`、release notes、Homebrew cask 和 `SHA256SUMS.txt`。
3. 用一条 `gh release create <tag> <文件...> --notes-file ... --latest` 上传并公开。

不运行演练或自动 Check，不跨作业传递 artifacts，不下载已发布文件做重复比对。失败可重跑尚未创建 Release 的构建；若创建过程中留下不完整 Release，可用 `gh release upload <tag> <文件...> --clobber` 补传缺失文件。

## 按需补发 Windows

在 Actions 手动运行 `Release Windows`，或：

```sh
gh workflow run release-windows.yml --ref main
# 指定已有 Release：
gh workflow run release-windows.yml --ref main -f tag=v<版本>
```

不填 tag 时解析最新公开 Release。工作流 checkout 该标签对应的提交，构建 `x86_64-pc-windows-msvc`，生成元数据时对本次 exe 验签一次。下载该 Release 的 `latest.json` 和 `SHA256SUMS.txt`，保留 macOS 平台、发布说明和日期，将 `windows-x86_64`、`windows-x86_64-nsis` 合并到清单，更新 Windows 与清单的哈希，然后用 `--clobber` 上传 exe、sig 和两个元数据文件。两个发布工作流共享并发组，避免同时修改 Release。

补发前，最新 Release 的更新清单没有 Windows 平台条目，Windows 客户端无法通过该清单取得 Windows 自动更新。补发旧版本不会将该版本设为 latest。补发要求目标标签包含这套发布脚本。

## 检查、验签与缓存

`check.yml` 仅手动触发，保留格式、类型、现有测试、前端构建和原生检查。日常 push/PR 不触发检查。本地按需直接运行 `npm test`；一键发布已默认执行一次。

保留小型 `tooling/verifier` Rust crate，复用与 Tauri updater 相同的 Minisign 库；不额外安装跨平台验签工具，也不手写签名协议。stage 只整理文件，每个平台仅在元数据生成时调用一次 verifier。

npm 下载使用 setup-node 缓存；Rust 构建和 verifier 由 rust-cache 缓存，两种发布均允许保存缓存。GitHub 缓存有 ref 作用域：标签缓存不保证能被后续不同标签复用，默认分支缓存仍可作为回退。macOS 发布目标约 5 分钟，实际取决于 runner 排队、缓存命中和编译；冷缓存会更慢。耗时直接查看 Actions 步骤，不设置额外 timings 作业。

## 本地构建

macOS Apple Silicon 发布构建：

```sh
rustup target add aarch64-apple-darwin
# 将 TAURI_SIGNING_PRIVATE_KEY 设置为仓库外私钥文件的路径，勿把内容写入命令历史。
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.config/local-connector/release/updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=''
npm run desktop:build -- --release --target aarch64-apple-darwin
npm run release:stage -- darwin-aarch64 desktop/target/aarch64-apple-darwin/release/bundle release-artifacts/macos
```

Windows 在原生 Windows 环境使用 `--target x86_64-pc-windows-msvc`，stage 平台参数为 `windows-x86_64`。

macOS DMG 使用 `desktop/assets/dmg-background.png` 提供无文案的拖拽安装引导，窗口尺寸与图标位置在 `desktop/tauri.conf.json` 的 `bundle.macOS.dmg` 中配置。背景中的两个落点对应实际应用与 Applications 文件夹，箭头指向右侧。macOS 构建需要 `uv`；`desktop:build` 在 Tauri 生成应用后，通过 `tooling/build-dmg.py` 调用固定版本的 dmgbuild 直接写入布局，无需 Finder 会话。Python 与 dmgbuild 仅用于构建，不进入安装包。

原生深浅色图标需要完整 Xcode 26+。构建脚本先用 `actool` 编译 `.icon` 源文件，再将 `target` 下生成的 `Assets.car` 交给 Tauri 打包；开发模式复用相同编译入口。生成资源不进入版本库。

Stage 目录使用新的空目录；stage 只收集文件，元数据命令负责验签。macOS 可继续执行 `npm run release:finalize -- release-artifacts/macos` 生成本地发布文件，不上传。

## ChatGPT Desktop 插件

ChatGPT Desktop 插件分别由 [chatgpt-usage-plugin](https://github.com/whzxc/chatgpt-usage-plugin) 与 [chatgpt-kanban-plugin](https://github.com/whzxc/chatgpt-kanban-plugin) 独立维护、构建和分发。Connector Desktop 发布流程不生成插件 ZIP 或 Core 插件更新载荷，不同步 Git 插件市场，也不安装或更新宿主中的插件。
