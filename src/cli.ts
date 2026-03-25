#!/usr/bin/env node

import { Command } from "commander";
import { init } from "./commands/init.js";

const program = new Command();

program
  .name("sourcebook")
  .description(
    "Extract the conventions, constraints, and architectural truths your AI coding agents keep missing."
  )
  .version("0.1.0");

program
  .command("init")
  .description("Analyze a codebase and generate agent context files")
  .option("-d, --dir <path>", "Target directory to analyze", ".")
  .option(
    "-f, --format <formats>",
    "Output formats (claude,cursor,copilot,agents,json)",
    "claude"
  )
  .option(
    "--budget <tokens>",
    "Max token budget for generated context",
    "4000"
  )
  .option("--dry-run", "Preview findings without writing files")
  .action(init);

program.parse();
