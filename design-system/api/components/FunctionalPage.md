# Arc.FunctionalPage

A title bar and scrollable content area for functional pages. Both use the same responsive horizontal inset. The host owns panel size, navigation and actions. Sections and rows inherit the content inset without page-specific padding.

Requires [Arc.Root](Root.md). `header` and `children` accept plain text in design islands and React content in application callers. Use a flex column host with a definite height to constrain scrolling.

```html
<x-import component-from-global-scope="Arc.FunctionalPage" header="Settings">Functional page content</x-import>
```
