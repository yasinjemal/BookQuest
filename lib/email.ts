export interface TransactionalEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}

export type EmailDelivery =
  | { mode: "resend"; id: string }
  | { mode: "preview" };

/**
 * Send through Resend's HTTPS API. Without a key, local development returns a
 * preview mode; production fails closed so reset links are never silently lost.
 */
export async function sendTransactionalEmail(
  input: TransactionalEmailInput
): Promise<EmailDelivery> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Transactional email is not configured");
    }
    return { mode: "preview" };
  }
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      tags: [{ name: "category", value: "account_security" }],
    }),
  });
  const body = (await response.json()) as { id?: string; message?: string };
  if (!response.ok || !body.id) {
    throw new Error(`Email provider rejected the request (${response.status})`);
  }
  return { mode: "resend", id: body.id };
}
