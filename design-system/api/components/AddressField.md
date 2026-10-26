# Arc.AddressField

Read-only address display with controlled reveal and copy callbacks. The copy button passes the raw value to the owner callback. Native selection-copy retains the raw value.

Requires [Arc.Root](Root.md). Non-string props use named `{{ }}` holes from `renderVals`. All children and slots accept plain text only.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `label` | `string` | `required` | Accessible read-only textbox label. |
| `value` | `string` | `required` | Raw address passed to onCopy and native copy capture. |
| `display` | `string` | `required` | Plain-text visible or masked address; the owner supplies masking. |
| `revealed / copied` | `boolean` | `false` | Reveal icon state / copied feedback. |
| `onReveal` | `() => void` | `optional` | Show reveal control; owner updates revealed and display. |
| `onCopy` | `(raw: string) => void` | `required` | Owner handles the copy button and copied state. |
| `loading / disabled` | `boolean` | `false` | Loading replaces actions; disabled prevents copying and revealing. |
| `error` | `string` | `optional` | Alert text below the field. |
| `placeholder` | `string` | `empty` | Visible when value is empty. |

## States

Visible/masked display, revealed, copied, loading, disabled, empty and error. Empty values disable actions. Native selection-copy captures the raw value only when enabled and not loading.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  value: "https://example.com",
  display: "••••",
  copy: raw => {},
  reveal: () => {},
  revealed: false,
};
```

```html
<x-import component-from-global-scope="Arc.AddressField" label="Provider address" value="{{value}}" display="{{display}}" on-copy="{{copy}}" on-reveal="{{reveal}}" revealed="{{revealed}}"></x-import>
```
