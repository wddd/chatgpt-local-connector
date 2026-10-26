# Arc.EntityRow

Entity summary rendered as a static row, action button or navigation link. Independent actions remain outside the navigation target.

Requires [Arc.Root](Root.md). Non-string props use named `{{ }}` holes from `renderVals`. All children and slots accept plain text only.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `leading / title / secondary / state / actions / children` | `string` | `optional` | Plain-text slots. children replaces the title/secondary copy. |
| `chevron / selected / disabled` | `boolean` | `false` | Navigation cue, aria-current selection and disabled navigation/action. |
| `href` | `string` | `optional` | Use a link; disabled links have no href. |
| `onClick` | `(event) => void` | `optional` | Use a button when href is absent; also runs for enabled links. |
| `className / HTML attributes` | `standard attributes and callbacks` | `optional` | Pass through to the target; no refs or HTML injection. |

## States

Static, action, link, selected, disabled and chevron. Plain-text actions are sibling content; interactive React controls cannot cross this boundary.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  selected: true,
  chevron: true,
  open: () => {},
};
```

```html
<x-import component-from-global-scope="Arc.EntityRow" title="Claude" secondary="Provider" state="Ready" selected="{{selected}}" chevron="{{chevron}}" on-click="{{open}}"></x-import>
```
