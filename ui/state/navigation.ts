import { createStore } from "./store";
export type Page = "overview" | "tasks" | "logs" | "connections" | "settings";
export const navigation = createStore<{
  settingsExtras?: boolean;
  settingsUpdates?: boolean;
  remoteSourceId?: string;
  remoteConnectionId?: string;
  page?: Page | "remote" | "accounts" | "permissions";
  settingsPermissions?: boolean;
  recordsSource?: string;
  providerId?: string;
  ingressEdit?: { id: string; field: string };
}>({});

export function canonicalPage(page?: string | null): Page {
  if (page === "remote") return "connections";
  if (page === "permissions") return "settings";
  return ["tasks", "logs", "connections", "settings"].includes(page ?? "") ? page as Page : "overview";
}
