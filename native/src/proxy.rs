use crate::{string, Result};
use reqwest::{ClientBuilder, Url};
use serde_json::Value;
#[cfg(any(target_os = "macos", windows))]
use std::time::Duration;

const PROXY_KEYS: [&str; 6] = [
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
];

/// One snapshot per operation, shared by downloads and Tunnel children.
#[derive(Clone)]
pub struct NetworkProxy {
    http: Option<Url>,
    https: Option<Url>,
    bypass: String,
    pub message: &'static str,
}

pub fn validate(mode: &str, address: &str) -> Result<()> {
    if !["system", "direct", "custom"].contains(&mode) {
        return Err("Invalid proxy mode".into());
    }
    if mode == "custom" {
        parse_url(address)?;
    } else if !address.is_empty() {
        return Err("Only a custom proxy accepts an address".into());
    }
    Ok(())
}

fn parse_url(address: &str) -> Result<Url> {
    let error = "Enter an HTTP/HTTPS proxy URL, such as http://127.0.0.1:7890. Embedded credentials are unsupported.";
    if address.len() > 2048 {
        return Err(error.into());
    }
    let url = Url::parse(address).map_err(|_| error)?;
    if !["http", "https"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
        || url.port() == Some(0)
    {
        return Err(error.into());
    }
    Ok(url)
}

impl NetworkProxy {
    /// Relay traffic honors launching-shell proxies on every platform, then native settings.
    pub async fn resolve_relay(settings: &Value) -> Result<Self> {
        if string(settings, "proxyMode") == "system" {
            let env = |keys: &[&str]| -> Result<Option<Url>> {
                keys.iter()
                    .filter_map(|key| std::env::var(key).ok())
                    .find(|v| !v.is_empty())
                    .map(|v| {
                        let url =
                            Url::parse(&v).map_err(|_| "Invalid relay proxy environment URL")?;
                        if !["http", "https", "socks5", "socks5h"].contains(&url.scheme())
                            || url.host_str().is_none()
                        {
                            return Err("Unsupported relay proxy environment URL".into());
                        }
                        Ok(url)
                    })
                    .transpose()
            };
            let https = env(&["https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"])?;
            if https.is_some() {
                return Ok(Self {
                    http: env(&["http_proxy", "HTTP_PROXY", "all_proxy", "ALL_PROXY"])?,
                    https,
                    bypass: format!(
                        "{},localhost,127.0.0.1,::1",
                        std::env::var("NO_PROXY")
                            .or_else(|_| std::env::var("no_proxy"))
                            .unwrap_or_default()
                    ),
                    message: "Using relay environment proxy",
                });
            }
        }
        Self::resolve(settings).await
    }

    pub async fn resolve(settings: &Value) -> Result<Self> {
        let mode = string(settings, "proxyMode");
        let address = string(settings, "proxyUrl");
        validate(mode, address)?;
        let mut bypass = ["NO_PROXY", "no_proxy"]
            .iter()
            .filter_map(|key| std::env::var(key).ok())
            .filter(|v| !v.is_empty())
            .collect::<Vec<_>>();
        bypass.push("localhost,127.0.0.1,::1".into());
        let mut proxy = Self {
            http: None,
            https: None,
            bypass: bypass.join(","),
            message: "Proxy disabled; connecting directly",
        };
        match mode {
            "custom" => {
                let url = parse_url(address)?;
                proxy.http = Some(url.clone());
                proxy.https = Some(url);
                proxy.message = "Using custom proxy";
            }
            "system" => {
                proxy.message = "No system HTTP/HTTPS proxy configured; connecting directly";
                #[cfg(target_os = "macos")]
                proxy.detect_macos().await?;
                #[cfg(windows)]
                proxy.detect_windows().await?;
                #[cfg(target_os = "linux")]
                {
                    let env = |keys: [&str; 2]| -> Result<Option<Url>> {
                        keys.iter()
                            .filter_map(|key| std::env::var(key).ok())
                            .find(|v| !v.is_empty())
                            .map(|v| {
                                // Native environment proxy URLs may include authentication.
                                let url = Url::parse(&v)
                                    .map_err(|_| "Invalid HTTP/HTTPS proxy environment URL")?;
                                if !["http", "https"].contains(&url.scheme())
                                    || url.host_str().is_none()
                                {
                                    return Err(
                                        "HTTP/HTTPS proxy environment must use http:// or https://"
                                            .into(),
                                    );
                                }
                                Ok(url)
                            })
                            .transpose()
                    };
                    proxy.http = env(["http_proxy", "HTTP_PROXY"])?;
                    proxy.https = env(["https_proxy", "HTTPS_PROXY"])?;
                }
                if proxy.http.is_some() || proxy.https.is_some() {
                    proxy.message = "Using system HTTP/HTTPS proxy";
                }
            }
            _ => {}
        }
        Ok(proxy)
    }

    pub fn tunnel_proxy_url(&self) -> Option<&str> {
        self.https
            .as_ref()
            .or(self.http.as_ref())
            .map(|url| url.as_str())
    }

    pub fn apply(&self, command: &mut tokio::process::Command) {
        // The explicit UI choice must not be overridden by the launching shell.
        for key in PROXY_KEYS {
            command.env_remove(key);
        }
        for (keys, url) in [
            (["HTTP_PROXY", "http_proxy"], &self.http),
            (["HTTPS_PROXY", "https_proxy"], &self.https),
        ] {
            if let Some(url) = url {
                for key in keys {
                    command.env(key, url.as_str());
                }
            }
        }
        command
            .env("NO_PROXY", &self.bypass)
            .env("no_proxy", &self.bypass);
    }

    pub fn client(&self, builder: ClientBuilder) -> ClientBuilder {
        let mut builder = builder.no_proxy();
        for (https, url) in [(false, &self.http), (true, &self.https)] {
            if let Some(url) = url {
                let proxy = if https {
                    reqwest::Proxy::https(url.as_str())
                } else {
                    reqwest::Proxy::http(url.as_str())
                }
                .expect("validated proxy URL")
                .no_proxy(reqwest::NoProxy::from_string(&self.bypass));
                builder = builder.proxy(proxy);
            }
        }
        builder
    }

    #[cfg(any(target_os = "macos", windows))]
    async fn output(mut command: tokio::process::Command) -> Result<String> {
        let output = tokio::time::timeout(Duration::from_secs(3), command.output())
            .await
            .map_err(|_| "System proxy read timed out. Select a custom proxy or no proxy.")?
            .map_err(|_| "Cannot read the system proxy. Select a custom proxy or no proxy.")?;
        if !output.status.success() {
            return Err("Cannot read the system proxy. Select a custom proxy or no proxy.".into());
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }

    #[cfg(target_os = "macos")]
    async fn detect_macos(&mut self) -> Result<()> {
        let mut command = crate::command("/usr/sbin/scutil");
        command.arg("--proxy");
        let text = Self::output(command).await?;
        let mut depth = 0usize;
        let mut settings = std::collections::HashMap::new();
        for line in text.lines().map(str::trim) {
            if line.ends_with('{') {
                depth += 1;
            } else if line == "}" {
                depth = depth.saturating_sub(1);
            } else if depth == 1 {
                if let Some((key, value)) = line.split_once(" : ") {
                    settings.insert(key, value);
                }
            }
        }
        if ["ProxyAutoConfigEnable", "ProxyAutoDiscoveryEnable"]
            .iter()
            .any(|key| settings.get(key) == Some(&"1"))
        {
            return Err(
                "System PAC/WPAD is unsupported. Select a custom proxy or no proxy.".into(),
            );
        }
        for scheme in ["HTTP", "HTTPS"] {
            if settings.get(format!("{scheme}Enable").as_str()) != Some(&"1") {
                continue;
            }
            let host = settings
                .get(format!("{scheme}Proxy").as_str())
                .ok_or("System proxy address is missing")?;
            let port = settings
                .get(format!("{scheme}Port").as_str())
                .and_then(|p| p.parse::<u16>().ok())
                .filter(|p| *p > 0)
                .ok_or("Invalid system proxy port")?;
            let mut url = Url::parse("http://localhost").unwrap();
            if let Ok(ip) = host.parse::<std::net::IpAddr>() {
                url.set_ip_host(ip).map_err(|_| "Invalid system proxy IP")?;
            } else {
                url.set_host(Some(host))
                    .map_err(|_| "Invalid system proxy address")?;
            }
            url.set_port(Some(port))
                .map_err(|_| "Invalid system proxy port")?;
            if scheme == "HTTP" {
                self.http = Some(url);
            } else {
                self.https = Some(url);
            }
        }
        if self.http.is_none() && self.https.is_none() && settings.get("SOCKSEnable") == Some(&"1")
        {
            return Err(
                "SOCKS-only system proxies are unsupported. Specify an HTTP/HTTPS proxy.".into(),
            );
        }
        Ok(())
    }

    #[cfg(windows)]
    async fn detect_windows(&mut self) -> Result<()> {
        let mut command = crate::command("powershell.exe");
        command.args(["-NoProfile", "-NonInteractive", "-Command", r#"
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$p=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$c=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings\Connections' -ErrorAction SilentlyContinue
$f=$c.DefaultConnectionSettings
@{ enabled=($p.ProxyEnable -eq 1); server=[string]$p.ProxyServer; auto=([bool]$p.AutoConfigURL -or ($f.Length -gt 8 -and ($f[8] -band 12) -ne 0)) } | ConvertTo-Json -Compress
"#]);
        let text = Self::output(command).await?;
        let settings: Value = serde_json::from_str(text.trim_start_matches('\u{feff}'))
            .map_err(|_| "Cannot parse the Windows system proxy")?;
        if settings["auto"] == true {
            return Err(
                "System PAC/WPAD is unsupported. Select a custom proxy or no proxy.".into(),
            );
        }
        if settings["enabled"] != true {
            return Ok(());
        }
        let server = string(&settings, "server");
        for item in server.split(';').map(str::trim).filter(|v| !v.is_empty()) {
            let (scheme, address) = item.split_once('=').unwrap_or(("all", item));
            if !["all", "http", "https"].contains(&scheme) {
                continue;
            }
            let address = if address.contains("://") {
                address.to_owned()
            } else {
                format!("http://{address}")
            };
            let url = parse_url(&address)?;
            if scheme != "https" {
                self.http = Some(url.clone());
            }
            if scheme != "http" {
                self.https = Some(url);
            }
        }
        if self.http.is_none() && self.https.is_none() {
            return Err(
                "No HTTP/HTTPS system proxy is available. Configure a custom proxy.".into(),
            );
        }
        Ok(())
    }
}
