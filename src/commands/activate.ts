import chalk from "chalk";
import { saveLicenseKey, checkLicense } from "../auth/license.js";

interface ActivateOptions {
  key: string;
}

export async function activate(key: string) {
  if (!key || key.trim().length === 0) {
    console.log(chalk.red("\nNo license key provided."));
    console.log(chalk.dim("Usage: sourcebook activate <key>"));
    console.log(chalk.dim("Get a key at https://sourcebook.run/pro\n"));
    process.exit(1);
  }

  console.log(chalk.bold("\nsourcebook activate"));
  console.log(chalk.dim("Validating license key...\n"));

  // Save key first
  saveLicenseKey(key);

  // Validate it
  const license = await checkLicense();

  if (license.tier === "pro" || license.tier === "team") {
    console.log(
      chalk.green("✓") +
        chalk.bold(` License activated — ${license.tier} tier`)
    );
    if (license.email) {
      console.log(chalk.dim(`  Licensed to: ${license.email}`));
    }
    if (license.expiresAt) {
      console.log(chalk.dim(`  Expires: ${license.expiresAt}`));
    }
    console.log("");
    console.log(chalk.dim("  You now have access to:"));
    console.log(chalk.dim("  · sourcebook update"));
    console.log(chalk.dim("  · sourcebook serve"));
    console.log(chalk.dim("  · sourcebook watch"));
    console.log("");
  } else {
    console.log(
      chalk.yellow("⚠") +
        " License key saved but could not be validated."
    );
    console.log(
      chalk.dim(
        "  This may be a network issue. The key will be re-validated on next use."
      )
    );
    console.log(
      chalk.dim("  If the problem persists, contact roy@maroond.ai\n")
    );
  }
}
