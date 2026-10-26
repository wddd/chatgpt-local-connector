import { useState } from 'react';
import { MeterSegment, ViewStack, ActionGroup, Button, DangerZone, Disclosure, FormField, FormSection, Input, SectionHeader, SettingRow, SettingsSection, ChoiceControl, Switch } from './components/ui';
import { DispatchSpec } from './components/composites/DispatchSpec';
import { dispatchSpecFixtures } from './scenarioDispatchSpec';
import './scenarioShells.css';
import { scenarioName } from './scenarioMode';

export default function FormsFixture() {
  const [value, setValue] = useState(''), [error, setError] = useState(''), [checked, setChecked] = useState(true), [choice, setChoice] = useState('system');
  const [action, setAction] = useState('');
  return <main className="shell-fixture forms-fixture" style={scenarioName === "forms-narrow" ? { maxWidth: 360 } : undefined}>
    <SectionHeader level={1} title="Settings and forms" />
    <div style={{ height: 80 }}><ViewStack>
      <Button variant="surface" onClick={() => setAction('Surface activated')}>Custom surface action</Button>
      <ViewStack hidden>Retained hidden view</ViewStack>
      <ActionGroup align="leading">
        <MeterSegment weight={3} aria-label="Used 75 percent" onClick={() => setAction('Used segment')}>Used</MeterSegment>
        <MeterSegment weight={1} aria-label="Remaining 25 percent" onClick={() => setAction('Remaining segment')}>Remaining</MeterSegment>
      </ActionGroup>
    </ViewStack></div>
    <SettingsSection title="App updates">
      <SettingRow label="Current version" description="Agent Remote Control v1.0.0" onNavigate={() => setAction('Navigate to updates')} />
      <SettingRow label="Unavailable destination" disabled onNavigate={() => setAction('Unexpected navigation')} />
      <SettingRow label="Release channel"><ChoiceControl value="stable" label="Release channel" options={[{ value: 'stable', label: 'Stable' }]} onChange={() => setAction('Unexpected selection')} /></SettingRow>
      <SettingRow label="Empty choices"><ChoiceControl value="" label="Empty choices" options={[]} onChange={() => setAction('Unexpected selection')} /></SettingRow>
      <SettingRow label="Unlisted recorded choice"><ChoiceControl value="retired" label="Unlisted recorded choice" options={[{ value: 'stable', label: 'Stable' }]} onChange={() => setAction('Unexpected selection')} /></SettingRow>
      <SettingRow label="Update actions"><ActionGroup><Button onClick={() => setAction('Release notes')}>Release notes</Button><Button onClick={() => setAction('Check for updates')}>Check for updates</Button></ActionGroup></SettingRow>
      <SettingRow label="Automatic updates" controlId="fixture-auto"><Switch id="fixture-auto" label="Automatic updates" checked={checked} onChange={setChecked} /></SettingRow>
      <SettingRow label="Appearance"><ChoiceControl value={choice} label="Appearance" options={['system', 'light', 'dark'].map(value => ({ value, label: value }))} onChange={setChoice} /></SettingRow>
    </SettingsSection>
    <Disclosure title="Advanced" defaultOpen>
      <form noValidate onSubmit={event => { event.preventDefault(); if (!value.trim()) { setError('Enter a label.'); document.getElementById('fixture-label')?.focus(); } else { setError(''); setAction('Saved'); } }}>
        <FormSection title="Connection">
          <FormField id="fixture-label" label="Label" help="Maximum 120 bytes." error={error}><Input value={value} onChange={event => { setValue(event.target.value); setError(''); }} /></FormField>
          <FormField label="Product"><ChoiceControl value="claude" label="Product" disabled options={[{ value: 'claude', label: 'Claude' }, { value: 'chatgpt', label: 'ChatGPT' }]} onChange={() => setAction('Unexpected product change')} /></FormField>
          <FormField id="fixture-invalid" label="Invalid value" error="This value is unavailable."><Input defaultValue="Invalid" /></FormField>
          <ActionGroup><Button disabled>Cancel</Button><Button type="submit" variant="primary">Save</Button></ActionGroup>
        </FormSection>
      </form>
      <DangerZone consequence="Disconnecting removes access through this source."><Button variant="danger-outline" onClick={() => setAction('Disconnect requested')}>Disconnect</Button></DangerZone>
    </Disclosure>
    <Disclosure title="Collapsed section"><FormSection><FormField label="Read-only value">Unavailable</FormField></FormSection></Disclosure>
    <Disclosure title="Disabled section" disabled>Unavailable</Disclosure>
    <ActionGroup align="leading"><Button busy>Saving</Button><Button disabled>Unavailable action</Button></ActionGroup>
    <SettingsSection title="Recorded dispatch specs">
      {dispatchSpecFixtures.map(fixture => <SettingRow key={fixture.label} label={fixture.label}><DispatchSpec {...fixture} /></SettingRow>)}
    </SettingsSection>
    <output aria-live="polite">{action}</output>
  </main>;
}
