import Stripe from "stripe";
import crypto from "crypto";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Validate a license key by checking if it matches an active Stripe subscription.
 *
 * The key is deterministic: sb_<tier>_<hmac(subscriptionId)>
 * To validate, we list active subscriptions and check if any match.
 *
 * For scale, this should use a database cache. For launch, checking Stripe
 * directly is fine (rate limit: 100 reads/sec).
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ valid: false, tier: "free" });
  }

  // Parse key format: sb_<tier>_<hash>
  const match = key.match(/^sb_(pro|team)_([a-f0-9]{32})$/);
  if (!match) {
    return res.status(200).json({ valid: false, tier: "free" });
  }

  const tier = match[1];
  const keyHash = match[2];

  try {
    // List active subscriptions and check if any generate this key
    const subscriptions = await stripe.subscriptions.list({
      status: "active",
      limit: 100,
    });

    for (const sub of subscriptions.data) {
      const expectedHash = crypto
        .createHmac("sha256", process.env.LICENSE_SECRET || "sourcebook-default-secret")
        .update(sub.id)
        .digest("hex")
        .slice(0, 32);

      if (expectedHash === keyHash) {
        const customer = await stripe.customers.retrieve(sub.customer);
        return res.status(200).json({
          valid: true,
          tier,
          email: customer.email || undefined,
          expiresAt: new Date(sub.current_period_end * 1000).toISOString().split("T")[0],
        });
      }
    }

    return res.status(200).json({ valid: false, tier: "free" });
  } catch (err) {
    console.error("License validation error:", err);
    return res.status(500).json({ valid: false, tier: "free" });
  }
}
