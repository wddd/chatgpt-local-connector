import { useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { createStore } from "./store";
import { refreshTasks } from "./tasks";
export interface TaskReview { verdict: "pass" | "rework"; requestId: string; reviewedAt: string; reviewer?: { controlSource?: string }; }
import { taskControlPayload, type TaskIntent } from "./taskControlModel";
export interface TaskReceipt { state?: string; result?: unknown; error?: unknown; requestId?: string; }
interface Operation { intent: TaskIntent; requestId: string; busy: boolean; receipt?: TaskReceipt; error?: string; }
const operations = createStore<Record<string, Operation>>({});
export function useTaskControl(agent: string, id: string, turnId: string | undefined, status: string | undefined, enabled = true) {
  const key = JSON.stringify([agent, id, turnId]);
  const all = operations.use(), operation = all[key];
  const [review, setReview] = useState<TaskReview>(), [reviewError, setReviewError] = useState("");
  const [undoBusy, setUndoBusy] = useState(false);
  const reloadReview = async () => {
    const response = await api<{ reviews: { turnId: string; review: TaskReview }[] }>("tasks/reviews", "POST", { id });
    setReview(response.reviews.find(row => row.turnId === turnId)?.review);
    setReviewError("");
  };
  useEffect(() => {
    let cancelled = false;
    setReview(undefined); setReviewError("");
    if (turnId && enabled) void api<{ reviews: { turnId: string; review: TaskReview }[] }>("tasks/reviews", "POST", { id }).then(response => {
      if (!cancelled) setReview(response.reviews.find(row => row.turnId === turnId)?.review);
    }).catch(error => { if (!cancelled) setReviewError(String(error)); });
    return () => { cancelled = true; };
  }, [id, turnId, status, enabled]);
  const outstanding = !!operation && (operation.busy || !operation.receipt || ["pending", "running", "reserved", "unconfirmed", "awaiting-approval"].includes(operation.receipt.state ?? ""));
  const perform = async (intent: TaskIntent, args: Record<string, unknown> = {}) => {
    const current = operations.get()[key];
    if (current && (current.busy || !current.receipt || ["pending", "running", "reserved", "unconfirmed", "awaiting-approval"].includes(current.receipt.state ?? ""))) return false;
    const requestId = crypto.randomUUID();
    operations.set(old => ({ ...old, [key]: { intent, requestId, busy: true } }));
    try {
      const receipt = await api<TaskReceipt>("tasks/control", "POST", taskControlPayload(agent, id, turnId, intent, args, requestId));
      operations.set(old => ({ ...old, [key]: { intent, requestId, busy: false, receipt } }));
      await refreshTasks();
      if (intent === "review" && receipt.state === "completed") await reloadReview();
      return receipt.state === "completed";
    } catch (error) {
      operations.set(old => ({ ...old, [key]: { ...old[key], busy: false, error: String(error) } }));
      return false;
    }
  };
  const check = async () => {
    if (!operation || operation.busy) return;
    operations.set(old => ({ ...old, [key]: { ...old[key], busy: true } }));
    try {
      const receipt = await api<TaskReceipt>("tasks/control", "POST", { op: "receipt", args: { requestId: operation.requestId, action: "read" } });
      operations.set(old => ({ ...old, [key]: { ...old[key], busy: false, error: undefined, receipt } }));
      if (operation.intent === "review" && receipt.state === "completed") await reloadReview();
      await refreshTasks();
    } catch (error) { operations.set(old => ({ ...old, [key]: { ...old[key], busy: false, error: String(error) } })); }
  };
  const undo = async () => {
    if (!review || undoBusy) return;
    setUndoBusy(true); setReviewError("");
    try {
      await api("tasks/control", "POST", { op: "task_review_undo", args: { id, turnId, reviewRequestId: review.requestId } });
      await reloadReview();
    } catch (error) { setReviewError(String(error)); } finally { setUndoBusy(false); }
  };
  const receiptError = operation?.receipt?.error;
  const feedback = operation?.error || (receiptError ? typeof receiptError === "string" ? receiptError : JSON.stringify(receiptError) : "");
  return { review, reviewError, operation, outstanding, busy: !!operation?.busy || undoBusy, perform, check, undo,
    feedback: feedback || (outstanding ? t(operation?.receipt?.state === "unconfirmed" ? "activity.unconfirmed" : "detail.pendingOperation") : "") };
}
export type TaskControl = ReturnType<typeof useTaskControl>;
