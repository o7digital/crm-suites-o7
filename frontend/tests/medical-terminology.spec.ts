import { test, expect } from '@playwright/test';
for (const [industry, language, plural] of [['HEALTHCARE_B2C','es','Pacientes'],['DENTISTRY','fr','Patients'],['PSYCHIATRY','en','Patients'],['CONSULTING','es','Clientes']]) {
  test(`${industry} uses ${plural} in ${language}`, async ({page}) => {
    let currentIndustry=industry;
    const user={id:'owner',tenantId:'workspace',email:'owner@example.test',name:'Owner',role:'OWNER'};
    await page.addInitScript(({user,language})=>{localStorage.setItem('localAuthSession','true');localStorage.setItem('token','test');localStorage.setItem('user',JSON.stringify(user));localStorage.setItem('o7_language',language);},{user,language});
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname.replace(/^\/api/,'');
      const data=path==='/auth/me'?{user:{userId:user.id,tenantId:user.tenantId}}:path==='/tenant/settings'?{settings:{industry:currentIndustry,crmMode:'B2C',crmDisplayCurrency:'USD'}}:path==='/tenant/branding'?{branding:{}}:path==='/admin/context'?{role:'OWNER'}:path==='/clients'?[{id:'patient',name:'Clientes Dental',clientStatus:'CLIENT'}]:[];
      await route.fulfill({json:data});
    });
    await page.goto('/clients');
    await expect(page.getByRole('heading',{name:plural,exact:true})).toBeVisible();
    await expect(page.getByRole('link',{name:plural,exact:true}).first()).toBeVisible();
    await expect(page.getByText('Clientes Dental',{exact:true}).first()).toBeVisible();
    currentIndustry='CONSULTING';
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('heading',{name:language==='es'?'Clientes':'Clients',exact:true})).toBeVisible();
  });
}
