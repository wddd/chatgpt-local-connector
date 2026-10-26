# Arc.MeterSegment

An interactive proportional-meter segment. It shares Button behavior and accepts a numeric `weight` for flex growth. Its owner supplies the label, meter appearance and pointer/focus handlers. No quota state is inferred.

Requires [Arc.Root](Root.md). Children accept plain text. All Button props apply, except refs and raw HTML in design islands.

```html
<x-import component-from-global-scope="Arc.MeterSegment" weight="{{75}}" aria-label="Used 75 percent">Used</x-import>
```
