const Stripe = require("stripe");
const crypto = require("crypto");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ valid: false, tier: "free" });
  }

  const match = key.match(/^sb_(pro|team)_([a-f0-9]{32})$/);
  if (!match) {
    return res.status(200).json({ valid: false, tier: "free" });
  }

  const tier = match[1];
  const keyHash = match[2];

  try {
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
    console.error("License validation error:", err.message);
    return res.status(500).json({ valid: false, tier: "free" });
  }
};
