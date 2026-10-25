import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const sales = url(compile('../src/lib/sales-reporting.ts'));
const { monthlySales } = await import(url(compile('../src/lib/monthly-sales.ts').replace("'./sales-reporting'", JSON.stringify(sales))));
const deal = { id:'one', title:'Website', status:'WON', currency:'EUR', value:'150', closedAt:'2026-01-20' };
test('keeps empty months and filters won sales by currency and closing date', () => {
 const rows = monthlySales([deal, {...deal,id:'usd',currency:'USD'}, {...deal,id:'lost',status:'LOST'}, {...deal,id:'old',closedAt:'2025-12-30'}], '2026-01-01', '2026-03-31', 'EUR');
 assert.deepEqual(rows.map(m => [m.key,m.total,m.deals.length]), [['2026-01',150,1],['2026-02',0,0],['2026-03',0,0]]);
 assert.equal(rows[0].deals[0].title,'Website');
});
test('handles partial months, year boundaries and legacy closing history', () => {
 const legacy = {...deal,closedAt:null,status:undefined,stage:{status:'WON'},history:[{movedAt:'2027-01-05',toStage:{status:'WON'}}]};
 assert.deepEqual(monthlySales([deal,legacy], '2026-12-15','2027-01-10','EUR').map(m => [m.key,m.total]), [['2026-12',0],['2027-01',150]]);
 assert.deepEqual(monthlySales([deal], '2026-02-01','2026-01-01','EUR'), []);
});
test('invalid and zero amounts preserve counts without corrupting totals', () => {
 const [month] = monthlySales([{...deal,value:'invalid'}, {...deal,id:'free',value:0}], '2026-01-01','2026-01-31','EUR');
 assert.equal(month.total,0); assert.equal(month.deals.length,2);
});
