import { useEffect, useState } from "react";
import { api } from "../api";
import { isTaskId } from "./taskProjection";

export interface TaskReview { verdict: "pass" | "rework"; requestId: string; reviewedAt: string; reviewer?: { controlSource?: string }; }

export function useTaskReview(id: string, turnId: string | undefined, enabled: boolean) {
  const [review, setReview] = useState<TaskReview>(), [reviewError, setReviewError] = useState("");
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    setReview(undefined); setReviewError("");
    if (!turnId || !enabled || !isTaskId(id)) return;
    const read = async () => {
      try {
        const response = await api<{ reviews: { turnId: string; review: TaskReview }[] }>("tasks/reviews", "POST", { id });
        if (!stopped) { setReview(response.reviews.find(row => row.turnId === turnId)?.review); setReviewError(""); }
      } catch (error) { if (!stopped) setReviewError(String(error)); }
      if (!stopped) timer = setTimeout(read, 3000);
    };
    void read();
    return () => { stopped = true; clearTimeout(timer); };
  }, [id, turnId, enabled]);
  return { review, reviewError };
}
