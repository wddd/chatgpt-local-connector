import { useState } from 'react';
import { Button, SingleChoice, FormField, Input, Textarea, Switch, DetailDialog, Tooltip, Menu } from './components/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel, AlertDialogFooter } from './components/ui/alert-dialog';
import { Popover, PopoverTrigger, PopoverContent } from './components/ui/popover';
import { ScrollArea } from './components/ui/scroll-area';
import { Skeleton } from './components/ui/skeleton';
import { Separator } from './components/ui/separator';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from './components/ui/alert';

/** Foundation behavior is exercised without a native owner or live requests. */
export default function FoundationFixture() {
  const [choice, setChoice] = useState('one'), [checked, setChecked] = useState(true), [action, setAction] = useState('');
  const options = ['one', 'two', 'three'].map(value => ({ value, label: value, disabled: value === 'three' }));
  return <main className="mx-auto grid max-w-3xl gap-6 p-6">
    <h1>UI foundation</h1>
    <Card><CardHeader><CardTitle>Controls</CardTitle></CardHeader><CardContent className="grid gap-4">
      <FormField id="foundation-input" label="Name" help="Maximum 120 bytes."><Input placeholder="Name" /></FormField>
      <FormField id="foundation-error" label="Invalid name" error="Enter a name."><Input /></FormField>
      <FormField id="foundation-text" label="Description"><Textarea /></FormField>
      <Switch checked={checked} onChange={setChecked} label="Enabled" />
      <SingleChoice value={choice} onChange={setChoice} options={options} label="Pills" />
      <div className="w-24"><SingleChoice value={choice} onChange={setChoice} options={options} label="Narrow choice" /></div>
      <SingleChoice value={choice} onChange={setChoice} options={[...options, ...['four', 'five', 'six'].map(value => ({ value, label: value }))]} label="Many choices" />
      <SingleChoice value={choice} onChange={setChoice} options={options} disabled label="Disabled choice" />
      <div className="flex flex-wrap gap-2">{(['primary', 'secondary', 'ghost', 'danger', 'danger-outline', 'link'] as const).map(variant => <Button key={variant} variant={variant}>{variant}</Button>)}<Button busy>Saving</Button></div>
    </CardContent></Card>
    <Tabs defaultValue="first"><TabsList><TabsTrigger value="first">First tab</TabsTrigger><TabsTrigger value="second">Second tab</TabsTrigger></TabsList><TabsContent value="first">First content</TabsContent><TabsContent value="second">Second content</TabsContent></Tabs>
    <div className="flex flex-wrap gap-2">
      <DetailDialog title="Edit item" trigger={<Button>Edit item</Button>}><FormField id="dialog-name" label="Dialog name"><Input /></FormField></DetailDialog>
      <AlertDialog><AlertDialogTrigger asChild><Button variant="danger-outline">Remove item</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogTitle>Remove item?</AlertDialogTitle><AlertDialogDescription>This removes the fixture item.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => setAction('Removed')}>Remove</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Popover><PopoverTrigger asChild><Button>Open popover</Button></PopoverTrigger><PopoverContent>Popover content</PopoverContent></Popover>
      <Tooltip text="Tooltip content"><Button>Hover for tooltip</Button></Tooltip>
      <Menu trigger={<Button>Open menu</Button>} label="Fixture menu" items={[{ label: 'Inspect', action: () => setAction('Inspected') }, { label: 'Unavailable', disabled: true, action: () => setAction('Unexpected action') }]} />
    </div>
    <Separator /><Badge>Ready</Badge><Skeleton className="h-4 w-40" />
    <Alert><AlertTitle>State</AlertTitle><AlertDescription>Fixture content</AlertDescription></Alert>
    <ScrollArea className="h-24 rounded-md border p-3">{Array.from({ length: 12 }, (_, index) => <p key={index}>Item {index + 1}</p>)}</ScrollArea>
    <output aria-live="polite">{action}</output>
  </main>;
}
