import { useState } from 'react';
import { InlineName } from './components/composites/InlineName';
import { ObjectMenu } from './components/composites/ObjectMenu';
import { CopyValue } from './components/composites/CopyValue';
import { ContextSettings } from './components/composites/ContextSettings';
import { EntityCard, SectionHeader } from './components/ui';

export default function ContextActionsFixture() {
  const [alias, setAlias] = useState('Example team'), [removed, setRemoved] = useState(false);
  const [width, setWidth] = useState('medium'), [copied, setCopied] = useState('');
  return <div className="grid content-start gap-4">
    <EntityCard title="Account">
      {removed ? <p role="status">Account removed</p> : <SectionHeader level={2} titleProps={{ 'aria-label': alias }} title={<InlineName value={alias} revealed onSave={async value => { if (value === 'failure') throw new Error('Rename failed'); setAlias(value); }} />}
        actions={<ObjectMenu label="Account actions" revealed items={[{ label: 'Remove', consequence: 'Future work cannot use this account; running tasks finish.', onSelect: async () => setRemoved(true) }]} />} />}
    </EntityCard>
    <EntityCard title="Copy"><CopyValue value="https://relay.example.com/mcp" onCopy={async value => setCopied(value)} />{copied && <output aria-label="Copied value">{copied}</output>}</EntityCard>
    <EntityCard title="Bubble" headerActions={<ContextSettings label="Bubble width" value={width} revealed options={['narrow', 'medium', 'wide'].map(value => ({ value, label: value }))} onChange={setWidth} />}><output aria-label="Selected width">{width}</output></EntityCard>
  </div>;
}
