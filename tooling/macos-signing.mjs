// Never let the bundler select an identity from the keychain automatically.
// A Developer ID must be explicitly selected by its complete certificate name.
export function macosSigningIdentity(env, enabled = true) {
  const identity = enabled && process.platform === 'darwin' ? env.APPLE_SIGNING_IDENTITY?.trim() : undefined;
  if (!identity || identity === '-') {
    for (const key of Object.keys(env)) if (key.startsWith('APPLE_')) delete env[key];
    return '-';
  }
  if (!/^Developer ID Application: .+ \([A-Z0-9]{10}\)$/.test(identity)) {
    throw new Error('APPLE_SIGNING_IDENTITY 必须是个人团队的完整 Developer ID Application 证书名称；不接受 Apple Development、通配符或自动选择。详见 docs/release.md。');
  }
  env.APPLE_SIGNING_IDENTITY = identity;
  return identity;
}
