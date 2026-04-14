import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface HooksOptions {
  dir: string;
}

/**
 * Generate Claude Code hooks configuration for sourcebook's agent harness.
 * Outputs a .claude/settings.json snippet that wires up the three intervention points:
 * 1. PreToolUse on Edit/Write — companion file detection
 * 2. Stop — completeness validation
 */
export async function hooks(options: HooksOptions) {
  const targetDir = path.resolve(options.dir);

  // Find the hooks directory relative to the sourcebook installation
  const hooksDir = findHooksDir();
  if (!hooksDir) {
    console.error(chalk.red("Could not find sourcebook hooks directory."));
    console.log("Install hooks manually from: https://github.com/maroondlabs/sourcebook/tree/main/hooks");
    process.exit(1);
  }

  const editHook = path.join(hooksDir, "preflight-edit.sh");
  const stopHook = path.join(hooksDir, "preflight-stop.sh");

  const config = {
    hooks: [
      {
        event: "PreToolUse",
        tool: "Edit",
        command: `bash ${editHook}`,
      },
      {
        event: "PreToolUse",
        tool: "Write",
        command: `bash ${editHook}`,
      },
      {
        event: "Stop",
        command: `bash ${stopHook}`,
      },
    ],
  };

  // Check if .claude/settings.json already exists
  const settingsDir = path.join(targetDir, ".claude");
  const settingsPath = path.join(settingsDir, "settings.json");

  if (fs.existsSync(settingsPath)) {
    console.log(chalk.bold("sourcebook hooks"));
    console.log("");
    console.log("Add this to your existing " + chalk.cyan(".claude/settings.json") + ":");
    console.log("");
    console.log(JSON.stringify(config, null, 2));
    console.log("");
    console.log(chalk.dim("Merge the hooks array with any existing hooks in your settings."));
  } else {
    console.log(chalk.bold("sourcebook hooks"));
    console.log("");

    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }

    fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2) + "\n");

    console.log(chalk.green("✓") + ` Created ${chalk.cyan(".claude/settings.json")} with sourcebook hooks`);
    console.log("");
    console.log("Three intervention points active:");
    console.log(`  ${chalk.cyan("PreToolUse Edit/Write")} — suggests companion files when agent edits`);
    console.log(`  ${chalk.cyan("Stop")} — validates completeness before agent declares done`);
  }

  console.log("");
  console.log(chalk.dim("The hooks use 'sourcebook preflight' to detect companion files."));
  console.log(chalk.dim("Tone is advisory: 'please inspect' — not 'you must change'."));
}

function findHooksDir(): string | null {
  // Try relative to this module (installed via npm)
  const candidates = [
    path.join(__dirname, "../../hooks"),
    path.join(__dirname, "../hooks"),
    path.join(process.cwd(), "node_modules/sourcebook/hooks"),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "preflight-edit.sh"))) {
      return dir;
    }
  }

  return null;
}
