import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Accordion } from "radix-ui";
import { ChevronDown, ChevronUp, Grip, RotateCcw } from "lucide-react";
import { locale, t } from "../i18n";
import { copyText } from "../platform";
import { Button, Field, Icon, IconButton, Input, Slider, Switch, Textarea } from "../components/ui";
import { PARAMETERS, PARAMETER_GROUPS } from "./solve";
import { importParameters, parameterDiff } from "./parameters";
import { topologyPanel, topologyParameters, topologyValues, topologyDebug, previewParameter, saveTopologyParameters, resetTopologyParameter } from "../state/topology";

function TuningSection({ value, title, className, children }: { value: string; title: string; className: string; children: ReactNode }) {
  return <Accordion.Item value={value} className={className}>
    <Accordion.Header className="topology-section-heading">
      <Accordion.Trigger asChild><Button variant="ghost" className="topology-section-trigger">
        <span>{title}</span><Icon icon={ChevronDown} size={16} />
      </Button></Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content className="topology-section-content"><div className="topology-section-inner">{children}</div></Accordion.Content>
  </Accordion.Item>;
}

function ParameterControl({ spec, value }: { spec: typeof PARAMETERS[number]; value: number }) {
  const lang = locale.use(), label = "labelKey" in spec ? t(spec.labelKey) : spec.label[lang], changed = value !== spec.default;
  const [text, setText] = useState(String(value)), [notice, setNotice] = useState("");
  useEffect(() => setText(String(value)), [value]);
  function apply() {
    const number = text.trim() ? Number(text) : NaN;
    const adjusted = previewParameter(spec.key, number);
    saveTopologyParameters(); setText(String(topologyValues.get()[spec.key]));
    setNotice(adjusted ? t("topology.adjusted", { label, min: spec.min, max: spec.max, value: topologyValues.get()[spec.key] }) : "");
  }
  return <Field id={`topology-${spec.key}`} label={<span>{label}{changed && <span className="topology-custom" aria-label={t("topology.custom")}> •</span>}</span>}>
    <div className="topology-parameter" title={t("topology.defaultValue", { value: spec.default })}>
      <Slider label={label} min={spec.min} max={spec.max} step={spec.step} value={value}
        onChange={number => { previewParameter(spec.key, number); setNotice(""); }}
        onCommit={number => { previewParameter(spec.key, number); saveTopologyParameters(); }} />
      <Input id={`topology-${spec.key}`} inputMode="decimal" value={text} aria-label={t("topology.valueLabel", { label })}
        onChange={event => setText(event.target.value)} onBlur={apply}
        onKeyDown={event => {
          if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === "Escape") { setText(String(value)); event.stopPropagation(); }
        }} />
      <IconButton icon={RotateCcw} label={t("topology.resetOne", { label })} size={16} disabled={!changed}
        onClick={() => { resetTopologyParameter(spec.key); setNotice(""); }} />
    </div>
    {notice && <p role="status" className="topology-tuner-hint">{notice}</p>}
  </Field>;
}

