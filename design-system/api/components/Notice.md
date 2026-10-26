# Arc.Notice

The existing privacy-aware Notice.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `children` | `string` | `required` | Message; sensitive substrings are masked when Root.privacy is true. |
| `tone` | `"danger" &#124; "warning" &#124; "success"` | `"danger"` | Danger uses alert; other tones use status. |
| `action` | `string` | `optional` | Plain text trailing slot only. |

## States

Danger, warning, success and masked/unmasked text.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  email: Arc.fixtures.accounts[0].email,
};
```

```html
<x-import component-from-global-scope="Arc.Notice" tone="warning">{{email}}</x-import>
```
