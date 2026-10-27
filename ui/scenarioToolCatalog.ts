import catalog from '../native/src/catalog.json';
import type { ToolCatalog } from './toolPolicy';

// Use the shipped catalog with Agent operations available in browser fixtures.
const exposure = catalog.toolExposure.tools as Record<string, Omit<ToolCatalog['tools'][number], 'name' | 'description' | 'via'>>;
export const toolCatalogFixture: ToolCatalog = {
  groups: catalog.toolExposure.groups,
  required: catalog.toolExposure.required,
  tools: catalog.ops.map(op => ({
    ...(exposure[op.name] ?? { group: 'native', presets: [], requires: ['control_output'] }),
    name: op.name,
    description: op.description,
    via: op.annotations.readOnlyHint ? 'query' : 'act',
    available: true,
  })),
};