export default function TuningPanel() {
  const lang = locale.use(), values = topologyValues.use(), stored = topologyPanel.use(), debug = topologyDebug.use();
  const element = useRef<HTMLElement>(null), position = useRef({ x: stored.x, y: stored.y });
  const drag = useRef<{ id: number; x: number; y: number; start: { x: number; y: number }; width: number; height: number } | null>(null);
  const [message, setMessage] = useState(""), [json, setJson] = useState(""), [importError, setImportError] = useState("");
  const collapsed = stored.collapsed;
  function place(x: number, y: number, width = element.current?.offsetWidth ?? 0, height = element.current?.offsetHeight ?? 0) {
    position.current = { x: Math.max(8, Math.min(Math.max(8, innerWidth - width - 8), x)),
      y: Math.max(48, Math.min(Math.max(48, innerHeight - height - 8), y)) };
    if (element.current) element.current.style.transform = `translate(${position.current.x}px, ${position.current.y}px)`;
  }
  const savePosition = () => topologyPanel.set({ ...position.current, collapsed });
  useLayoutEffect(() => {
    place(stored.x, stored.y);
    const resize = () => place(position.current.x, position.current.y);
    const observer = new ResizeObserver(resize);
    if (element.current) observer.observe(element.current);
    window.addEventListener("resize", resize);
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); };
  }, [stored.x, stored.y, collapsed]);
  useEffect(() => () => saveTopologyParameters(), []);
  function endDrag(event: PointerEvent, cancel = false) {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (cancel) place(d.start.x, d.start.y);
    savePosition();
    if (event.currentTarget.hasPointerCapture(d.id)) event.currentTarget.releasePointerCapture(d.id);
  }
  return <aside ref={element} className="topology-tuner" data-collapsed={collapsed || undefined} aria-label={t("topology.tuning")}>
    <header>
      <IconButton icon={Grip} label={t("topology.move")} size={16} aria-description={t("topology.moveHint")}
        onPointerDown={event => {
          if (event.button !== 0 || !event.isPrimary) return;
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { ...position.current },
            width: element.current!.offsetWidth, height: element.current!.offsetHeight };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => { const d = drag.current; if (d && d.id === event.pointerId) {
          place(d.start.x + event.clientX - d.x, d.start.y + event.clientY - d.y, d.width, d.height); event.preventDefault();
        } }} onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)} onLostPointerCapture={event => endDrag(event, true)}
        onKeyDown={event => {
          const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          const direction = delta[event.key];
          if (direction) { event.preventDefault(); place(position.current.x + direction[0] * (event.shiftKey ? 32 : 8), position.current.y + direction[1] * (event.shiftKey ? 32 : 8)); savePosition(); }
          if (event.key === "Escape" && drag.current) { const d = drag.current; drag.current = null; place(d.start.x, d.start.y); savePosition(); event.currentTarget.releasePointerCapture(d.id); }
        }} />
      <strong>{t("topology.tuning")}</strong>
      <IconButton icon={collapsed ? ChevronDown : ChevronUp} label={t(collapsed ? "topology.expand" : "topology.collapse")} size={16}
        aria-expanded={!collapsed} aria-controls="topology-tuner-body" onClick={() => topologyPanel.set({ ...position.current, collapsed: !collapsed })} />
    </header>
    {!collapsed && <div className="topology-tuner-body" id="topology-tuner-body">
      <div className="topology-tuner-option"><span>{t("topology.guides")}</span><Switch label={t("topology.guides")} checked={debug.guides} onChange={guides => topologyDebug.set(old => ({ ...old, guides }))} /></div>
      <div className="topology-tuner-option"><span>{t("topology.slow")}</span><Switch label={t("topology.slow")} checked={debug.slow} onChange={slow => topologyDebug.set(old => ({ ...old, slow }))} /></div>
      {debug.guides && <p className="topology-tuner-hint">{t("topology.guideHint")}</p>}
      <div className="topology-tuner-actions">
        <Button onClick={() => { resetTopologyParameter(); setMessage(t("topology.resetDone")); }}>{t("topology.resetAll")}</Button>
        <Button onClick={() => { void copyText(JSON.stringify(parameterDiff(topologyValues.get()), null, 2)).then(() => setMessage(t("topology.copied")), () => setMessage(t("topology.copyFailed"))); }}>{t("topology.export")}</Button>
      </div>
      <div role="status" className="topology-tuner-status">{message}</div>
      <Accordion.Root type="multiple" defaultValue={Object.keys(PARAMETER_GROUPS)}>
        <TuningSection value="import" title={t("topology.import")} className="topology-import">
          <form noValidate onSubmit={event => {
            event.preventDefault(); const result = importParameters(json);
            if (!result.ok) { setImportError(t(`topology.importError.${result.error}`)); element.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus(); return; }
            topologyParameters.set(result.document); setImportError("");
            setMessage(result.clamped.length ? t("topology.importClamped", { labels: result.clamped.map(key => {
              const spec = PARAMETERS.find(p => p.key === key)!;
              return "labelKey" in spec ? t(spec.labelKey) : spec.label[lang];
            }).join(", ") }) : t("topology.imported"));
          }}>
            <Field id="topology-import" label={t("topology.paste")} error={importError}>
              <Textarea id="topology-import" rows={4} value={json} spellCheck={false} aria-invalid={!!importError}
                aria-describedby={importError ? "topology-import-error" : undefined} onChange={event => { setJson(event.target.value); setImportError(""); }} />
            </Field>
            <Button type="submit">{t("topology.applyImport")}</Button>
          </form>
        </TuningSection>
        {Object.entries(PARAMETER_GROUPS).map(([group, label]) => <TuningSection value={group} title={label[lang]} className="topology-parameter-group" key={group}>
          {PARAMETERS.filter(p => p.group === group).map(spec => <ParameterControl key={spec.key} spec={spec} value={values[spec.key]} />)}
        </TuningSection>)}
      </Accordion.Root>
    </div>}
  </aside>;
}
