import { useEffect, useState } from 'react';
import { Button } from './components/ui';
import type { Page } from './state/navigation';

export default function NavigationFixture({ page, navigate }: { page: Page; navigate: (target: string) => void }) {
  const [target, setTarget] = useState(''), [landings, setLandings] = useState<Record<string, string>>({});
  useEffect(() => { if (target) setLandings(old => ({ ...old, [target]: page })); }, [target, page]);
  return <aside aria-label="Legacy navigation" className="fixed bottom-20 left-4 z-60 grid gap-2 rounded-lg border bg-background p-3 text-sm shadow-sm">
    {['tasks', 'accounts', 'remote', 'permissions'].map(value => <div key={value} className="flex items-center gap-2">
      <Button onClick={() => { setTarget(value); navigate(value); }}>Navigate {value}</Button>
      <output role="status" aria-label={value}>{value} → {landings[value] ?? '—'}</output>
    </div>)}
  </aside>;
}
