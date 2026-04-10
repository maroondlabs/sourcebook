import path from "node:path";
import chalk from "chalk";
import { scanProject } from "../scanner/index.js";
import { generateTruthMap } from "../generators/truth.js";
import { writeOutput } from "../utils/output.js";

interface TruthOptions {
  dir: string;
}

export async function truth(options: TruthOptions) {
  const targetDir = path.resolve(options.dir);

  console.log(chalk.bold("\nsourcebook truth"));
  console.log(chalk.dim("Mapping where your codebase actually lives...\n"));

  const scan = await scanProject(targetDir);

  console.log(chalk.green("✓") + " Scanned project structure");
  console.log(
    chalk.dim(
      `  ${scan.files.length} files, ${(scan.edges ?? []).length} import edges`
    )
  );

  const html = generateTruthMap(scan);
  const filename = "repo-truth-map.html";
  await writeOutput(targetDir, filename, html);

  console.log("");
  console.log(chalk.green("✓") + ` generated repo truth map → ./${filename}`);
  console.log(
    chalk.dim("\n  open it in your browser and see where your code actually lives\n")
  );
}
