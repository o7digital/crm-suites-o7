import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const {outputText}=ts.transpileModule(readFileSync(new URL('../src/lib/medical-terminology.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {isMedicalIndustry,medicalTranslation}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('recognizes configured medical specialties and legacy healthcare industries',()=>{
 for(const industry of ['HEALTHCARE_B2C','HEALTHCARE_B2B','DENTISTRY','MEDICAL','PSYCHIATRY','Dentiste','Médecin','Psyquiatre','Psiquiatra','Dentista']) assert.equal(isMedicalIndustry(industry),true,industry);
 for(const industry of ['CONSULTING','FITNESS_WELLNESS','BEAUTY',null,'']) assert.equal(isMedicalIndustry(industry),false);
});
test('uses patient vocabulary with matching number and capitalization',()=>{
 assert.equal(medicalTranslation('nav.clients','Clientes','es',true),'Pacientes');
 assert.equal(medicalTranslation('clients.status.client','Cliente','es',true),'Paciente');
 assert.equal(medicalTranslation('dashboard.newClient','Nouveau client','fr',true),'Nouveau patient');
 assert.equal(medicalTranslation('nav.clients','Clients','en',true),'Patients');
});
test('preserves nonclinical workspaces, subscription businesses and CSV headers',()=>{
 assert.equal(medicalTranslation('nav.clients','Clientes','es',false),'Clientes');
 assert.equal(medicalTranslation('adminSubscriptions.customer','Cliente','es',true),'Cliente');
 assert.equal(medicalTranslation('clients.importModal.headersHint','Client Status','en',true),'Client Status');
});
test('preserves interpolation keys and real names inserted after translation',()=>{
 assert.equal(medicalTranslation('dashboard.clientsHint','Clientes: {clients} | {name}','es',true),'Pacientes: {clients} | {name}');
});
