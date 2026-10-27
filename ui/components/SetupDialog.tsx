import type { ReactNode } from "react";
import { Dialog } from "./ui";

export type SetupStep = { label: string; value?: string };
export default function SetupDialog({ title, steps, active, done, busy, onClose, footer, children, initialFocus, returnFocus }: {
  title: string; steps: SetupStep[]; active: number; done?: boolean;
  busy?: boolean; onClose: () => void | Promise<void>; footer?: ReactNode; children: ReactNode; initialFocus?: string; returnFocus?: string;
}) {
  return <Dialog centered title={title} busy={busy} onClose={onClose} initialFocus={initialFocus} returnFocus={returnFocus ?? ".hub-source"}
    stepBar={<ol className="setup-steps mx-5 mt-3 flex shrink-0 list-none gap-2 p-0" aria-label={title} data-done={done || undefined}>{steps.map((step, index) => <li key={index} className="flex min-w-0 flex-1 flex-col gap-2 text-xs text-muted-foreground aria-[current=step]:font-semibold aria-[current=step]:text-foreground"
      data-complete={index < active || done || undefined} aria-current={index === active && !done ? "step" : undefined}>
      <span aria-hidden="true" className={`h-1 rounded-full ${done ? "bg-success" : index <= active ? "bg-foreground" : "bg-border"}`} /><span className="wrap-anywhere">{step.label}{index < active && step.value ? ` · ${step.value}` : ""}</span>
    </li>)}</ol>} footer={footer}>{children}</Dialog>;
}
