import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Icon } from "./index";
import { locale, t } from "../../i18n";
import { cn } from "../../lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table";

interface Column<T> {
  key: string;
  title?: ReactNode;
  width: number;
  align?: "right";
  render: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({ rows, columns, onOpen, empty }: {
  rows: T[];
  columns: Column<T>[];
  onOpen?: (row: T) => void;
  empty: ReactNode;
}) {
  return (
    <Table className="table-fixed" style={{ minWidth: columns.reduce((sum, column) => sum + column.width, 0) }}>
      <TableHeader>
        <TableRow>
          {columns.map(column => <TableHead scope="col" key={column.key} style={{ width: column.width }} className={cn("text-muted-foreground", column.align === "right" && "text-right")}>{column.title}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(row => <TableRow key={row.id} className={onOpen ? "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring" : undefined} tabIndex={onOpen ? -1 : undefined} onClick={onOpen ? event => { event.currentTarget.focus({ preventScroll: true }); onOpen(row); } : undefined}>
          {columns.map(column => <TableCell key={column.key} className={cn("whitespace-normal", column.align === "right" && "text-right")}>{column.render(row)}</TableCell>)}
        </TableRow>)}
        {!rows.length && <TableRow><TableCell colSpan={columns.length}>{empty}</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

export function Pagination({ current, total, pageSize, disabled, onChange }: {
  current: number;
  total: number;
  pageSize: number;
  disabled?: boolean;
  onChange: (page: number) => void;
}) {
  locale.use();
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last === 1) return null;
  const pages = Array.from(new Set([1, ...Array.from({ length: 5 }, (_, i) => Math.min(Math.max(current - 2, 1), Math.max(last - 4, 1)) + i).filter(page => page <= last), last])).sort((a, b) => a - b);
  return <nav className="mt-4 flex flex-wrap items-center justify-end gap-1" aria-label={t("pagination")}>
    <Button variant="ghost" className="h-7 min-h-7 min-w-7 px-1.5 text-xs aria-[current=page]:border-ring aria-[current=page]:text-brand-accent" disabled={disabled || current <= 1} aria-label={t("previousPage")} onClick={() => onChange(current - 1)}><Icon icon={ChevronLeft} /></Button>
    {pages.map((page, index) => <span className="inline-flex items-center gap-1" key={page}>
      {index > 0 && page - pages[index - 1] > 1 && <span className="px-1 text-muted-foreground" aria-hidden="true">…</span>}
      <Button variant="ghost" className="h-7 min-h-7 min-w-7 px-1.5 text-xs aria-[current=page]:border-ring aria-[current=page]:text-brand-accent" disabled={disabled} aria-current={page === current ? "page" : undefined} onClick={() => onChange(page)}>{page}</Button>
    </span>)}
    <Button variant="ghost" className="h-7 min-h-7 min-w-7 px-1.5 text-xs aria-[current=page]:border-ring aria-[current=page]:text-brand-accent" disabled={disabled || current >= last} aria-label={t("nextPage")} onClick={() => onChange(current + 1)}><Icon icon={ChevronRight} /></Button>
  </nav>;
}
