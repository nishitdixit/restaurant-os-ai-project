// Notification provider boundary (docs/NOTIFICATIONS.md). Core code depends on this interface only.
import { randomUUID } from "node:crypto";

export interface OutboundMessage {
  channel: string;
  recipient: string;
  subject: string | null;
  body: string;
  idempotencyKey: string;
}

export interface NotificationProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<{ providerReference: string }>;
}

export class TransientNotificationError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = "TransientNotificationError";
  }
}

export class PermanentNotificationError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = "PermanentNotificationError";
  }
}

/**
 * Development/pilot provider: nothing leaves the system. Messages are recorded on the notification
 * row and shown in the admin "Messages" screen. Modes let failure and retry paths be exercised:
 *  - succeed: every send succeeds;
 *  - fail: every send fails transiently (exhausts retries);
 *  - flaky: the first attempt for each message fails, the retry succeeds.
 */
export class DevelopmentNotificationProvider implements NotificationProvider {
  readonly name = "development";
  private readonly seen = new Set<string>();

  constructor(private readonly mode: "succeed" | "fail" | "flaky" = "succeed") {}

  async send(message: OutboundMessage) {
    if (!message.recipient) throw new PermanentNotificationError("No recipient.");
    if (this.mode === "fail") throw new TransientNotificationError("Development provider configured to fail.");
    if (this.mode === "flaky" && !this.seen.has(message.idempotencyKey)) {
      this.seen.add(message.idempotencyKey);
      throw new TransientNotificationError("Simulated transient provider failure.");
    }
    return { providerReference: `dev_${randomUUID()}` };
  }
}
