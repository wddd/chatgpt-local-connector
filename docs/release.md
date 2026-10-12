# 发布维护

源码与下载仓库：`whzxc/chatgpt-local-connector`。版本以 `package.json` 为准，GitHub Releases 托管安装包、更新包、静态 `latest.json` 和 Homebrew cask；不发布公共 npm 包。

## 本地配置

默认在 Apple Silicon Mac 上构建并通过 `gh` 上传。需要 Node.js 24、Rust、npm 依赖、完整 Xcode 26+、`uv`，以及已登录且有仓库推送权限的 `gh`。macOS 未配置签名身份时使用 ad-hoc 签名，也支持显式指定个人 Developer ID 与公证凭据。Tauri 更新包始终使用独立的 Minisign 签名，Apple 证书不能替代 updater 私钥。

私钥必须对应 `desktop/tauri.conf.json` 中的更新公钥，由维护者自行配置并保存在仓库外。脚本只读取密钥，不生成、复制、移动或输出私钥。按以下优先级读取：

1. `TAURI_SIGNING_PRIVATE_KEY`：Tauri 支持的私钥内容或已有私钥文件路径。
2. `TAURI_SIGNING_PRIVATE_KEY_FILE`：已有私钥文件的路径。
3. 默认文件 `~/.tauri/local-connector.key`。

例如指向已有文件：

```sh
export TAURI_SIGNING_PRIVATE_KEY_FILE="$HOME/.tauri/local-connector.key"
# 加密私钥另通过环境配置 TAURI_SIGNING_PRIVATE_KEY_PASSWORD，勿将密码写入命令历史。
```

签名配置缺失时，发布和演练均在版本修改、构建之前报错。普通 `npm run desktop:build` 允许不配置私钥，此时只生成 App、DMG，不生成 updater 签名；配置了密钥则生成 updater 产物。

## 配置个人 Developer ID

脚本不自动选取钥匙串里的证书。只有明确设置 `APPLE_SIGNING_IDENTITY` 才使用 Developer ID，必须填写个人团队的完整 `Developer ID Application: 姓名 (TEAMID)` 名称；不接受 `Apple Development`、通配符或哈希。不要填写公司团队的证书。证书主体与团队归属由维护者核对，脚本不根据姓名推断个人或公司身份，也不内置私人账号或团队信息。

1. 使用自己的付费 Apple Developer Program 个人团队；免费 Personal Team 的开发证书不能用于 Developer ID 分发。
2. 在“钥匙串访问 → 证书助理 → 从证书颁发机构请求证书”创建 CSR，在个人团队的 Apple Developer “Certificates, Identifiers & Profiles”中创建 **Developer ID Application** 证书并上传 CSR。下载 `.cer` 后双击安装到生成 CSR 的 Mac 钥匙串，保留配套私钥。也可使用 Xcode 的个人团队证书管理入口。
3. 用以下命令找到个人团队的完整名称，再配置当前 shell；本地构建无需导出 `.p12`：

```sh
security find-identity -v -p codesigning
export APPLE_SIGNING_IDENTITY='Developer ID Application: Your Name (YOURTEAMID)'
# updater 仍需单独指向已经存在的项目私钥
export TAURI_SIGNING_PRIVATE_KEY_FILE='/absolute/path/to/existing/updater.key'
npm run release -- --dry-run
```

release profile 的独立 Core 和桌面 App 使用同一明确指定的证书，启用 hardened runtime 与安全时间戳。未配置身份、显式设置为 `-`、或 debug 构建时使用 ad-hoc，并移除 Apple 公证凭据，避免意外选择钥匙串中的其他证书。已有个人证书缺失或不可用时签名报错，不回退使用其他证书。

Developer ID 签名与 Apple 公证是不同环节。需要公证时，在本机安全配置同一个人团队的 `APPLE_ID`、`APPLE_TEAM_ID` 和 **App 专用密码** `APPLE_PASSWORD`；不要使用 Apple ID 登录密码或将密码写入命令历史。也可按 Tauri 官方文档使用 App Store Connect API 凭据。只有显式选择 Developer ID 后，构建脚本才将这些变量传递给 Tauri。未提供公证凭据时，只签名，不公证。

