import { createStore, preference } from "./store";
import { DEFAULTS, type ParameterKey } from "../topology/solve";
import { clampParameter, emptyParameters, importParameters, loadParameters, parameterDiff } from "../topology/parameters";

export const topologyTuningEnabled = preference("arc.topology-tuning", false, raw => JSON.parse(raw) === true);
export const topologyParameters = preference("arc.topology-parameters", emptyParameters(), raw => {
  const result = importParameters(raw);
  if (!result.ok) throw new Error(result.error);
  return result.document;
});
// Slider preview does not flood native preferences with in-flight writes.
export const topologyValues = createStore(loadParameters(topologyParameters.get()));
topologyParameters.subscribe(() => topologyValues.set(loadParameters(topologyParameters.get())));
export function previewParameter(key: ParameterKey, value: number) {
  const clamped = clampParameter(key, value);
  topologyValues.set(old => ({ ...old, [key]: clamped }));
  return !Number.isFinite(value) || clamped !== value;
}
export function saveTopologyParameters() {
  topologyParameters.set(parameterDiff(topologyValues.get()));
}
export function resetTopologyParameter(key?: ParameterKey) {
  topologyValues.set(key ? { ...topologyValues.get(), [key]: DEFAULTS[key] } : { ...DEFAULTS });
  saveTopologyParameters();
}
export const topologyDebug = createStore({ guides: false, slow: false });
export const topologyPanel = preference("arc.topology-panel", { x: 16, y: 48, collapsed: true }, raw => {
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("Invalid panel position");
  return { x: Number.isFinite(value.x) ? Math.max(0, value.x) : 16,
    y: Number.isFinite(value.y) ? Math.max(48, value.y) : 48, collapsed: value.collapsed !== false };
});
