// Preview recipes are required for every value export in ui/design-mount.ts.
// Only Root accepts React elements; all island slots and children stay text-only.
export const previews = {
  Root: ['Foundation', 120, "Row(h(A.Status,{tone:'success'},F.labels.status),h(A.Button,{variant:'primary'},F.labels.button))"],
  ViewStack: ['Shells', 100, "h(A.ViewStack,{},'Retained panel content')"],
  MeterSegment: ['Primitives', 100, "Row(h(A.MeterSegment,{weight:3},'Used'),h(A.MeterSegment,{weight:1},'Remaining'))"],
  Button: ['Primitives', 140, "Row(...['primary','secondary','ghost','link','danger-outline','danger','surface'].map(variant=>h(A.Button,{key:variant,variant},variant)),h(A.Button,{busy:true},'Saving'),h(A.Button,{disabled:true},'Disabled'))"],
  IconButton: ['Primitives', 80, "Row(...['RefreshCw','Plus','Check','X'].map(icon=>h(A.IconButton,{key:icon,icon,label:icon})),h(A.IconButton,{icon:'RefreshCw',label:'Refreshing',busy:true}),h(A.IconButton,{icon:'Plus',label:'Disabled',disabled:true}))"],
  Switch: ['Primitives', 110, 'h(SwitchDemo)'],
  SingleChoice: ['Primitives', 110, 'h(ChoiceDemo)'],
  ChoiceControl: ['Forms', 120, "Col(h(A.ChoiceControl,{label:'Release channel',value:'stable',options:[{value:'stable',label:'Stable'}],onChange:noop}),h(A.ChoiceControl,{label:'Empty choices',value:'',options:[],onChange:noop}))"],
  Notice: ['Primitives', 220, "Col(h(A.Notice,{tone:'danger'},F.labels.notice),h(A.Notice,{tone:'warning'},'Reauthorization required'),h(A.Notice,{tone:'success'},'Connection added'))"],
  Empty: ['Primitives', 160, "h(A.Empty,{icon:'Info'},F.labels.empty)"],
  Loading: ['Primitives', 80, 'h(A.Loading)'],
  Status: ['Primitives', 80, "Row(h(A.Status,{},'Idle'),h(A.Status,{tone:'success'},F.labels.status),h(A.Status,{tone:'warning'},'Needs sign-in'),h(A.Status,{tone:'danger'},'Failed'))"],
  Tag: ['Primitives', 80, "Row(h(A.Tag,{},F.labels.tag),h(A.Tag,{tone:'source'},'SRC'),h(A.Tag,{tone:'agent'},'AGENT'))"],
  AgentQuotaIcon: ['Quota', 100, "Row(h(A.AgentQuotaIcon,{agent:'codex'}),h(A.AgentQuotaIcon,{agent:'claude',dual:true,quota:F.accounts[0].quota}),h(A.AgentQuotaIcon,{agent:'dsh',quota:null}))"],
  AgentQuota: ['Quota', 480, "Col(...['ready','refreshing','empty'].map(state=>Box(h(A.AgentQuota,{provider:F.quotaStates[state],refreshing:state==='refreshing',onRefresh:noop}))))"],
  QuotaBubble: ['Quota', 640, "Col(...['ready','unavailable'].map(state=>Box(h(A.QuotaBubble,{provider:F.quotaStates[state],link:false,onRefresh:async()=>{}}))))"],
  GraphNode: ['Topology', 120, "Row(...['normal','connecting','error','inactive'].map((state,i)=>h(A.GraphNode,{key:state,label:F.sources[i%F.sources.length].label+': '+state,state,onOpen:noop},state)),h(A.GraphNode,{label:'Highlighted',state:'normal',highlighted:true,onOpen:noop},'Selected'))"],
  ActivityBubble: ['Topology', 520, "Col(...['compact','standard','detailed'].map((density,i)=>Box(h(A.ActivityBubble,{agent:F.activitySessions[i].agent,session:F.activitySessions[i],density,onRead:noop}))))"],
  PlatformIcon: ['Shells', 100, "Row(...['source','agent','provider'].map(role=>h(A.PlatformIcon,{key:role,platform:role==='source'?F.sources[0].product:'claude',role,size:28})),h(A.PlatformIcon,{platform:'unknown',role:'provider',fallback:'Info',size:28}),h(A.PlatformIcon,{platform:'codex',role:'agent',add:true,size:28}))"],
  StateBadge: ['Shells', 160, "Col(...['badge','dot','compact','text'].map(variant=>Row(...['accent','success','warning','danger','neutral'].map(tone=>h(A.StateBadge,{key:tone,variant,presentation:{tone,labelKey:'connected',icon:'Check'},label:tone})))))"],
  SectionHeader: ['Shells', 180, "Col(h(A.SectionHeader,{title:'Providers',level:2,count:F.quotaSnapshots.length,leading:'P',secondary:'Quota',actions:'Refresh'}),h(A.SectionHeader,{title:'Accounts',level:3,count:0,back:'Back'}))"],
  EntityRow: ['Shells', 220, "Col(h(A.EntityRow,{title:F.sources[0].label,secondary:'Control source',state:'Ready'}),h(A.EntityRow,{title:F.agents[0].agent,secondary:'Agent',selected:true,attention:true,chevron:true,onClick:noop}),h(A.EntityRow,{title:'Unavailable',disabled:true,chevron:true,href:'#root'}))"],
  EntityCard: ['Shells', 280, "Col(h(A.EntityCard,{icon:'C',title:F.quotaSnapshots[0].name,headerActions:'Refresh',footer:'Observed now',danger:'Unavailable'},'Provider details'),h(A.EntityCard,{variant:'outline'},'Untitled content'))"],
  FactList: ['Shells', 220, "Col(...[{placeholder:'Unknown'},{omit:true}].map(missing=>h(A.FactList,{items:[{label:'Agent',value:F.agents[0].agent},{label:'Plan'}],missing})))"],
  Freshness: ['Shells', 160, "Col(h(A.Freshness,{observedAt:new Date(F.now).toISOString(),age:'Just now',onRefresh:noop}),h(A.Freshness,{observedAt:F.quotaStates.stale.observedAt,age:'Two hours ago',stale:true,onRefresh:noop}),h(A.Freshness,{observedAt:null,age:'',unknown:'Unknown',busy:true,onRefresh:noop}))"],
  AddressField: ['Shells', 260, 'h(AddressDemo)'],
  SettingsSection: ['Forms', 160, "h(A.SettingsSection,{title:'App updates',description:'Current version'},'Agent Remote Control v1.0.0')"],
  SettingRow: ['Forms', 220, "Col(h(A.SettingRow,{label:'Release channel'},'Stable'),h(A.SettingRow,{label:'Current version',description:'Agent Remote Control v1.0.0',onNavigate:noop}),h(A.SettingRow,{label:'Unavailable',onNavigate:noop,disabled:true}))"],
  FormField: ['Forms', 180, "Col(h(A.FormField,{label:'Label',help:'Maximum 120 bytes.'},'Example source'),h(A.FormField,{label:'Invalid value',error:'Enter a value.'},'Unavailable'))"],
  FormSection: ['Forms', 140, "h(A.FormSection,{title:'Connection'},'Connection fields')"],
  ActionGroup: ['Forms', 140, "Col(h(A.ActionGroup,{align:'leading'},'Leading actions'),h(A.ActionGroup,{},'Trailing actions'))"],
  Disclosure: ['Forms', 180, "Col(h(A.Disclosure,{title:'Advanced',defaultOpen:true},'Advanced settings'),h(A.Disclosure,{title:'Collapsed'},'Additional settings'))"],
  DangerZone: ['Forms', 140, "h(A.DangerZone,{consequence:'Disconnecting removes source access.'},'Disconnect')"],
  DispatchSpec: ['Composites', 380, "Col(...F.dispatchSpecs.map(spec=>h(A.DispatchSpec,{key:spec.label,...spec})))"],
};

