import { useState } from 'react';
import { DataTable, Pagination } from './components/ui/DataTable';
import { Button, Empty, SettingsSection } from './components/ui';

const rows = Array.from({ length: 12 }, (_, index) => ({ id: String(index + 1), name: `Operation ${index + 1}`, state: index % 3 ? 'Completed' : 'Needs attention' }));
export default function ManagementTableFixture() {
  const [page, setPage] = useState(1), [opened, setOpened] = useState('');
  const columns = [
    { key: 'name', title: 'Operation', width: 180, render: (row: typeof rows[number]) => <Button variant="link" onClick={event => { event.stopPropagation(); setOpened(row.name); }}>{row.name}</Button> },
    { key: 'state', title: 'State', width: 160, render: (row: typeof rows[number]) => row.state },
    { key: 'id', title: 'Sequence', width: 80, align: 'right' as const, render: (row: typeof rows[number]) => row.id },
  ];
  return <div className="min-w-0">
    <SettingsSection title="Management table">
      <DataTable rows={rows.slice((page - 1) * 3, page * 3)} columns={columns} empty={<Empty>No operations</Empty>} onOpen={row => setOpened(row.name)} />
      <Pagination current={page} total={rows.length} pageSize={3} onChange={setPage} />
      <output aria-live="polite">{opened}</output>
    </SettingsSection>
    <SettingsSection title="Empty table"><DataTable rows={[]} columns={columns} empty={<Empty>No operations</Empty>} /></SettingsSection>
    <SettingsSection title="Disabled pagination"><Pagination current={1} total={90} pageSize={3} disabled onChange={setPage} /></SettingsSection>
  </div>;
}
