import { test, expect } from '@playwright/test';

for (const empty of [false,true]) {
  test(`dashboard shows default charts for ${empty ? 'empty' : 'active'} workspaces`, async ({page}) => {
    const user={id:'owner',tenantId:'workspace',email:'owner@example.test',name:'Owner',role:'OWNER'};
    await page.addInitScript(user=>{localStorage.setItem('localAuthSession','true');localStorage.setItem('token','test');localStorage.setItem('user',JSON.stringify(user));localStorage.setItem('o7_language','en');},user);
    const pipelines = Array.from({length:10}, (_,i)=>({id:i===0?'p':`p${i}`,name:i===0?'Sales':`Workflow ${i+1}`}));
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname.replace(/^\/api/,'');
      const data=path==='/auth/me'?{user:{userId:user.id,tenantId:user.tenantId}}:path==='/dashboard'?{clients:0,tasks:empty?{}:{PENDING:2,DONE:1},leads:{open:empty?0:1,total:empty?0:3,openByCurrency:[]},invoices:{total:0,amount:0,recent:[]}}:path==='/pipelines'?pipelines:path==='/stages'?[{id:'open',pipelineId:'p',status:'OPEN',probability:0.5},{id:'won',pipelineId:'p',status:'WON',probability:1},{id:'lost',pipelineId:'p',status:'LOST',probability:0}]:path==='/deals'?(empty?[]:['open','won','lost'].map((stageId,i)=>({id:String(i),stageId:'open',status:stageId.toUpperCase(),pipelineId:'p',value:100,currency:'USD'}))):path==='/dashboard/command-center'?Object.fromEntries(['dueToday','overdue','upcomingFollowUps','closingThisWeek','noNextAction','staleDeals'].map(k=>[k,{count:0,items:[]}])):path==='/tenant/settings'?{settings:{crmMode:'B2B',crmDisplayCurrency:'USD'}}:path==='/tenant/branding'?{branding:{}}:{};
      await route.fulfill({json:data});
    });
    await page.goto('/');
    const summary=page.locator('.card').filter({has:page.getByRole('heading',{name:'Pipelines ponderados',exact:true})});
    for(const pipeline of pipelines) await expect(summary.getByText(pipeline.name,{exact:true})).toBeVisible();
    const charts=page.getByRole('region',{name:'Your workspace at a glance'});
    await expect(charts.locator('article')).toHaveCount(3);
    if(empty) await expect(charts.getByText('No data yet. Charts will appear as your workspace becomes active.',{exact:true})).toHaveCount(3);
    else {
      await expect(charts.getByRole('img')).toHaveCount(3);
      for(const pipeline of pipelines) await expect(charts.locator('article').last().getByText(pipeline.name,{exact:true}).first()).toBeVisible();
      await expect(charts.locator('article').first().getByText('33.3%',{exact:true})).toHaveCount(3);
      await expect(charts.locator('article').last().getByText('Sales',{exact:true}).first()).toBeVisible();
    }
    await page.setViewportSize({width:390,height:844});
    await expect(charts.locator('article').first()).toBeVisible();
    const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    expect(size.scroll).toBeLessThanOrEqual(size.width+1);
    await expect(charts.getByRole('link',{name:'Customize charts in Reporting'})).toHaveAttribute('href','/admin/reporting');
  });
}