`--dry-run` 不创建 GitHub Release，但配置公证凭据后会向 Apple 提交公证。只做离线本地签名检查时，应先从当前 shell 移除 `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` 和 `APPLE_API_KEY` / `APPLE_API_ISSUER` / `APPLE_API_KEY_PATH`。正式分发前需完成公证。证书配置参考 [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/)。

## 默认本地发布 macOS

取得发布授权后，在干净且不落后于远端的 `main` 工作区执行：

```sh
npm run release
# 已完成测试时可跳过本次测试：
npm run release -- --skip-tests
```

命令依次执行：

1. 检查本地签名配置、分支与工作区、`gh` 登录，获取远端 main 和标签；远端 main 已领先或分叉时先自行合并。
2. prepare 升 patch、同步版本、生成 CHANGELOG 并提交；默认运行一次 `npm test`。
3. 在本机构建 Apple Silicon 安装包、updater 更新包与签名。
4. 在新的 `release-artifacts/v<版本>-<随机后缀>/` 目录整理文件，验签一次，生成仅含 `darwin-aarch64` 的 `latest.json`、`release-notes.md`、Homebrew cask 和 `SHA256SUMS.txt`。
5. 打 `v<版本>` 标签，原子推送 main 和该标签。
6. 执行一条 `gh release create <tag> <文件...> --verify-tag --notes-file ... --latest` 上传并公开。

构建或验签失败时不会打标签、推送或创建 Release，已生成的本地版本提交保留。推送或上传失败时，本地产物和标签保留；检查失败点后分别重试 `git push --atomic origin main refs/tags/v<版本>`、`gh release create`，或用 `gh release upload <tag> <缺失文件...> --clobber` 补传。命令遇到已有标签会停止，避免误改标签。

`release:prepare` 查询 GitHub 已公开正式 Release 的最高稳定版本，忽略草稿和预发布：当前版本不高于它时升至其下一个 patch，同步 npm/Tauri/Cargo 版本文件，生成自上次发布以来的 CHANGELOG，并创建一条 `chore(release)` 提交。当前版本已更高或没有正式 Release 时保留当前版本并检查一致性。单独运行 prepare 不打标签或推送；`npm run release:prepare -- --dry-run` 只显示版本计划。

需要 minor/major 时先修改版本并运行 `npm run release:sync`，在普通开发提交中提交。sync 同步版本文件并检查一致性，不提交。已有版本没有 CHANGELOG 条目时，发布说明从 Git 历史生成，要求上次发布标签是当前提交的祖先。

## 本地演练

```sh
npm run release -- --dry-run
```

使用当前版本和工作区源码，构建并生成全部发布文件到新的 `release-artifacts/v<版本>-<随机后缀>/`，包括 updater 签名与一次验签。不会升版本、修改 CHANGELOG、提交、打标签、推送或上传，不要求干净工作区，也不运行测试。演练仍需要真实签名配置；没有签名密钥时，可运行 `npm run desktop:build` 验证未生成 updater 签名的构建。

演练产物的下载链接使用当前版本号，仅用于检查。正式发布需通过默认命令 prepare 后重新构建。构建不会安装、替换或重启正在运行的应用。

## 可选 Actions 发布

