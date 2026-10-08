// Creates (or repairs) the four demo sign-in accounts in the Clerk development instance and links them to the demo
// restaurant's team (catalog.ts DEMO_USERS). Safe to re-run: existing accounts get their demo password reset.
//
//   pnpm demo:users          needs CLERK_SECRET_KEY (development instance, sk_test_…) and DATABASE_URL
//
// The +clerk_test email addresses are Clerk test identities: any emailed code is 424242 and nothing is sent.
// Run `pnpm demo:seed` first so the team memberships exist; this script only fills in the Clerk user ids.
import { createClerkClient } from "@clerk/backend";
import { env } from "../../src/config/env.ts";
import { pool } from "../../src/db/pool.ts";
import { DEMO, DEMO_PASSWORD, DEMO_USERS } from "./catalog.ts";

async function main() {
  const secretKey = env().CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required.");
  if (!secretKey.startsWith("sk_test_")) throw new Error("Demo accounts are only created in a Clerk development instance (sk_test_…).");
  const clerk = createClerkClient({ secretKey });

  for (const u of DEMO_USERS) {
    const found = await clerk.users.getUserList({ emailAddress: [u.email] });
    let user = found.data[0];
    if (user) {
      user = await clerk.users.updateUser(user.id, { password: DEMO_PASSWORD, skipPasswordChecks: true, firstName: u.firstName, lastName: u.lastName });
      console.log(`exists     ${u.role.padEnd(8)} ${u.email} (${user.id}) — password reset`);
    } else {
      user = await clerk.users.createUser({
        emailAddress: [u.email], username: u.username, phoneNumber: [u.phone], password: DEMO_PASSWORD, skipPasswordChecks: true,
        firstName: u.firstName, lastName: u.lastName,
      });
      console.log(`created    ${u.role.padEnd(8)} ${u.email} (${user.id})`);
    }
    // Link by email; the seed created the application user and its membership in the demo restaurant.
    await pool().query(`UPDATE users SET clerk_user_id = NULL, updated_at = now() WHERE clerk_user_id = $1 AND lower(email) <> lower($2)`, [user.id, u.email]);
    const linked = await pool().query(`UPDATE users SET clerk_user_id = $1, status = 'ACTIVE', updated_at = now() WHERE lower(email) = lower($2) RETURNING id`, [user.id, u.email]);
    if (!linked.rowCount) console.log(`           (no application user yet for ${u.email} — run pnpm demo:seed, then this again)`);
  }
  const team = await pool().query<{ email: string; role: string; clerk_user_id: string | null }>(
    `SELECT u.email, r.name AS role, u.clerk_user_id FROM tenant_memberships tm JOIN users u ON u.id = tm.user_id JOIN roles r ON r.id = tm.role_id
     WHERE tm.tenant_id = $1 AND tm.status = 'ACTIVE' ORDER BY r.name`, [DEMO.tenantId]);
  console.log(`team of ${DEMO.name}: ${team.rows.map((r) => `${r.role}=${r.email}${r.clerk_user_id ? "" : " (not linked)"}`).join(", ")}`);
  await pool().end();
}

main().catch(async (error) => {
  const details = (error as { errors?: { longMessage?: string; message?: string }[] }).errors?.map((e) => e.longMessage ?? e.message).join("; ");
  console.error(`demo:users failed: ${details || (error instanceof Error ? error.message : String(error))}`);
  await pool().end().catch(() => {});
  process.exit(1);
});
