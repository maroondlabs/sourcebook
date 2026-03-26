import fs from "node:fs";
import path from "node:path";

export async function writeOutput(
  dir: string,
  filename: string,
  content: string
): Promise<void> {
  const filePath = path.join(dir, filename);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
    throw new Error(`Output path escapes target directory: ${filename}`);
  }
  const parentDir = path.dirname(resolved);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  fs.writeFileSync(resolved, content, "utf-8");
}