const prelude = `const h=React.createElement, A=window.Arc, F=A.fixtures;
const mode=document.documentElement.dataset.theme==='dark'?'dark':'light';
const noop=()=>{};
const Row=(...children)=>h('div',{style:{display:'flex',gap:'12px',alignItems:'center',flexWrap:'wrap'}},...children);
const Col=(...children)=>h('div',{style:{display:'flex',flexDirection:'column',gap:'12px'}},...children);
const Box=child=>h('div',{style:{width:'380px',maxWidth:'100%'}},child);
function SwitchDemo(){const[checked,setChecked]=React.useState(true);return Col(h(A.Switch,{checked,onChange:setChecked,label:'Open tasks in Codex'}),h(A.Switch,{checked:false,onChange:noop,label:'Disabled',disabled:true}));}
function ChoiceDemo(){const[value,onChange]=React.useState(F.choices[0].value);return Col(h(A.SingleChoice,{label:'Agent',value,options:F.choices,onChange}),h(A.SingleChoice,{label:'Disabled agent',value,options:F.choices,onChange,disabled:true}));}
function AddressDemo(){const[revealed,setRevealed]=React.useState(false);const[copied,setCopied]=React.useState(false);const value='https://example.com';return Col(h(A.AddressField,{label:'Provider address',value,display:revealed?value:'••••',revealed,onReveal:()=>setRevealed(v=>!v),copied,onCopy:()=>setCopied(true)}),h(A.AddressField,{label:'Disabled address',value,display:value,disabled:true,onCopy:noop}),h(A.AddressField,{label:'Empty address',value:'',display:'',placeholder:'No address',error:'Address unavailable',onCopy:noop}));}
`;

export function previewHtml(name) {
  const [group, height, body] = previews[name];
  return `<!-- @dsCard group="${group}" height=${height} -->
<div id="root" style="padding:16px;box-sizing:border-box"></div>
<script>
${prelude}ReactDOM.createRoot(document.getElementById('root')).render(h(A.Root,{mode,now:F.now},${body}));
</script>
`;
}
