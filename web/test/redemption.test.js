'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createRedemptionStore,fulfillPurchase} = require('../lib/redemption');
const {handleFixes, generateFixes} = require('../lib/ai-fixes');
const {issueEntitlement} = require('../lib/payment');

async function run() {
  if (!process.env.AGENTREADY_PGLITE_MODULE) throw new Error('Set AGENTREADY_PGLITE_MODULE to isolated @electric-sql/pglite for actual SQL tests');
  const {PGlite} = require(process.env.AGENTREADY_PGLITE_MODULE);
  const dir = process.env.AGENTREADY_TEST_DB || 'memory://';
  let db = new PGlite(dir);
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/20261012_agentready_redemption.sql'),'utf8'));
  await db.exec('set role service_role');
  const sqlStore = () => ({
    claim:async (h,f,o)=>(await db.query('select public.agentready_claim_v1($1,$2,$3) as result',[h,f,o])).rows[0].result,
    complete:async(h,o,r)=>(await db.query('select public.agentready_complete_v1($1,$2,$3) as result',[h,o,JSON.stringify(r)])).rows[0].result,
    fail:async(h,o,r)=>(await db.query('select public.agentready_fail_v1($1,$2,$3) as result',[h,o,r])).rows[0].result,
  });
  const request={origin:'https://example.com',score:13,grade:'F',failed:[{id:'llms-txt',label:'llms.txt',weight:20,fix:'Add it'}]};
  const result={fixes:{'llms-txt':'A usable fix'},paid:true,tier:'ai'};
  let calls=0;
  const generate=async()=>{calls++; await new Promise(r=>setTimeout(r,30));return result;};
  const hash=()=>crypto.randomBytes(32).toString('hex');
  const h=hash();
  const race=await Promise.all(Array.from({length:20},()=>fulfillPurchase({hash:h,request,store:sqlStore(),generate})));
  assert.equal(calls,1,'concurrent claims dispatch only once');
  assert.ok(race.some(r=>r.status==='completed'));
  if (dir!=='memory://') { await db.close(); db=new PGlite(dir); await db.exec('set role service_role'); }
  const again=await fulfillPurchase({hash:h,request,store:sqlStore(),generate});
  assert.equal(again.status,'completed'); assert.equal(again.cached,true); assert.equal(calls,1);
  assert.equal((await fulfillPurchase({hash:h,request:{...request,origin:'https://different.com'},store:sqlStore(),generate})).status,'conflict');
  const h2=hash();let failCalls=0;
  const failing=async()=>{failCalls++;const e=new Error('rate limited');e.retryable=true;throw e;};
  assert.equal((await fulfillPurchase({hash:h2,request,store:sqlStore(),generate:failing})).status,'retryable');
  assert.equal((await fulfillPurchase({hash:h2,request,store:sqlStore(),generate})).status,'completed');
  assert.equal(failCalls,1);
  const h3=hash();let uncertainCalls=0;
  const unknown=async()=>{uncertainCalls++;throw new Error('timeout');};
  assert.equal((await fulfillPurchase({hash:h3,request,store:sqlStore(),generate:unknown})).status,'uncertain');
  assert.equal((await fulfillPurchase({hash:h3,request,store:sqlStore(),generate:unknown})).status,'uncertain');assert.equal(uncertainCalls,1);
  const h4=hash(),fp='b'.repeat(64),old=crypto.randomUUID(),fresh=crypto.randomUUID();
  await sqlStore().claim(h4,fp,old); await sqlStore().fail(h4,old,true); await sqlStore().claim(h4,fp,fresh);
  assert.equal((await sqlStore().fail(h4,old,true)).changed,false);
  assert.equal((await sqlStore().complete(h4,old,result)).status,'conflict');
  assert.equal((await sqlStore().complete(h4,fresh,result)).status,'completed');
  const h5=hash(),s=sqlStore();let commits=0;
  const ackLost={...s,complete:async(...a)=>{commits++;await s.complete(...a);throw new Error('lost ack');}};
  const recovered=await fulfillPurchase({hash:h5,request,store:ackLost,generate});
  assert.equal(recovered.status,'completed');assert.equal(recovered.cached,true);assert.equal(commits,2);
  await db.exec('reset role; set role anon');
  await assert.rejects(()=>db.query("select public.agentready_claim_v1($1,$2,$3)",[hash(),fp,crypto.randomUUID()]),/permission denied/);
  await db.exec('reset role; set role authenticated');
  await assert.rejects(()=>db.query('select * from public.agentready_redemptions'),/permission denied/);
  await db.exec('reset role; set role service_role');
  await assert.rejects(()=>db.query('select public.agentready_complete_v1($1,$2,$3)',[hash(),crypto.randomUUID(),JSON.stringify({fixes:{},tier:'ai'})]),/invalid_result/);
  process.env.AGENTREADY_ENTITLEMENT_SECRET='test-only';process.env.PHOENIXD_PASSWORD='test-only';process.env.PHOENIXD_URL='https://payment.invalid';
  const good={isPaid:true,requestedSat:21,receivedSat:21,description:'agentready AI fixes',externalId:'agentready-v1:test'};
  const hp=hash(); const fetchPayment=async()=>({ok:true,json:async()=>good});let pc=0;
  const deps={store:sqlStore(),apiKey:'test-only',fetchPayment,generate:async()=>{pc++;return result;}};
  assert.equal((await handleFixes({...request,entitlement:issueEntitlement(hp)},deps)).body.tier,'ai');
  assert.equal((await handleFixes({...request,entitlement:issueEntitlement(hp)},deps)).body.cached,true);assert.equal(pc,1,'reissued entitlement does not re-dispatch');
  assert.equal((await handleFixes({...request,origin:'https://other.com',entitlement:issueEntitlement(hp)},deps)).httpStatus,409);
  assert.equal((await handleFixes({...request,entitlement:issueEntitlement(hash())},{...deps,store:null})).httpStatus,503);
  assert.equal((await handleFixes({...request,failed:[{id:'__proto__',label:'bad',weight:1}]},deps)).httpStatus,400);
  assert.equal((await handleFixes({...request,entitlement:'garbage'},deps)).body.tier,'free');
  await assert.rejects(()=>generateFixes(request,'key',async()=>({ok:false,status:429})),e=>e.retryable===true);
  await assert.rejects(()=>generateFixes(request,'key',async()=>({ok:false,status:500})),e=>e.retryable===false);
  await assert.rejects(()=>generateFixes(request,'key',async()=>({ok:true,json:async()=>({choices:[{message:{content:'{}'}}]})})),/invalid_provider_result/);
  let network=0;
  const rest=createRedemptionStore({url:'https://store.invalid',key:'test',fetchImpl:async()=>{network++;return {ok:false};}});
  await assert.rejects(()=>rest.claim(h,fp,fresh),/redemption_store_unavailable/);assert.equal(network,1);
  await db.close();
  console.log('PASS actual Postgres WASM: concurrency, restart persistence, reissuance, cached delivery, conflict, retryable rejection, uncertain failure, stale owner, lost ack, RLS/RPC denial; route handler and adapter controls');
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
