import SourceDispatches from "./SourceDispatches";
import { navigation } from "../state/navigation";
import { useState } from "react";
import { t, locale, type MessageKey } from "../i18n";
import { displayMessage } from "../messages";
import { connector } from "../state/connector";
import { Disclosure, Empty, Input, SingleChoice, Status } from "./ui";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from "./ui/table";
export default function RecordsPage() {
  const { status } = connector.use();
  const { recordsSource } = navigation.use();
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const internalMessage =
    /^(?:provided|supplied|run|invoking|invoke|initialized custom fxevent\.Logger|OnStart hook (?:executing|executed)|OnStop hook (?:executing|executed)|mcp channel route resolved|TunnelServiceClient created|control-plane route resolved|dispatcher channels registered|Skipping MCP probe for transport|admin ui enabled|tls trust summary|health server listening|harpoon enabled|starting control-plane poller|poller started|harpoon startup catalog digest|tunnel-client startup summary|Codex detected without Tunnel MCP plugin|tunnel metadata fetched|stdio MCP command started)$/i;
  const rows = (status?.logs || [])
    .flatMap((line, index) => {
      let entry: Record<string, unknown> = {};
      try {
        const value = JSON.parse(line);
        if (value && typeof value === "object" && !Array.isArray(value))
          entry = value;
      } catch {
        /* Plain log lines remain readable. */
      }
      const rawMessage = String(entry.msg ?? entry.message ?? line);
      const level = String(entry.level ?? "").toLowerCase();
      const error =
        /error|fatal|panic/.test(level) ||
        /\b(error|failed|failure)\b/i.test(rawMessage);
      const warning = /warn/.test(level) || /\bwarn(ing)?\b/i.test(rawMessage);
      // Never hide a warning or error just because its source is internal.
      if (
        !error &&
        !warning &&
        (/debug|trace/.test(level) ||
          internalMessage.test(rawMessage) ||
          /^(?:🩺 HEALTH URL:|🌐 WEB UI:)/.test(rawMessage))
      )
        return [];
      const request = rawMessage.match(/^Request (processed|failed): (.+)$/);
      const management = rawMessage.match(/^((?:GET|POST|PUT|DELETE|PATCH) .+): (started|succeeded|failed)$/);
      const sourceId = typeof entry.ingressId === "string" ? entry.ingressId : "";
      const ingressName = status?.ingresses.find(item => item.id === sourceId)?.name;
      let operation = request?.[2] || displayMessage(rawMessage);
      if (management) {
        const [method, route = ""] = management[1]!.split(" ");
        const ingressRoute = route.match(/^ingress\/[^/]+(?:\/(.*))?$/);
        const action = ingressRoute?.[1] || (method === "DELETE" ? "remove" : "update");
        const routeKey = `recordRoute_${route}`;
        const actionKey = `recordIngress_${action}`;
        if (/^ingress-drafts\/[^/]+\/commit$/.test(route))
          operation = t("recordDraftCommit");
        else if (/^ingress-drafts\/[^/]+$/.test(route) && method === "DELETE")
          operation = t("recordDraftDiscard");
        else if (t(routeKey) !== routeKey) operation = t(routeKey);
        else if (ingressRoute && t(actionKey) !== actionKey)
          operation = t(actionKey, { name: ingressName || t("controlSources") });
        else operation = management[1]!;
      }
      const source = management ? t("recordLocalUI") : ingressName || "";
      const result = request ? request[1] === "processed" ? "recordSuccess" : "recordFailure" : management ? management[2] === "succeeded" ? "recordSuccess" : management[2] === "failed" ? "recordFailure" : "recordStarted" : "";
      const message = result ? `${t(result)}: ${operation}` : displayMessage(rawMessage);
      const kind: MessageKey = error
        ? "error"
        : warning
          ? "warning"
          : /request|command/i.test(rawMessage)
            ? "request"
            : /tunnel|connect/i.test(rawMessage)
              ? "connection"
              : "info";
      const rawTime = entry.time ?? entry.timestamp;
      const date =
        rawTime === undefined
          ? undefined
          : new Date(rawTime as string | number);
      const validDate = date && !Number.isNaN(date.getTime());
      const time = validDate
        ? `${date.toLocaleTimeString("en-GB", { hour12: false })}.${String(date.getMilliseconds()).padStart(3, "0")}`
        : "—";
      const detailKeys = ["error", "reason", "status", "method", "duration"];
      const detail = detailKeys
        .flatMap((key) =>
          entry[key] === undefined
            ? []
            : [
                `${key}: ${typeof entry[key] === "object" ? JSON.stringify(entry[key]) : String(entry[key])}`,
              ],
        )
        .join(" · ");
      return [
        {
          index,
          time,
          timestamp: validDate
            ? date.toLocaleString(locale.get())
            : t("recordNoTimestamp"),
          kind,
          message,
          detail, sourceId: management ? `local:${sourceId}` : sourceId, source, operation, result, request: !!request || !!management, operationId: typeof entry.operationId === "string" ? entry.operationId : "", count: 1,
        },
      ];
    })
    .reverse();

  // Newest event wins for the same operation; an unfinished start remains visible.
  const seen = new Set<string>();
  const completed = rows.filter(row => {
    if (!row.operationId) return true;
    if (seen.has(row.operationId)) return false;
    seen.add(row.operationId);
    return true;
  });
  const grouped: typeof rows = [];
  for (const row of completed) {
    const previous = grouped.at(-1);
    if (row.request && row.result === "recordSuccess" && row.sourceId && previous?.result === row.result && previous.sourceId === row.sourceId && previous.operation === row.operation) previous.count++;
    else grouped.push({ ...row });
  }
  const hasSource = rows.some(row => row.source);
  const hasResult = rows.some(row => row.result);
  const visibleRows = grouped.filter(
    (row) =>
      (!recordsSource || row.sourceId === recordsSource || row.sourceId === `local:${recordsSource}`) &&
      (filter === "all" || row.kind === filter) &&
      `${row.source} ${row.message} ${row.detail}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="min-w-0">
      <div className="mb-5 flex min-w-0 flex-wrap items-center gap-3 [&>.choice]:w-auto [&>.choice]:min-w-36 [&>.choice]:max-w-full">
        <SingleChoice label={t("recordSource")} value={recordsSource ? `source:${recordsSource}` : "all"} onChange={value => navigation.set(old => ({ ...old, recordsSource: value === "all" ? undefined : value.slice(7) }))}
          options={[{ value: "all", label: t("all") }, ...(status?.ingresses ?? []).map(i => ({ value: `source:${i.id}`, label: i.name }))]} />
        <Input
          className="min-w-36 flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("searchLogs")}
          placeholder={t("searchRecords")}
        />
        <SingleChoice
          label={t("logType")}
          value={filter}
          onChange={setFilter}
          options={[
            "all",
            "connection",
            "request",
            "info",
            "warning",
            "error",
          ].map((value) => ({ value, label: t(value) }))}
        />
      </div>
      {recordsSource && <section><h3>{t("sourcePanel.dispatches")}</h3>{status?.ingresses.find(i => i.id === recordsSource)?.sources?.map(source => <div key={source.id}><h4>{source.label}</h4><SourceDispatches sourceId={source.id} /></div>)}</section>}
      <Table className="text-xs">
          <TableCaption className="sr-only">{t("connectionLogContents")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="h-8 text-muted-foreground">{t("time")}</TableHead>
              {hasSource && <TableHead scope="col" className="h-8 text-muted-foreground">{t("recordSource")}</TableHead>}
              <TableHead scope="col" className="h-8 text-muted-foreground">{t("recordOperation")}</TableHead>
              {hasResult && <TableHead scope="col" className="h-8 text-muted-foreground">{t("recordResult")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.index}>
                <TableCell>
                  <time className="whitespace-nowrap text-muted-foreground tabular-nums" title={row.timestamp}>{row.time}</time>
                </TableCell>
                {hasSource && <TableCell className="whitespace-nowrap">{row.source || "—"}</TableCell>}
                <TableCell className="w-full min-w-40 whitespace-normal">
                  <span className="block wrap-anywhere" title={row.operation}>{row.operation}{row.count > 1 ? ` ×${row.count}` : ""}</span>
                  {row.detail && (
                    <Disclosure title={t("details")}>
                      <pre className="whitespace-pre-wrap wrap-anywhere">{row.detail}</pre>
                    </Disclosure>
                  )}
                </TableCell>
                {hasResult && <TableCell>{row.result ? <Status tone={row.result === "recordFailure" ? "danger" : "neutral"}>{t(row.result)}</Status> : "—"}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      {!visibleRows.length && (
        <Empty>
          {t(rows.length ? "noMatchingRecords" : "noConnectionRecordsYet")}
        </Empty>
      )}
    </section>
  );
}
