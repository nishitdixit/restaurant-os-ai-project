-- Add the managed-auth provider identity without moving application identity/authorization into Clerk.
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id text;
CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_user_id_uq ON users (clerk_user_id) WHERE clerk_user_id IS NOT NULL;
