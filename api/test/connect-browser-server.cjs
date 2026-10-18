// Local browser harness. No production URL or account is accepted.
const { randomUUID, randomBytes } = require('node:crypto');
const { writeFile } = require('node:fs/promises');
const url = process.env.CONNECT_TEST_DATABASE_URL;
if (!url || !['127.0.0.1','localhost'].includes(new URL(url).hostname) || new URL(url).pathname !== '/pulse_connect_test') throw new Error('Disposable local database required');
Object.assign(process.env, { DATABASE_URL: url, NODE_ENV: 'test', STRIPE_SECRET_KEY: 'sk_test_isolated_no_network', JWT_SECRET: randomBytes(48).toString('hex'), PULSE_CONNECT_ENABLED: 'true', PULSE_CONNECT_ORIGIN: 'http://127.0.0.1:4109', PULSE_CONNECT_FRONTEND: 'http://127.0.0.1:3109', PULSE_CONNECT_CLIENT_ID: 'pulse-isolated-browser', PULSE_CONNECT_REDIRECT_URIS: 'http://127.0.0.1:3109/callback', FRONTEND_URL: 'http://127.0.0.1:3109' });
const { NestFactory } = require('@nestjs/core');
const { RequestMethod, ValidationPipe } = require('@nestjs/common');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const bcrypt = require('bcrypt');
(async () => {
 const app = await NestFactory.create(AppModule, {logger:['error','warn']});
 app.enableCors({origin:'http://127.0.0.1:3109',credentials:true});
 app.setGlobalPrefix('api', {exclude:[{path:'.well-known/oauth-authorization-server',method:RequestMethod.GET},{path:'.well-known/oauth-protected-resource/api/mcp',method:RequestMethod.GET},{path:'.well-known/oauth-protected-resource',method:RequestMethod.GET}]});
 app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidUnknownValues:false}));
 const db=app.get(PrismaService);
 const tenant=await db.tenant.create({data:{name:'Zevi isolated browser test'}});
 const email=`eduardo-test-${randomUUID()}@example.test`, password='isolated-browser-password';
 await db.user.create({data:{tenantId:tenant.id,email,name:'Eduardo Test',role:'MEMBER',password:await bcrypt.hash(password,4)}});
 const pipeline=await db.pipeline.create({data:{tenantId:tenant.id,name:'Browser sales'}});
 const stage=await db.stage.create({data:{tenantId:tenant.id,pipelineId:pipeline.id,name:'New',position:0}});
 await writeFile('/private/tmp/pulse-connect-browser.json',JSON.stringify({email,password,tenantId:tenant.id,pipelineId:pipeline.id,stageId:stage.id}),{mode:0o600});
 await app.listen(4109,'127.0.0.1');
 console.log('Isolated Pulse browser API ready on 127.0.0.1:4109');
})().catch(e=>{console.error(e.message);process.exit(1)});
