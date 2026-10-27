import { useState } from "react";
import { t, locale } from "../i18n";
import { subscriptions } from "../state/subscriptions";
import { agents } from "../state/agents";
import type { Page } from "../state/navigation";
import { Card } from "../components/ui/card";
import QuotaBubble from "./QuotaBubble";
import { Button, Empty, Loading, Notice } from "../components/ui";
export default function UsageOverview({ onNavigate }: { onNavigate: (page: Page) => void }) {
  locale.use();
  const { snapshot, error: subscriptionError } = subscriptions.use();
  const inventory = agents.use();
  const enabled = new Set(inventory.items.filter(agent => agent.installed && agent.enabled === true).map(agent => agent.agent));
  const providers = snapshot?.settings.enabled
    ? snapshot.providers.filter((p) => p.eligible && (p.agentIds?.length ? p.agentIds : [p.agentId]).some(agent => enabled.has(agent)))
    : [];
  const [dismissKey, setDismissKey] = useState(0);
  return (
    <section className="usage-overview flex min-h-0 flex-col text-foreground" aria-label={t("trayUsage")}>
      <div
        className="min-h-0 overflow-auto"
        onScroll={() => setDismissKey((k) => k + 1)}
      >
        <div className="grid gap-2.5">
          {subscriptionError && <Notice>{subscriptionError}</Notice>}
          {!snapshot && !subscriptionError && <Loading />}
          {providers.map((provider) => (
            <Card
              key={provider.providerId}
              className="rounded-lg bg-muted p-3 text-foreground shadow-none"
            >
              <QuotaBubble
                key={`${provider.providerId}:${dismissKey}`}
                provider={provider}
              />
            </Card>
          ))}
          {snapshot && !providers.length && (
            <Empty
              action={
                <Button onClick={() => onNavigate("settings")}>
                  {t("traySettings")}
                </Button>
              }
            >
              {t("trayEmpty")}
            </Empty>
          )}
        </div>
      </div>
    </section>
  );
}
