import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
const catalog=JSON.parse(readFileSync(new URL('../../native/src/catalog.json',import.meta.url),'utf8'));
const engine=new AjvJsonSchemaValidator();
const validators=new Map<string,ReturnType<typeof engine.getValidator>>();
export function assertNextCalls(value: any): void {
  if(!value || typeof value!=='object')return;
  const next=value.next;
  if(next && typeof next==='object' && next.op) {
    const spec=catalog.ops.find((op:any)=>op.name===next.op);
    assert.ok(spec,`Unknown next op: ${next.op}`);
    if(!validators.has(next.op))validators.set(next.op,engine.getValidator(spec.inputSchema));
    const result=validators.get(next.op)!(next.args??{});
    assert.equal(result.valid,true,`Invalid next ${JSON.stringify(next)}: ${JSON.stringify(result)}`);
  }
  for(const child of Object.values(value))assertNextCalls(child);
}
