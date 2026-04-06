import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import chalk from "chalk";

const LICENSE_DIR = path.join(os.homedir(), ".sourcebook");
const LICENSE_FILE = path.join(LICENSE_DIR, "license.key");
const VALIDATION_ENDPOINT = "https://sourcebook.run/api/validate";

export interface LicenseInfo {
  valid: boolean;
  tier: "free" | "pro" | "team";
  email?: string;
  expiresAt?: string;
}

/**
 * Check if the user has a valid Pro or Team license.
 * License keys are stored in ~/.sourcebook/license.key
 *
 * Flow:
 * 1. Read key from disk
 * 2. Validate against API (with 5s timeout)
 * 3. Cache validation result for 24h to avoid hitting API every run
 */
export async function checkLicense(): Promise<LicenseInfo> {
  const key = readLicenseKey();
  if (!key) {
    return { valid: false, tier: "free" };
  }

  // Check cache first (avoid hitting API every run)
  const cached = readCache();
  if (cached && cached.key === key && !isCacheExpired(cached.timestamp)) {
    return cached.info;
  }

  // Validate against API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(VALIDATION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json() as LicenseInfo;
      writeCache(key, data);
      return data;
    }
  } catch {
    // Network error or timeout — fall back to cache or offline validation
    if (cached && cached.key === key) {
      // Only grant offline access if last validation was within 7 days
      const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - cached.timestamp <= OFFLINE_GRACE_MS) {
        return cached.info;
      }
    }
    // No valid cached validation within 7 days — deny access
  }

  return { valid: false, tier: "free" };
}

/**
 * Save a license key to disk.
 */
export function saveLicenseKey(key: string): void {
  if (!fs.existsSync(LICENSE_DIR)) {
    fs.mkdirSync(LICENSE_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(LICENSE_FILE, key.trim(), { encoding: "utf-8", mode: 0o600 });
}

/**
 * Remove the license key from disk.
 */
export function removeLicenseKey(): void {
  try {
    if (fs.existsSync(LICENSE_FILE)) {
      fs.unlinkSync(LICENSE_FILE);
    }
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Read the license key from disk.
 */
function readLicenseKey(): string | null {
  try {
    const key = fs.readFileSync(LICENSE_FILE, "utf-8").trim();
    return key || null;
  } catch {
    return null;
  }
}

/**
 * License key format: sb_pro_<32 hex chars> or sb_team_<32 hex chars>
 */
function isValidKeyFormat(key: string): boolean {
  return /^sb_(pro|team)_[a-f0-9]{32}$/.test(key);
}

// --- Cache ---

interface CacheEntry {
  key: string;
  info: LicenseInfo;
  timestamp: number;
}

const CACHE_FILE = path.join(LICENSE_DIR, ".cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function readCache(): CacheEntry | null {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    return data as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(key: string, info: LicenseInfo): void {
  if (!fs.existsSync(LICENSE_DIR)) {
    fs.mkdirSync(LICENSE_DIR, { recursive: true, mode: 0o700 });
  }
  const entry: CacheEntry = { key, info, timestamp: Date.now() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(entry), { encoding: "utf-8", mode: 0o600 });
}

function isCacheExpired(timestamp: number): boolean {
  return Date.now() - timestamp > CACHE_TTL_MS;
}

// --- Gate ---

/**
 * Gate a feature behind Pro license.
 * Prints upgrade message and exits if not licensed.
 */
export async function requirePro(feature: string): Promise<void> {
  const license = await checkLicense();
  if (license.tier === "pro" || license.tier === "team") {
    return; // Licensed, proceed
  }

  console.log("");
  console.log(
    chalk.yellow("⚡") +
      chalk.bold(` ${feature} requires sourcebook Pro`)
  );
  console.log("");
  console.log(
    chalk.dim("  sourcebook Pro includes:")
  );
  console.log(chalk.dim("  · sourcebook update (preserve manual edits)"));
  console.log(chalk.dim("  · sourcebook watch (auto-regenerate on changes)"));
  console.log(chalk.dim("  · Web demo (shareable analysis links)"));
  console.log(chalk.dim("  · Priority language support"));
  console.log("");
  console.log(
    `  ${chalk.bold("$19/mo")} → ${chalk.underline("https://sourcebook.run/pro")}`
  );
  console.log("");
  console.log(
    chalk.dim("  Already have a key? Run: sourcebook activate <key>")
  );
  console.log("");
  process.exit(0);
}
