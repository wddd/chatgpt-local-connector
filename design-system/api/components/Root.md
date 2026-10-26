# Arc.Root

Artboard provider. This is the only export that accepts host React children.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `mode` | `"light" &#124; "dark"` | `"light"` | Theme scoped to this Root. |
| `locale` | `"en" &#124; "zh-CN"` | `"en"` | Component translations; fixture text remains original. |
| `privacy` | `boolean` | `false` | Use existing sensitive-text masking with synthetic account/source values. |
| `now` | `number` | `Arc.fixtures.now` | Fixed epoch milliseconds. Must be finite. |
| `children` | `ReactNode` | `optional` | Host markup and nested x-import mounts. |

## States

Independent light/dark, English/Chinese and visible/masked artboards. Prop updates propagate to existing islands. Unmount cleans up their roots. Invalid environment values throw an actionable error.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  privacy: true,
  now: Arc.fixtures.now,
};
```

```html
<x-import component-from-global-scope="Arc.Root" mode="dark" locale="zh-CN" privacy="{{privacy}}" now="{{now}}">
  <x-import component-from-global-scope="Arc.Loading"></x-import>
</x-import>
```
