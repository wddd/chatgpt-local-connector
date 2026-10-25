import { t, type MessageKey } from "../i18n";

// Keep native evidence in the task data; present actionable notices in the panel.
export function taskErrorText(error: unknown, fallback: MessageKey = "requestFailedPleaseRetry"): string {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message
    : error && typeof error === "object" ? String((error as { message?: unknown; code?: unknown }).message || (error as { code?: unknown }).code || "") : "";
  if (/\bSOURCE_REVOKED\b/.test(message)) return t("detail.sourceRevoked");
  if (!message || /^(?:Error:\s*)?[A-Z][A-Z0-9_]+(?::.*)?$/.test(message)) return t(fallback);
  return message.replace(/^Error:\s*/, "");
}
