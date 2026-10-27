# Shared components

Shared shadcn/ui primitives live in `ui/components/ui`. Domain components live in `ui/components/objects`; cross-object compositions live in `ui/components/composites`. Screens retain their data loading, navigation and mutations.

Design each screen as a whole for its real content. Reuse shared components when they serve that screen. Choose presentations for the content and available space rather than requiring every object to implement Chip, Row, Card or Node variants. Design exports are optional.

Use shadcn/ui with Radix primitives and Tailwind utilities. Add primitives through the shadcn CLI into `ui/components/ui` and adapt the copied source there. Do not wrap components solely to restyle them. Use semantic tokens and existing controls, including SingleChoice for single-choice inputs. Keep dedicated CSS within the existing brand boundaries. Run `npm run check:ui` and keep its debt baselines shrinking.

Judge visual and interaction quality through `npm run dev:ui` connected to the running app's real data. See [UI](ui.md) and [Acceptance](acceptance.md).
