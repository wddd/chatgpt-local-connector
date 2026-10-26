import registry from '../shared/control-sources.json';

// Metadata never constrains the backend's open-ended controlSource string.
export const controlSources = registry;
export const curatedSources = controlSources.filter(source => source.curated);
export function controlSource(id: string) {
  return controlSources.find(source => source.id === id);
}
export function nextSourceName(id: string, names: string[]) {
  const base = controlSource(id)?.displayName || id;
  let name = base, suffix = 2;
  while (names.includes(name)) name = `${base} ${suffix++}`;
  return name;
}

export type RemoteProfile = "legacy" | "remote-push" | "remote-polling";
export type CapabilityProfile = { hostAccess: "host" | "none" | "unknown"; waitMode: "background-cli" | "push" | "poll" };
export function remoteProfileSetting(profile: RemoteProfile): CapabilityProfile | null {
  return profile === "legacy" ? null : { hostAccess: "none", waitMode: profile === "remote-push" ? "push" : "poll" };
}
export function remoteProfileName(profile?: CapabilityProfile | null): RemoteProfile {
  return !profile ? "legacy" : profile.waitMode === "push" ? "remote-push" : "remote-polling";
}
export function recommendedRemoteProfile(product: string): RemoteProfile {
  return ["claude", "chatgpt"].includes(product) ? "remote-push" : "remote-polling";
}
export const remoteProfiles: RemoteProfile[] = ["legacy", "remote-push", "remote-polling"];
