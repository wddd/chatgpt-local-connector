import { createHash } from 'node:crypto';
import { matchesGlob, relative } from 'node:path';

export const uiFiles = ['ui/**/*.{ts,tsx,js,jsx,mjs}'];
// Keep ordinary feature controls (including TuningPanel) inside enforcement.
export const uiIgnores = [
  'ui/components/ui/**', 'ui/components/composites/**', 'ui/components/objects/**',
  'ui/design-mount/**',
  'ui/**/scenario*.{ts,tsx,js,jsx,mjs,css}', 'ui/**/fixture*.{ts,tsx,js,jsx,mjs,css}',
  'ui/**/{scenarios,fixtures}/**', 'ui/**/*.{scenario,fixture}.{ts,tsx,js,jsx,mjs,css}',
  'ui/topology/{geometry,solve,render,portraitRender,animate,orientation,portrait,order,parameters,Topology,Hub,CollapseSymbol,accountViews}.{ts,tsx}',
];
export function isFeatureFile(file) {
  return file.startsWith('ui/') && !uiIgnores.some(pattern => matchesGlob(file, pattern));
}

export function fingerprint(sourceCode, node) {
  return createHash('sha256').update(JSON.stringify(sourceCode.getTokens(node).map(token => token.value))).digest('hex');
}
export function relativeFile(file) {
  return relative(process.cwd(), file).replaceAll('\\', '/');
}

const replacements = {
  button: 'Button or IconButton', input: 'Input, Switch or ChoiceControl inside FormField',
  select: 'ChoiceControl or SingleChoice', textarea: 'Textarea inside FormField', label: 'FormField or SettingRow',
  details: 'Disclosure', summary: 'Disclosure', dl: 'FactList', dt: 'FactList', dd: 'FactList',
};
function propertyName(node) {
  return node?.type === 'Identifier' ? node.name : typeof node?.value === 'string' ? node.value : undefined;
}
function memberName(node) {
  if (node?.type !== 'MemberExpression') return propertyName(node);
  return node.computed && node.property.type !== 'Literal' ? undefined : propertyName(node.property);
}
const layoutProperty = /^(?:margin|padding|gap|rowGap|columnGap|display|flex|grid|align|justify|place|order|float|clear|columns|columnCount|columnWidth|columnRule)/;
function unwrap(node) {
  while (node && ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ChainExpression'].includes(node.type)) node = node.expression;
  return node;
}
function inRenderedExpression(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'JSXExpressionContainer') {
      const attribute = parent.parent;
      if (attribute.type !== 'JSXAttribute') return true;
      return !/^on[A-Z]/.test(attribute.name.name) && attribute.parent.name?.name !== 'DispatchSpec';
    }
    if (parent.type === 'FunctionDeclaration') return false;
  }
  return false;
}

export function createUiPlugin(baseline) {
  function rule(name, message, visit) {
    return {
      meta: { type: 'problem', schema: [], messages: { violation: message, stale: 'UI debt was removed. Remove or reduce stale {{rule}} baseline entry {{key}} and update docs/dev/ui-debt.md; never reuse it for new code.' } },
      create(context) {
        const source = context.sourceCode;
        const allowed = baseline.files?.[relativeFile(context.filename)]?.[name] ?? {};
        const seen = new Map();
        function report(node, data) {
          const key = fingerprint(source, node), count = (seen.get(key) ?? 0) + 1;
          seen.set(key, count);
          if (count > (allowed[key] ?? 0)) context.report({ node, messageId: 'violation', data });
        }
        return {
          ...visit(report),
          'Program:exit'(node) {
            for (const [key, count] of Object.entries(allowed)) {
              if ((seen.get(key) ?? 0) < count) context.report({ node, messageId: 'stale', data: { rule: name, key } });
            }
          },
        };
      },
    };
  }
  return { rules: {
    'shared-controls': rule('shared-controls', 'Use {{component}} from the shared UI components instead of raw <{{tag}}>. Add a missing pattern to the shared layer with a fixture and design-mount export first.', report => ({
      JSXOpeningElement(node) {
        if (node.name.type === 'JSXIdentifier' && replacements[node.name.name]) report(node, { tag: node.name.name, component: replacements[node.name.name] });
      },
    })),
    'dispatch-spec': rule('dispatch-spec', 'Render recorded model, effort and service-tier fields through DispatchSpec; do not build a dispatch summary in feature JSX.', report => ({
      MemberExpression(node) {
        if (!['model', 'effort', 'serviceTier'].includes(memberName(node))) return;
        if (['dispatchSummary', 'task'].includes(memberName(unwrap(node.object))) && inRenderedExpression(node)) report(node);
      },
    })),
    'shared-layout': rule('shared-layout', 'Move inline layout property "{{property}}" into a shared shell (EntityRow, EntityCard, FormSection, SettingRow, SectionHeader or ActionGroup). Geometry styles (top/left/width/height/transform) remain allowed.', report => ({
      JSXAttribute(node) {
        if (node.name.name !== 'style' || node.value?.type !== 'JSXExpressionContainer') return;
        function inspect(expression) {
          const object = unwrap(expression);
          if (object?.type !== 'ObjectExpression') return;
          for (const prop of object.properties) {
            if (prop.type === 'SpreadElement') { inspect(prop.argument); continue; }
            const name = prop.computed && prop.key.type !== 'Literal' ? undefined : propertyName(prop.key);
            if (name && layoutProperty.test(name)) report(prop, { property: name });
          }
        }
        inspect(node.value.expression);
      },
    })),
  } };
}
