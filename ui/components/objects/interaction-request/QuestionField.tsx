import { useId } from 'react';
import { t } from '../../../i18n';
import type { Question } from '../../../state/taskInteractions';
import { Checkbox, Field, Input, SingleChoice } from '../../ui';
export function QuestionField({ question, value, onChange, disabled }: { question: Question; value: string[]; onChange: (value: string[]) => void; disabled: boolean }) {
  const id = useId();
  const other = value.find(answer => !question.options.some(option => option.label === answer)) ?? "";
  const custom = !!other;
  const pick = (label: string) => {
    if (disabled) return;
    onChange(question.multiple ? value.includes(label) ? value.filter(v => v !== label) : [...value, label] : [label]);
  };
  return <fieldset className="task-question-field" disabled={disabled} onKeyDown={event => {
    if ((event.target as HTMLElement).closest("input,textarea") || event.altKey || event.metaKey || event.ctrlKey) return;
    const option = question.options[Number(event.key) - 1];
    if (option) { event.preventDefault(); pick(option.label); }
  }}><legend>{question.text}</legend>
    {question.multiple ? question.options.map((option, index) => <div className="task-multi-option" key={option.label}><Checkbox checked={value.includes(option.label)} onChange={() => pick(option.label)} disabled={disabled}>{option.label}</Checkbox>{option.description && <small>{option.description}</small>}<kbd>{index + 1}</kbd></div>)
      : !!question.options.length && <SingleChoice cards label={question.text} value={custom ? "" : value[0] ?? ""} onChange={pick} disabled={disabled} options={question.options.map((option, index) => ({ value: option.label, label: option.label, description: option.description, graphic: <kbd>{index + 1}</kbd> }))} />}
    {(question.other || !question.options.length) && <Field id={id} label={t(question.options.length ? "detail.other" : "timeline.answer")}><Input id={id} type={question.secret ? "password" : "text"} value={other} onFocus={() => { if (!question.multiple) onChange(other ? [other] : []); }} onChange={event => onChange([...(question.multiple ? value.filter(answer => question.options.some(option => option.label === answer)) : []), event.target.value])} disabled={disabled} /></Field>}
  </fieldset>;
}
