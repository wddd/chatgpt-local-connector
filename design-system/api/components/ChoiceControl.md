# Arc.ChoiceControl

A settings-only wrapper over [SingleChoice](SingleChoice.md), with the same props and option types. Requires [Arc.Root](Root.md).

## Behavior

Zero or one option renders a static value without a selector or tab stop. A matching option uses its readable label and optional graphic/icon; otherwise the recorded value remains visible. Missing values use an em dash. Constraints in option warnings remain visible. The component never auto-selects an option or calls onChange while rendering.

Two or more options delegate to SingleChoice, retaining pills/dropdown, keyboard navigation, disabled states and responsive measurement. SingleChoice itself remains available to workflows that require explicit selection even with one choice, such as Relay account recovery.

## Canvas example

```js
const renderVals = { options: [{ value: 'stable', label: 'Stable' }], change: () => {} };
```

```html
<x-import component-from-global-scope="Arc.ChoiceControl" label="Release channel" value="stable" options="{{options}}" on-change="{{change}}"></x-import>
```

Options and callbacks cross through template holes. Graphic slots remain plain text. Browser fixtures cover no options, one matching option, unlisted current values and multiple responsive choices.
