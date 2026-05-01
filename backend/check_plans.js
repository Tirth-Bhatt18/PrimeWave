const db = require('./db');
async function check() {
  const p = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='subscription_plans'");
  const u = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='user_subscriptions'");
  const c = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='content'");
  console.log('Plans:', p.rows);
  console.log('UserSubs:', u.rows);
  console.log('Content:', c.rows);
  process.exit(0);
}
check();
