# Arc.SettingRow

One alignment grid for a label, optional description and trailing control.

Requires [Arc.Root](Root.md). All slots and children accept plain text only across React versions. Use template holes for non-string props.

## Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `label` | `string` | required | Row label. |
| `description` | `string` | optional | Constraint or meaningful secondary text. |
| `children` | `string` | optional | Static trailing slot; omit for navigation. |
| `controlId` | `string` | optional | ID of an application control; no cross-island control composition. |
| `id` | `string` | optional | Row or navigation button ID. |
| `onNavigate` | `() => void` | optional | Makes the full-width row target a button with chevron. |
| `disabled` | `boolean` | false | Disables a navigation target. |

## States

Only navigation rows have a moving hover highlight. Their target spans the row, with copy on the left and a chevron at the trailing edge. Controls stay aligned to the trailing edge when they wrap below their label. Ordinary rows do not highlight. Navigation and children are mutually exclusive.

## Canvas example

```html
<x-import component-from-global-scope="Arc.SettingRow" label="Current version" description="Agent Remote Control v1.0.0">Stable</x-import>
```
