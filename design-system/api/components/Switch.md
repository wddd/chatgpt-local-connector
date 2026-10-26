# Arc.Switch

The existing Radix-backed controlled Switch.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `checked` | `boolean` | `required` | Current value. |
| `onChange` | `(value: boolean) => void` | `required` | Owner must update checked. |
| `label` | `string` | `required` | Accessible name. |
| `disabled` | `boolean` | `false` | Prevents changes. |
| `id` | `string` | `optional` | DOM identifier. |

## States

On, off, disabled, keyboard focus. Space changes the value through onChange.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  label: Arc.fixtures.agents[0].agent,
  checked: true,
  change: value => {},
};
```

```html
<x-import component-from-global-scope="Arc.Switch" label="{{label}}" checked="{{checked}}" on-change="{{change}}"></x-import>
```
