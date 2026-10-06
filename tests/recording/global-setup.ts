import { clerkSetup } from "@clerk/testing/playwright";

// Fetches a Clerk testing token so automated sign-up/sign-in is not blocked by bot protection.
export default async function globalSetup() {
  await clerkSetup({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY, secretKey: process.env.CLERK_SECRET_KEY });
}
