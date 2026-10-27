import { Spinner } from "./spinner";

export function LoadingIndicator({ label }: { label: string }) {
  return <span className="inline-flex text-muted-foreground" role="status" aria-label={label}>
    <Spinner className="size-5" aria-hidden="true" />
  </span>;
}
