const Stripe = require("stripe");
const crypto = require("crypto");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Simple in-memory rate limiter (per Vercel function instance)
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute per IP

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimit.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Rate limit by IP
  const ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests. Try again in a minute." });
  }

  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ valid: false, tier: "free" });
  }

  const match = key.match(/^sb_(pro|team)_([a-f0-9]{32})$/);
  if (!match) {
    return res.status(200).json({ valid: false, tier: "free" });
  }

  const keyHash = match[2];

  const secret = process.env.LICENSE_SECRET;
  if (!secret) {
    console.error("LICENSE_SECRET environment variable is not set");
    return res.status(500).json({ valid: false, tier: "free" });
  }

  try {
    const subscriptions = await stripe.subscriptions.list({
      status: "active",
      limit: 100,
    });

    for (const sub of subscriptions.data) {
      const expectedHash = crypto
        .createHmac("sha256", secret)
        .update(sub.id)
        .digest("hex")
        .slice(0, 32);

      if (expectedHash === keyHash) {
        // Get tier from Stripe metadata, not from the key format
        const actualTier = sub.metadata?.tier || "pro";
        let expiresAt;
        try {
          expiresAt = new Date(sub.current_period_end * 1000).toISOString().split("T")[0];
        } catch {
          expiresAt = "2099-12-31";
        }
        return res.status(200).json({
          valid: true,
          tier: actualTier,
          expiresAt,
        });
      }
    }

    return res.status(200).json({ valid: false, tier: "free" });
  } catch (err) {
    console.error("License validation error:", err.message);
    return res.status(500).json({ valid: false, tier: "free" });
  }
};
