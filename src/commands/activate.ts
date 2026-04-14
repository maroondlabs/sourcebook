import chalk from "chalk";
import { saveLicenseKey, removeLicenseKey, checkLicense } from "../auth/license.js";

interface ActivateOptions {
  key: string;
}

export async function activate(key: string) {
  if (!key || key.trim().length === 0) {
    console.log(chalk.red("\nNo license key provided."));
    console.log(chalk.dim("Usage: sourcebook activate <key>"));
    console.log(chalk.dim("Get a key at https://sourcebook.run/teams\n"));
    process.exit(1);
  }

  console.log(chalk.bold("\nsourcebook activate"));
  console.log(chalk.dim("Validating license key...\n"));

  // Validate first, only save if valid
  // Temporarily save so checkLicense can read it, then remove if invalid
  saveLicenseKey(key);
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
    console.log(chalk.dim("  · Automated PR completeness checks (GitHub App)"));
    console.log(chalk.dim("  · Private repo analysis"));
    console.log(chalk.dim("  · Team-level co-change analytics"));
    console.log("");
  } else {
    // Validation failed — remove the saved key to prevent offline bypass
    removeLicenseKey();
    console.log(
      chalk.yellow("⚠") +
        " License key could not be validated and was not saved."
    );
    console.log(
      chalk.dim(
        "  This may be a network issue. Please try again when you have an internet connection."
      )
    );
    console.log(
      chalk.dim("  If the problem persists, contact roy@maroond.ai\n")
    );
  }
}
