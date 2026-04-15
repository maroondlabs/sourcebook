const { mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { execFileSync } = require("node:child_process");
const https = require("node:https");

/**
 * Shallow git clone of the PR head into /tmp.
 * Depth=200 gives enough history for co-change coupling without bloat.
 * Falls back to tarball download if git is unavailable or fails.
 *
 * Note: token goes in the URL — never logged because we use execFileSync
 * with array args (no shell expansion) and don't echo args on failure.
 */
async function cloneRepo(cloneUrl, token, ref) {
  const dir = mkdtempSync(join(tmpdir(), "sb-"));

  // Build authenticated URL: https://x-access-token:TOKEN@github.com/owner/repo.git
  const authedUrl = cloneUrl.replace(
    "https://",
    `https://x-access-token:${token}@`
  );

  try {
    execFileSync(
      "git",
      [
        "clone",
        "--depth=200",
        "--no-tags",
        "--quiet",
        "--single-branch",
        ...(ref ? ["--branch", ref] : []),
        authedUrl,
        dir,
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
        timeout: 45000,
      }
    );
    return dir;
  } catch (err) {
    // Sanitize: never expose the token in error messages
    const sanitized = err && err.message
      ? err.message.replace(token, "***")
      : "git clone failed";
    console.warn(`[sourcebook] git clone failed (${sanitized}); falling back to tarball`);
    return cloneViaTarball(cloneUrl, token, dir);
  }
}

/**
 * Tarball fallback. Same as the original implementation — used when git
 * is unavailable. Loses co-change analysis but keeps everything else.
 */
async function cloneViaTarball(cloneUrl, token, dir) {
  const tar = await import("tar");

  const match = cloneUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (!match) throw new Error(`Cannot parse clone URL: ${cloneUrl}`);
  const [, owner, repo] = match;
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball`;

  await new Promise((resolve, reject) => {
    const options = {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "sourcebook-review",
      },
    };

    let redirects = 0;
    function follow(url, opts) {
      https.get(url, opts, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          if (++redirects > 5) {
            reject(new Error("Too many redirects"));
            return;
          }
          return follow(res.headers.location, {
            headers: { "User-Agent": "sourcebook-review" },
          });
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Tarball download failed: ${res.statusCode}`));
          return;
        }
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

function cleanupClone(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}

module.exports = { cloneRepo, cleanupClone };
