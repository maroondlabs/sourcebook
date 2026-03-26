const Stripe = require("stripe");
const crypto = require("crypto");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function generateLicenseKey(tier, subscriptionId) {
  const secret = process.env.LICENSE_SECRET;
  if (!secret) {
    throw new Error("LICENSE_SECRET environment variable is required");
  }
  const hash = crypto
    .createHmac("sha256", secret)
    .update(subscriptionId)
    .digest("hex")
    .slice(0, 32);
  return `sb_${tier}_${hash}`;
}

// Disable body parsing for webhook signature verification
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const buf = Buffer.concat(chunks);

  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const tier = session.metadata?.tier || "pro";
    const subscriptionId = session.subscription;
    const customerEmail = session.customer_details?.email;

    const licenseKey = generateLicenseKey(tier, subscriptionId);

    // Store key in Stripe subscription metadata for retrieval
    await stripe.subscriptions.update(subscriptionId, {
      metadata: { license_key: licenseKey, tier },
    });

    console.log(
      `[LICENSE] Generated key for ${customerEmail}: tier=${tier}, sub=${subscriptionId}`
    );
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    console.log(`[LICENSE] Subscription cancelled: ${subscription.id}`);
  }

  return res.status(200).json({ received: true });
};

module.exports.config = {
  api: { bodyParser: false },
};
