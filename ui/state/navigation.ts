import { createStore } from "./store";
export type Page = "overview" | "tasks" | "logs" | "remote" | "permissions" | "settings";
export const navigation = createStore<{
  settingsExtras?: boolean;
  remoteSourceId?: string;
  remoteConnectionId?: string;
  page?: Page;
  recordsSource?: string;
  providerId?: string;
  ingressEdit?: { id: string; field: string };
}>({});
