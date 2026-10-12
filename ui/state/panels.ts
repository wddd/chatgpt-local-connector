import { createStore } from "./store";
export const panelLayers = createStore<HTMLElement[]>([]);
export function panelAnchorAt(x: number, y: number, excluded?: HTMLElement) {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-panel-anchor]"),
  ).find((el) => {
    const r = el.getBoundingClientRect();
    return (
      el !== excluded &&
      !el.closest(".elastic-panel") &&
      r.width > 0 &&
      x >= r.left &&
      x <= r.right &&
      y >= r.top &&
      y <= r.bottom
    );
  });
}
