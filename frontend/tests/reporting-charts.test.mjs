import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/reporting-charts.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { chartPoints, compactPoints, normalizeCharts } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const base = { id: 'chart', metric: 'deals', group: 'status', kind: 'pie', currency: 'USD' };
const rows = [
  {clientId:'a',clientName:'Same name',date:'2026-01-10',status:'WON',currency:'USD',value:100},
  {clientId:'a',clientName:'Same name',date:'2026-03-10',status:'WON',currency:'MXN',value:900},
  {clientId:'b',clientName:'Same name',date:'2026-01-10',status:'LOST',reason:'Price',currency:'USD',value:200},
  {clientId:'b',clientName:'Same name',date:'2026-01-11',status:'OPEN',currency:'USD',value:300},
];
test('counts won, lost and open opportunities without counting their monetary values', () => {
  assert.deepEqual(chartPoints(rows,base,'month').map(p=>[p.key,p.value]),[['WON',2],['LOST',1],['OPEN',1]]);
});
test('revenue includes only won deals in the selected currency', () => {
  assert.equal(chartPoints(rows,{...base,metric:'revenue'},'month').reduce((s,p)=>s+p.value,0),100);
  assert.equal(chartPoints(rows,{...base,metric:'revenue',currency:'MXN'},'month')[0].value,900);
});
test('clients with identical names remain separate', () => {
  assert.equal(chartPoints(rows,{...base,group:'client'},'month').length,2);
});
test('periods are ordered chronologically for curves and can aggregate by year', () => {
  assert.deepEqual(chartPoints(rows,{...base,group:'period'},'month').map(p=>p.key),['2026-01','2026-03']);
  assert.equal(chartPoints(rows,{...base,group:'period'},'year')[0].value,4);
});
test('loss reasons only include lost opportunities', () => {
  assert.deepEqual(chartPoints(rows,{...base,group:'reason'},'month'),[{key:'Price',label:'Price',value:1}]);
});
test('hours aggregate quantities while task counts include zero-hour tasks', () => {
  const tasks=[{...rows[0],status:'DONE',value:2.5},{...rows[0],status:'DONE',value:0}];
  assert.equal(chartPoints(tasks,{...base,metric:'hours'},'month')[0].value,2.5);
  assert.equal(chartPoints(tasks,{...base,metric:'tasks'},'month')[0].value,2);
});
test('large distributions retain the complete total in the Other category', () => {
  const points=Array.from({length:20},(_,i)=>({key:String(i),label:String(i),value:20-i}));
  assert.equal(compactPoints(points,'Other').length,10);
  assert.equal(compactPoints(points,'Other').reduce((s,p)=>s+p.value,0),210);
});
test('stored chart preferences are validated, bounded and support an empty layout', () => {
  assert.equal(normalizeCharts(null).length,3);
  assert.deepEqual(normalizeCharts([]),[]);
  assert.deepEqual(normalizeCharts([{...base,metric:'invalid'}]),[]);
  assert.equal(normalizeCharts([base,base]).length,1);
  assert.equal(normalizeCharts(Array.from({length:10},(_,i)=>({...base,id:String(i)}))).length,6);
});
