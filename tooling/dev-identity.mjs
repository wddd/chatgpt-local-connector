import { readFileSync } from 'node:fs';

export function developmentConfig(env = process.env) {
  const config = JSON.parse(readFileSync(new URL('../desktop/tauri.dev.conf.json', import.meta.url), 'utf8'));
  const instance = env.ARC_DEV_INSTANCE_ID;
  if (!instance) return config;
  if (!/^[a-z0-9]{8,32}$/.test(instance)) throw new Error('ARC_DEV_INSTANCE_ID must contain 8-32 lowercase letters or digits.');
  return { ...config, identifier: `${config.identifier}.acceptance-${instance}`, productName: `ARC Acceptance ${instance}` };
}

// Bundle identity survives supervisor rebuilds; PIDs are observations, not selectors.
export function isolatedStatus(identity, endpoint, desktop) {
  return {bundleId:identity.identifier,appName:identity.productName,desktopPid:desktop.pid,corePid:endpoint.pid,instance:endpoint.instance,
    desktopBuild:desktop.build,port:endpoint.port,screen:{action:'tree',bundleId:identity.identifier}};
}
