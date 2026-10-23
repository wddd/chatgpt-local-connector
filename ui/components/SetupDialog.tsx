import type { ReactNode } from "react";
import { t } from "../i18n";
import { Dialog } from "./ui";

export type SetupStep = { label: string; value?: string };
export default function SetupDialog({ title, steps, active, done, stacked, parentTitle, busy, onClose, footer, children, initialFocus }: {
  title: string; steps: SetupStep[]; active: number; done?: boolean; stacked?: boolean; parentTitle?: string;
  busy?: boolean; onClose: () => void; footer?: ReactNode; children: ReactNode; initialFocus?: string;
}) {
  return <Dialog centered title={title} width={stacked ? 520 : 560} busy={busy} onClose={onClose} initialFocus={initialFocus} returnFocus=".hub-source"
    headerDetail={stacked && <p className="setup-return">{t("setup.returns", { name: parentTitle ?? t("addControlSource") })}</p>}
    stepBar={<ol className="setup-steps" aria-label={title} data-done={done || undefined}>{steps.map((step, index) => <li key={index}
      data-complete={index < active || done || undefined} aria-current={index === active && !done ? "step" : undefined}>
      <span>{step.label}{index < active && step.value ? ` · ${step.value}` : ""}</span>
    </li>)}</ol>} footer={footer}>{children}</Dialog>;
}
