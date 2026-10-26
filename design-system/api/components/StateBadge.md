# Arc.StateBadge

Status shell driven by an explicit domain presentation; the shell does not infer business state.

Requires [Arc.Root](Root.md). Non-string props use named `{{ }}` holes from `renderVals`. All children and slots accept plain text only.

IconName is `RefreshCw`, `Plus`, `Check`, `X`, `Info`, `Plug` or `Bot`; component functions are not accepted.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `presentation` | `{ tone: "neutral" &#124; "accent" &#124; "success" &#124; "warning" &#124; "danger"; labelKey: string; icon: IconName }` | `required` | Serializable presentation; icon names resolve inside the island. |
| `label` | `string` | `translated labelKey` | Override the visible/accessibility label. |
| `variant` | `"badge" &#124; "dot" &#124; "compact" &#124; "text"` | `"badge"` | Badge, accessible dot, icon with text or text only. |
| `className` | `string` | `empty` | Applied by dot, compact and text variants; badge uses Status styling. |

## States

Five tones and four variants. Accent represents running work. Dot uses role img with the state label. Compact renders the named icon. Missing label uses this Root locale and labelKey.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  presentation: { tone: "success", labelKey: "connected", icon: "Check" },
};
```

```html
<x-import component-from-global-scope="Arc.StateBadge" presentation="{{presentation}}" label="Connected" variant="compact"></x-import>
```
