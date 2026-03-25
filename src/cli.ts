#!/usr/bin/env node

import { Command } from "commander";
import { init } from "./commands/init.js";
import { update } from "./commands/update.js";
import { diff } from "./commands/diff.js";

const program = new Command();

program
  .name("sourcebook")
  .description(
    "Extract the conventions, constraints, and architectural truths your AI coding agents keep missing."
  )
  .version("0.3.0");

program
  .command("init")
  .description("Analyze a codebase and generate agent context files")
  .option("-d, --dir <path>", "Target directory to analyze", ".")
  .option(
    "-f, --format <formats>",
    "Output formats (claude,cursor,copilot,all)",
    "claude"
  )
  .option(
    "--budget <tokens>",
    "Max token budget for generated context",
    "4000"
  )
  .option("--dry-run", "Preview findings without writing files")
  .action(init);

program
  .command("update")
  .description("Re-analyze and update context files while preserving manual edits")
  .option("-d, --dir <path>", "Target directory to analyze", ".")
  .option(
    "-f, --format <formats>",
    "Output formats (claude,cursor,copilot,all)",
    "claude"
  )
  .option(
    "--budget <tokens>",
    "Max token budget for generated context",
    "4000"
  )
  .action(update);

program
  .command("diff")
  .description("Show what would change if context files were regenerated")
  .option("-d, --dir <path>", "Target directory to analyze", ".")
  .option(
    "-f, --format <formats>",
    "Output format to diff (claude,cursor,copilot)",
    "claude"
  )
  .option(
    "--budget <tokens>",
    "Max token budget for generated context",
    "4000"
  )
  .action(diff);

program.parse();
