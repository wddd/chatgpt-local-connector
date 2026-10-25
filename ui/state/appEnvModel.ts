export interface EnvOverrides {
  reducedMotion?: boolean | null; colorScheme?: "light" | "dark" | null;
  locale?: "en" | "zh-CN" | null; windowWidth?: number | null; taskPanelWidth?: number | null;
  presence?: "present" | "absent" | null;
}
export interface EnvSample {
  active: boolean; expiresAt: number | null; realNowMs: number;
  overrides: EnvOverrides;
  clock: { value: { nowMs: number; speed: number }; source: "system" | "override" };
}
export function activeOverrides(sample: EnvSample | undefined, real: number): EnvOverrides {
  return sample?.active && sample.expiresAt !== null && real < sample.expiresAt ? sample.overrides : {};
}
export function clockNow(sample: EnvSample | undefined, real: number): number {
  return sample?.clock.source === "override" && sample.expiresAt !== null && real < sample.expiresAt
    ? sample.clock.value.nowMs + Math.max(0, real - sample.realNowMs) * sample.clock.value.speed : real;
}
export function environmentModel(sample: EnvSample | undefined, real: number, system: {
  reducedMotion: boolean; colorScheme: string; locale: string; windowWidth: number;
  taskPanelWidth: number | null; presence: boolean;
}) {
  const overrides = activeOverrides(sample, real);
  const field = <T>(value: T | null | undefined, fallback: T) => ({ value: value ?? fallback, source: value == null ? "system" as const : "override" as const });
  const active = !!sample?.active && sample.expiresAt !== null && real < sample.expiresAt;
  return {
    active, expiresAt: active ? sample!.expiresAt : null,
    reducedMotion: field(overrides.reducedMotion, system.reducedMotion),
    colorScheme: field(overrides.colorScheme, system.colorScheme),
    locale: field(overrides.locale, system.locale),
    windowWidth: { ...field(overrides.windowWidth, system.windowWidth), value: system.windowWidth, requested: overrides.windowWidth ?? null },
    taskPanelWidth: { ...field(overrides.taskPanelWidth, system.taskPanelWidth), value: system.taskPanelWidth, requested: overrides.taskPanelWidth ?? null },
    presence: field(overrides.presence === null || overrides.presence === undefined ? null : overrides.presence === "present", system.presence),
    clock: { value: { nowMs: clockNow(sample, real), speed: active && sample?.clock.source === "override" ? sample.clock.value.speed : 1 }, source: active ? sample!.clock.source : "system" as const },
  };
}
