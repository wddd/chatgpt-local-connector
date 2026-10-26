# Arc.SingleChoice

The responsive single-choice control. Width and option count select pills or dropdown. Use [ChoiceControl](ChoiceControl.md) for settings that render zero or one option as a static value.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `value` | `string` | `required` | Selected option value. |
| `onChange` | `(value: string) => void` | `required` | Owner must update value. |
| `options` | `readonly Choice[]` | `required` | Choice fields below. |
| `label` | `string` | `required` | Accessible group/dropdown name. |
| `disabled` | `boolean` | `false` | Disables selection. |
| `swatches / compact / cards / navigation / tiles` | `boolean` | `false` | Existing renderer layout flags; use one presentation family at a time. |

`Choice` is `{ value: string; label: string; icon?: IconName; graphic?: string; color?: string; description?: string; warning?: string; disabled?: boolean }`. IconName is `RefreshCw`, `Plus`, `Check`, `X`, `Info`, `Plug` or `Bot`. Rich React graphics are not accepted across versions.

## States

Selected/unselected, disabled options, disabled control, keyboard focus, narrow dropdown and wide pills. More than five options uses a dropdown unless an explicit layout flag selects another presentation.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  choices: Arc.fixtures.choices,
  change: value => {},
};
```

```html
<x-import component-from-global-scope="Arc.SingleChoice" label="Agent" value="claude" options="{{choices}}" on-change="{{change}}"></x-import>
```
