const { verifySignature } = require("./lib/verify.js");
const { cloneRepo, cleanupClone } = require("./lib/clone.js");
const { formatComment } = require("./lib/format.js");
const { upsertComment } = require("./lib/comment.js");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Read raw body for signature verification
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks);

  // Verify webhook signature
  const signature = req.headers["x-hub-signature-256"];
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (secret && !verifySignature(rawBody, signature, secret)) {
    console.error("[sourcebook] Webhook signature verification failed");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = req.headers["x-github-event"];
  const payload = JSON.parse(rawBody.toString());

  // Only handle pull_request events
  if (event !== "pull_request") {
    return res.status(200).json({ ignored: true, event });
  }

  // Only handle opened and synchronize actions
  const { action } = payload;
  if (action !== "opened" && action !== "synchronize") {
    return res.status(200).json({ ignored: true, action });
  }

  const { pull_request: pr, repository, installation } = payload;
  const owner = repository.owner.login;
  const repo = repository.name;
  const prNumber = pr.number;
  const cloneUrl = repository.clone_url;

  console.log(
    `[sourcebook] Analyzing PR #${prNumber} on ${owner}/${repo} (${action})`
  );

  // Dynamic imports for ESM-only packages
  const { Octokit } = await import("octokit");
  const { createAppAuth } = await import("@octokit/auth-app");
  const { analyzeChangedFiles } = require("./lib/analyze.js");

  // Authenticate as GitHub App installation
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = Buffer.from(
    process.env.GITHUB_APP_PRIVATE_KEY || "",
    "base64"
  ).toString("utf-8");

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId: installation.id,
    },
  });

  let cloneDir;
  const startTime = Date.now();

  try {
    // Get the list of changed files from the PR
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 300,
    });

    const changedFiles = files.map((f) => f.filename);

    if (changedFiles.length === 0) {
      return res.status(200).json({ skipped: true, reason: "no changed files" });
    }

    // Skip very large PRs (>500 files) to avoid timeout
    if (changedFiles.length > 500) {
      const body = [
        "<!-- sourcebook-pr-check -->",
        "## sourcebook",
        "",
        `This PR changes ${changedFiles.length} files — too large for automated analysis.`,
        "Run \`npx sourcebook init\` locally for full analysis.",
        "",
        "---",
        "*[sourcebook](https://sourcebook.run)*",
      ].join("\n");

      await upsertComment(octokit, owner, repo, prNumber, body);
      return res.status(200).json({ posted: true, reason: "too large" });
    }

    // Generate installation token for cloning
    const { token } = await octokit.auth({
      type: "installation",
      installationId: installation.id,
    });

    // Clone the repo
    cloneDir = await cloneRepo(cloneUrl, token);

    // Run sourcebook analysis
    const analysis = await analyzeChangedFiles(cloneDir, changedFiles);

    const duration = Date.now() - startTime;

    // Format and post the comment
    const commentBody = formatComment(analysis, duration);
    const result = await upsertComment(octokit, owner, repo, prNumber, commentBody);

    console.log(
      `[sourcebook] Comment ${result.action} on PR #${prNumber} in ${(duration / 1000).toFixed(1)}s`
    );

    return res.status(200).json({
      posted: true,
      commentAction: result.action,
      commentId: result.id,
      filesAnalyzed: changedFiles.length,
      findingsCount: analysis.fileAnalysis.length,
      duration,
    });
  } catch (err) {
    console.error(`[sourcebook] Error analyzing PR #${prNumber}:`, err.message);

    // Post an error comment so the user knows something went wrong
    try {
      const errorBody = [
        "<!-- sourcebook-pr-check -->",
        "## sourcebook",
        "",
        "Analysis failed — this is likely a timeout or configuration issue.",
        `Error: \`${err.message}\``,
        "",
        "---",
        "*[sourcebook](https://sourcebook.run)*",
      ].join("\n");

      await upsertComment(octokit, owner, repo, prNumber, errorBody);
    } catch {
      // If we can't even post the error comment, just log it
    }

    return res.status(500).json({ error: err.message });
  } finally {
    if (cloneDir) {
      cleanupClone(cloneDir);
    }
  }
};

module.exports.config = {
  api: { bodyParser: false },
};
