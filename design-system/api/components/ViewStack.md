# Arc.ViewStack

A full-height column for retained panel views. The host supplies a definite panel height. Hidden views keep their React state and effects while leaving layout and keyboard navigation.

Requires [Arc.Root](Root.md). `children` accepts plain text in design islands. Application callers can use `asChild` with a motion element; design islands do not support it. Standard div attributes include `hidden` and accessible labels.

```html
<x-import component-from-global-scope="Arc.ViewStack">Panel content</x-import>
```