配置 Actions Secrets `TAURI_SIGNING_PRIVATE_KEY` 和（加密私钥需要的）`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，然后在干净的 main 上执行：

```sh
npm run release -- --ci
# 或针对已推送的标签手动触发：
gh workflow run release.yml --ref main -f tag=v<版本>
```

`--ci` 不需要本地私钥：prepare、默认测试、打标签并推送后，显式 dispatch `release.yml`。该工作流只接受 `workflow_dispatch`，checkout 输入的标签，构建 macOS 产物、验签一次、生成元数据并发布。tag push 不触发发布，避免与本地路线重复。

两个发布工作流共享并发组；不要同时对同一版本运行本地与 Actions 发布。

## 按需补发 Windows

```sh
gh workflow run release-windows.yml --ref main
# 指定已有 Release：
gh workflow run release-windows.yml --ref main -f tag=v<版本>
```

不填 tag 时解析最新公开 Release。工作流 checkout 该标签对应提交，构建 `x86_64-pc-windows-msvc`，对本次 exe 验签一次。下载该 Release 的 `latest.json` 和 `SHA256SUMS.txt`，保留 macOS 平台、说明和日期，合并 `windows-x86_64`、`windows-x86_64-nsis` 与哈希，用 `--clobber` 上传 exe、sig 和两个元数据文件。

补发前，更新清单没有 Windows 条目，Windows 客户端无法通过该清单取得 Windows 自动更新。补发旧版本不会将其设为 latest；目标标签需包含这套发布脚本。

## 构建目录与缓存

`.cargo/config.toml` 和构建脚本统一使用仓库根目录 `target/`。两个 crate 的 release profile 均为 `lto = false`、`codegen-units = 16`、`strip = true`。`build-native.mjs` 使用 desktop manifest 的 `core-bin` 可执行目标，复用同一套依赖版本和 features；Core 入口仍在 `native/src/main.rs`。`core-bin` 仅用于构建独立 Core，不参与桌面打包。打包阶段使用一致的 target、profile、`tauri/custom-protocol` 、macOS deployment target 与去重后的路径映射参数，复用 `connector-core` 编译结果。开发构建不启用 custom protocol，两个 crate 的 dev profile 保持一致。

- Cargo 缓存和二进制：`target/<三元组>/<profile>/`；无显式 target 的开发构建为 `target/debug/`。
- macOS 安装包：`target/aarch64-apple-darwin/release/bundle/`。
- Windows 安装包：`target/x86_64-pc-windows-msvc/release/bundle/`。
- 独立 Core 的打包暂存：`dist/native/`，Tauri 仍通过 resources 映射到 `bin/`。
- 编译图标：`target/release-icon/`、`target/dev-icon/`；隔离合同测试：`target/contracts/`。

npm 使用 setup-node 缓存；rust-cache 缓存共享 `target/`，发布工作流允许保存缓存。推荐从 main dispatch，使缓存留在默认分支作用域，checkout 标签不改变工作流的 ref 作用域。`check.yml` 仅手动触发；日常 push/PR 不触发检查。

`check:package` 检查安装包资源，`tooling/verifier` 复用与 Tauri updater 相同的 Minisign 库。stage 只整理文件，每个平台仅在元数据生成时验签一次。需要单独操作时：

```sh
npm run desktop:build -- --release --target aarch64-apple-darwin
npm run release:stage -- darwin-aarch64 target/aarch64-apple-darwin/release/bundle release-artifacts/macos
npm run release:finalize -- release-artifacts/macos
```

stage 输出目录必须为空。Windows 使用 `--target x86_64-pc-windows-msvc`，stage 平台为 `windows-x86_64`。

macOS DMG 通过 `tooling/build-dmg.py` 调用固定版本的 dmgbuild，使用 `desktop/assets/dmg-background.png` 与 Tauri 配置中的布局，无需 Finder 会话。原生深浅色图标通过 Xcode `actool` 编译后交给 Tauri 打包。构建依赖和生成资源不进入版本库或安装包运行环境。

## ChatGPT Desktop 插件

ChatGPT Desktop 插件分别由 [chatgpt-usage-plugin](https://github.com/whzxc/chatgpt-usage-plugin) 与 [chatgpt-kanban-plugin](https://github.com/whzxc/chatgpt-kanban-plugin) 独立维护、构建和分发。Connector Desktop 发布流程不生成插件 ZIP 或 Core 插件更新载荷，不同步 Git 插件市场，也不安装或更新宿主中的插件。
