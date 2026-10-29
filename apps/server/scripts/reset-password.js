#!/usr/bin/env node
// Usage: DATABASE_URL=... node scripts/reset-password.js <email> <new-password>
// Email delivery is not available, so this is the way to recover an account.
const bcrypt = require('bcrypt');
const postgres = require('postgres');

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || !process.env.DATABASE_URL) {
    console.error(
      'Usage: DATABASE_URL=... node scripts/reset-password.js <email> <new-password>',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);
  try {
    const hash = await bcrypt.hash(password, 12);
    const rows = await sql`
      update users
      set password = ${hash}, has_generated_password = false, updated_at = now()
      where lower(email) = lower(${email}) and deleted_at is null
      returning id`;
    if (rows.length === 0) {
      console.error(`No user found with email ${email}`);
      process.exit(1);
    }
    await sql`delete from user_sessions where user_id = ${rows[0].id}`;
    console.log(`Password updated for ${email}; existing sessions revoked.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
