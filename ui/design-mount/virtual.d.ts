declare module 'virtual:arc-runtime' {
  export function createRuntime(): {
    configure(value: import('./environment').Environment, target?: HTMLElement): void;
    mount(node: HTMLElement, name: string): { update(props: Record<string, unknown>): void; unmount(): void };
  };
}
