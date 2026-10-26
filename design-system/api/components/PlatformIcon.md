# Arc.PlatformIcon

Decorative platform branding from the application registry and retained assets.

Requires [Arc.Root](Root.md). Non-string props use named `{{ }}` holes from `renderVals`. All children and slots accept plain text only.

IconName is `RefreshCw`, `Plus`, `Check`, `X`, `Info`, `Plug` or `Bot`; component functions are not accepted.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `platform` | `string` | `required` | Platform key, such as claude, chatgpt, codex or dsh; not a provider record. |
| `role` | `"source" &#124; "agent" &#124; "provider"` | `required` | Select the source registry, Agent vectors or provider brand assets. |
| `size` | `number` | `optional` | Width and height in pixels; omitted uses the existing shell styles. |
| `add` | `boolean` | `false` | Show Plus instead of the platform brand. |
| `fallback` | `IconName` | `role-dependent` | Named Lucide fallback; defaults to Plug for sources and Bot otherwise. |
| `quotaRing` | `string` | `optional` | Plain-text trailing quota slot only; does not accept another island or a React element. |
| `panelVisual / monochrome` | `boolean` | `false` | Panel marker / mask image assets in the current text color. |
| `className` | `string` | `empty` | Additional class name. |

## States

Monochrome provider assets automatically use the current text color in both themes. Known source, Agent or provider brand; unknown key fallback; add; monochrome image. The icon is aria-hidden without quotaRing. Give the owning action an accessible name.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  platform: Arc.fixtures.sources[0].product,
  size: 24,
  add: false,
};
```

```html
<x-import component-from-global-scope="Arc.PlatformIcon" platform="{{platform}}" role="source" size="{{size}}" add="{{add}}" fallback="Plug"></x-import>
```
