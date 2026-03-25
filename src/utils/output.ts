import fs from "node:fs";
import path from "node:path";

export async function writeOutput(
  dir: string,
  filename: string,
  content: string
): Promise<void> {
  const filePath = path.join(dir, filename);
  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, "utf-8");
}
