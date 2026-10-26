import { useSyncExternalStore } from 'react';

// Design runtimes own memory only. Never read or persist application preferences.
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const get = () => value;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  return { get, subscribe, set(next: T | ((previous: T) => T)) {
    const updated = typeof next === 'function' ? (next as (previous: T) => T)(value) : next;
    if (Object.is(updated, value)) return;
    value = updated;
    listeners.forEach(listener => listener());
  }, use: () => useSyncExternalStore(subscribe, get, get) };
}
export function preference<T>(_key: string, fallback: T, _parse?: (raw: string) => T, _serialize?: (value: T) => string) {
  return createStore(fallback);
}
