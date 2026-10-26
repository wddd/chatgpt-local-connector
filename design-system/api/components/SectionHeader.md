# Arc.SectionHeader

Heading hierarchy with plain-text leading, navigation, action and secondary slots.

Requires [Arc.Root](Root.md). Non-string props use named `{{ }}` holes from `renderVals`. All children and slots accept plain text only.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | `required` | Heading text. |
| `level` | `1 &#124; 2 &#124; 3 &#124; 4` | `required` | Semantic heading level. |
| `count` | `number` | `optional` | Count appended to the title, including zero. |
| `leading / actions / back / close / widthControl / secondary / titleActions / children` | `string` | `optional` | Plain-text slots; no nested controls or React elements. |
| `titleProps` | `heading HTML attributes` | `optional` | No children, ref or dangerouslySetInnerHTML. |
| `titleAsChild` | `false` | `false` | Element composition is unavailable across React versions. |
| `className / HTML attributes` | `standard header attributes and callbacks` | `optional` | Attributes and callbacks pass to the header; no refs or HTML injection. |

## States

Heading levels, count including zero, optional leading/actions/secondary text. Rich titleAsChild composition is excluded.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  level: 2,
  count: 2,
  titleProps: { id: "providers-title" },
};
```

```html
<x-import component-from-global-scope="Arc.SectionHeader" title="Providers" level="{{level}}" count="{{count}}" title-props="{{titleProps}}" secondary="Quota" actions="Refresh"></x-import>
```
