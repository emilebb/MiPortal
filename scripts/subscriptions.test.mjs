import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase, applyFile } from './test-database.mjs';
const migration = 'supabase/migrations/20261016223142_pro_entitlements_and_payment_events.sql';
const quotaMigration = 'supabase/migrations/20261016223143_assistant_account_quota.sql';
const a = '11111111-2222-4333-8444-555555555555';
const b = '22222222-2222-4333-8444-555555555555';
const c = '33333333-2222-4333-8444-555555555555';
async function setup(t) {
  const db = await testDatabase(); t.after(() => db.close());
  await applyFile(db, 'supabase/schema.sql');
  await applyFile(db, 'supabase/migrations/20260917_pro_payments.sql');
  await db.exec(`insert into auth.users values ('${a}','admin@example.test','{}'),
    ('${b}','viewer@example.test','{}'),('${c}','other@example.test','{}');
    update public.profiles set role='admin' where id='${a}';`);
  return db;
}
test('real PostgreSQL: Pro preserves admin, annual renewal is idempotent, refunds revoke and RLS isolates users', async t => {
  const db = await setup(t);
  await applyFile(db, migration); await applyFile(db, migration);
  const approved = new Date(Date.now() - 86400000).toISOString();
  const updated = new Date(Date.now() - 3600000).toISOString();
  const pay = (uid, id, status = 'approved', timestamp = updated) => db.query(
    'select public.record_pro_payment_event($1,$2,19999,\'COP\',$3,$4,$5) as result', [uid,id,status,approved,timestamp]);
  await pay(a,'101');
  assert.equal((await db.query('select role from public.profiles where id=$1',[a])).rows[0].role,'admin');
  const expiry = async uid => (await db.query('select expires_at from public.pro_subscriptions where user_id=$1',[uid])).rows[0]?.expires_at?.toISOString();
  const first = await expiry(a);
  await Promise.all([pay(a,'101'),pay(a,'101')]);
  assert.equal(await expiry(a), first, 'duplicate delivery cannot extend the subscription');
  await pay(a,'102');
  assert.ok(Date.parse(await expiry(a)) - Date.parse(first) >= 365 * 86400000);
  await assert.rejects(pay(b,'101'),/PAYMENT_OWNER_MISMATCH/);
  await pay(a,'102','revoked',new Date().toISOString());
  assert.equal(await expiry(a),first, 'refund removes exactly the renewed period');
  await pay(a,'102','approved',new Date(Date.now()+1000).toISOString());
  assert.equal(await expiry(a),first, 'refunded payment cannot be reactivated by replay');
  await pay(b,'103');
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${b}';`);
  assert.equal((await db.query('select count(*)::int as count from public.pro_subscriptions')).rows[0].count,1);
  assert.equal((await db.query('select public.has_active_pro() as active')).rows[0].active,true);
  await assert.rejects(pay(b,'104'),/permission denied/);
  await assert.rejects(db.exec("update public.pro_subscriptions set expires_at=now()+interval '10 years'"),/permission denied/);
  await db.exec('reset role');
  await pay(b,'103','revoked',new Date().toISOString());
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${b}';`);
  assert.equal((await db.query('select public.has_active_pro() as active')).rows[0].active,false);
  await db.exec(`reset role; update public.pro_subscriptions set started_at=now()-interval '2 years',expires_at=now()-interval '1 year';
    set role authenticated; set request.jwt.claim.sub='${a}';`);
  assert.equal((await db.query('select public.has_active_pro() as active')).rows[0].active,false);
});
test('migration refuses to silently invent entitlement for legacy Pro without payment history', async t => {
  const db = await setup(t);
  await db.exec(`update public.profiles set role='pro' where id='${b}'`);
  await assert.rejects(applyFile(db,migration),/RECONCILE_LEGACY_PRO/);
  await db.exec('rollback');
  assert.equal((await db.query('select role from public.profiles where id=$1',[b])).rows[0].role,'pro');
});
test('a legacy paid Pro is migrated to a dated entitlement without retaining a commercial role',async t=>{
  const db=await setup(t);
  await db.query("select public.record_pro_payment($1,'501',19999,'COP')",[b]);
  await applyFile(db,migration);
  assert.equal((await db.query('select role from public.profiles where id=$1',[b])).rows[0].role,'viewer');
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${b}';`);
  assert.equal((await db.query('select public.has_active_pro() as active')).rows[0].active,true);
});
test('persistent quotas: distinct accounts behind one IP, same account across IPs, rolling expiry and roles', async t => {
  const db = await setup(t);
  await applyFile(db,quotaMigration); await applyFile(db,quotaMigration);
  const reserve = async (uid,ip='a'.repeat(64),session=null) => (await db.query(
    'select public.reserve_assistant_request($1,$2,$3) as quota',[uid,session,ip])).rows[0].quota;
  for(let n=0;n<5;n++) assert.equal((await reserve(a)).allowed,true);
  assert.equal((await reserve(a,'b'.repeat(64))).allowed,false, 'account quota follows the account');
  await db.exec("update private.assistant_requests set created_at=created_at-interval '2 minutes'");
  assert.equal((await reserve(b)).allowed,true,'another account on same IP has its own daily quota');
  await db.exec("update private.assistant_requests set created_at=created_at-interval '25 hours'");
  assert.equal((await reserve(a)).allowed,true,'quota expires after rolling 24 hours');
  await db.exec(`update public.profiles set role='pro' where id='${c}'`);
  for (const uid of [b,c]) {
    for(let n=0;n<5;n++) assert.equal((await reserve(uid,uid[0].repeat(64))).allowed,true);
    assert.equal((await reserve(uid,'f'.repeat(64))).allowed,false, 'same quota for free and legacy Pro');
  }
  await db.exec('set role authenticated');
  await assert.rejects(reserve(a),/permission denied/);
});
