const { mkdtempSync, rmSync, createWriteStream } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const https = require("node:https");
const { pipeline } = require("node:stream/promises");

/**
 * Download a repo as a tarball and extract it to /tmp.
 * Pure Node.js — no git or tar binary needed.
 */
async function cloneRepo(cloneUrl, token) {
  const tar = await import("tar");
  const dir = mkdtempSync(join(tmpdir(), "sb-"));

  // Convert clone URL to tarball API URL
  const match = cloneUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (!match) throw new Error(`Cannot parse clone URL: ${cloneUrl}`);
  const [, owner, repo] = match;
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball`;

  // Download and extract in one stream pipeline
  await new Promise((resolve, reject) => {
    const options = {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "sourcebook-review",
      },
    };

    function follow(url, opts) {
      https.get(url, opts, (res) => {
        // Follow redirects (GitHub returns 302 to S3 — drop auth headers)
        if (res.statusCode === 301 || res.statusCode === 302) {
          return follow(res.headers.location, {
            headers: { "User-Agent": "sourcebook-review" },
          });
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Tarball download failed: ${res.statusCode}`));
          return;
        }
        // Pipe response through tar extract
        res
          .pipe(tar.x({ strip: 1, C: dir }))
          .on("finish", resolve)
          .on("error", reject);
      }).on("error", reject);
    }

    follow(tarballUrl, options);
  });

  return dir;
}

/**
 * Clean up a cloned repo directory.
 */
function cleanupClone(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

module.exports = { cloneRepo, cleanupClone };
