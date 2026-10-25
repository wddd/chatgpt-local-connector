import { preference, createStore } from './store';
import { scenarioName } from '../scenarioMode';
export const privacy = preference('arc.privacy', true);
const capturePrivacy = createStore(!!scenarioName);
export function protectSnapshot() { capturePrivacy.set(true); }
export function usePrivacy() {
  const preferenceValue = privacy.use(), captureValue = capturePrivacy.use();
  return preferenceValue || captureValue;
}
export function setPrivacy(value: boolean) { capturePrivacy.set(false); privacy.set(value); }
