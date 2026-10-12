// Never let the bundler select an identity from the keychain automatically.
function isDeveloperId(identity) {
  return /^Developer ID Application: .+ \([A-Z0-9]{10}\)$/.test(identity);
}

export function macosSigningIdentity(env) {
  const identity = process.platform === 'darwin' ? env.APPLE_SIGNING_IDENTITY?.trim() : undefined;
  if (!identity || identity === '-' || !isDeveloperId(identity)) {
    for (const key of Object.keys(env)) if (key.startsWith('APPLE_')) delete env[key];
  }
  if (!identity || identity === '-') return '-';
  env.APPLE_SIGNING_IDENTITY = identity;
  return identity;
}

export function macosSigningArgs(identity, identifier, hardenedRuntime = true) {
  return [
    '--force', '--sign', identity, '--identifier', identifier,
    ...(identity !== '-' && hardenedRuntime ? ['--options', 'runtime'] : []),
    ...(isDeveloperId(identity) ? ['--timestamp'] : []),
  ];
}
