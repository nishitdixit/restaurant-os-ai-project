import { createClerkClient, verifyToken } from "@clerk/backend";

/** Verifies a bearer session token and returns the identity-provider user id. */
export interface IdentityVerifier {
  verify(token: string): Promise<{ externalUserId: string }>;
  /** Primary verified email of the identity, used to link invited users on first sign-in. */
  verifiedEmail(externalUserId: string): Promise<string | null>;
}

export class AuthenticationError extends Error {
  readonly code = "UNAUTHENTICATED" as const;
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class ClerkIdentityVerifier implements IdentityVerifier {
  private readonly client;

  constructor(private readonly secretKey: string, private readonly authorizedParties?: string[]) {
    this.client = createClerkClient({ secretKey });
  }

  async verify(token: string) {
    try {
      const claims = await verifyToken(token, { secretKey: this.secretKey, ...(this.authorizedParties?.length ? { authorizedParties: this.authorizedParties } : {}) });
      if (!claims.sub) throw new AuthenticationError("Invalid authentication token.");
      return { externalUserId: claims.sub };
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError("Invalid or expired session. Please sign in again.");
    }
  }

  async verifiedEmail(externalUserId: string) {
    const user = await this.client.users.getUser(externalUserId);
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
    return primary && primary.verification?.status === "verified" ? primary.emailAddress.toLowerCase() : null;
  }
}

export class UnconfiguredIdentityVerifier implements IdentityVerifier {
  async verify(): Promise<never> {
    throw new AuthenticationError("Sign-in is not configured on this server (CLERK_SECRET_KEY is missing).");
  }
  async verifiedEmail() {
    return null;
  }
}
