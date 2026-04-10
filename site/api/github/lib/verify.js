const crypto = require("crypto");

/**
 * Verify GitHub webhook signature using HMAC-SHA256.
 * Returns true if valid, false otherwise.
 */
function verifySignature(payload, signature, secret) {
  if (!signature || !secret) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

module.exports = { verifySignature };
