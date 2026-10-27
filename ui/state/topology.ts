import { createStore, preference } from "./store";
import { emptyParameters, importParameters, loadParameters } from "../topology/parameters";

export const topologyParameters = preference("arc.topology-parameters", emptyParameters(), raw => {
  const input = JSON.parse(raw);
  const overrides = input?.schemaVersion === 1 && input.overrides && typeof input.overrides === "object" && !Array.isArray(input.overrides)
    ? input.overrides : null;
  const migrated = overrides && (Object.hasOwn(overrides, "pitch") || Object.hasOwn(overrides, "bubbleWeight"));
  if (overrides && Object.hasOwn(overrides, "pitch")) {
    if (typeof overrides.pitch !== "number" || !Number.isFinite(overrides.pitch)) throw new Error("Invalid task pitch");
    if (!Object.hasOwn(overrides, "taskGap")) overrides.taskGap = Math.max(0, overrides.pitch - 54);
    delete overrides.pitch;
  }
  if (overrides) delete overrides.bubbleWeight;
  const result = importParameters(JSON.stringify(input));
  if (!result.ok) throw new Error(result.error);
  if (migrated) queueMicrotask(() => {
    if (topologyParameters.get() !== result.document) return;
    try {
      // Replace the cache so the preference store also writes the migrated document to Core.
      localStorage.removeItem("arc.topology-parameters");
      topologyParameters.set({ ...result.document });
    } catch {
      // The parsed preferences remain usable when browser storage is unavailable.
    }
  });
  return result.document;
});
export const topologyValues = createStore(loadParameters(topologyParameters.get()));
topologyParameters.subscribe(() => topologyValues.set(loadParameters(topologyParameters.get())));
// Diagnostic overlays remain configurable through instance preferences.
export const topologyDebug = preference("arc.topology-debug", { guides: false, slow: false }, raw => {
  const value = JSON.parse(raw);
  return { guides: value?.guides === true, slow: value?.slow === true };
});
