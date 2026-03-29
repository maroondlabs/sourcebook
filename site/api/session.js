const Stripe = require("stripe");
const crypto = require("crypto");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { session_id } = req.query;
  if (!session_id) {
    return res.status(400).json({ error: "Missing session_id" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    const subscriptionId = session.subscription;
    const tier = session.metadata?.tier || "pro";

    // Generate the same key the webhook would
    const secret = process.env.LICENSE_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "Server configuration error" });
    }
    const hash = crypto
      .createHmac("sha256", secret)
      .update(subscriptionId)
      .digest("hex")
      .slice(0, 32);
    const licenseKey = `sb_${tier}_${hash}`;

    return res.status(200).json({
      key: licenseKey,
      tier,
      email: session.customer_details?.email,
    });
  } catch (err) {
    console.error("Session retrieval error:", err.message);
    return res.status(500).json({ error: "Failed to retrieve session" });
  }
};
