# Arc.SettingsSection

Named settings group with one heading. Children must not repeat that heading.

Requires [Arc.Root](Root.md). All slots and children accept plain text only across React versions. Use template holes for non-string props.

## Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | required | Section heading. |
| `description` | `string` | optional | Information not already carried by rows. |
| `children` | `string` | required | Plain-text body slot. |

## States

Static group; use SettingRow for navigation and controls.

## Canvas example

```html
<x-import component-from-global-scope="Arc.SettingsSection" title="App updates">Current version</x-import>
```
