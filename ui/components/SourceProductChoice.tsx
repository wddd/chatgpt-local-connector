import { useState } from "react";
import { controlSource, controlSources } from "../controlSources";
import { t } from "../i18n";
import { SingleChoice } from "./ui";
const common = ["claude", "chatgpt", "gemini", "grok"];
export default function SourceProductChoice({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [more, setMore] = useState(false);
  const overflow = more || !common.includes(value);
  return <div className="source-product-choice">
    <SingleChoice label={t("source.product")} value={overflow ? "more" : value} disabled={disabled} onChange={next => {
      setMore(next === "more"); if (next !== "more") onChange(next);
    }} options={[...common.map(id => ({ value: id, label: controlSource(id)!.shortName })), { value: "more", label: t("source.moreProducts") }]} />
    {overflow && <SingleChoice label={t("source.moreProducts")} value={value} disabled={disabled} onChange={onChange}
      options={[...controlSources, ...(!controlSource(value) ? [{ id: value, shortName: value }] : [])].map(s => ({ value: s.id, label: s.id === "custom" ? t("connect.other") : s.shortName }))} />}
  </div>;
}
