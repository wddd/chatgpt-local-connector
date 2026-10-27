import { createStore } from "./store";
export type Page = "overview" | "logs" | "connections" | "settings";
export function resolvePage(value: string | null | undefined): Page {
  if (value === "remote") return "connections";
  if (value === "permissions") return "settings";
  return value === "logs" || value === "connections" || value === "settings" ? value : "overview";
}
export const navigation = createStore<{
  settingsUpdates?: boolean;
  settingsPermissions?: boolean;
  page?: Page;
  recordsSource?: string;
  providerId?: string;
}>({});
