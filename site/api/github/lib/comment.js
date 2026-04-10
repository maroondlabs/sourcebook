const MARKER = "<!-- sourcebook-pr-check -->";

/**
 * Find an existing sourcebook comment on a PR.
 */
async function findExistingComment(octokit, owner, repo, prNumber) {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  return comments.find((c) => c.body && c.body.includes(MARKER));
}

/**
 * Create or update the sourcebook PR comment.
 * Uses a hidden HTML marker to find and update existing comments.
 */
async function upsertComment(octokit, owner, repo, prNumber, body) {
  const existing = await findExistingComment(octokit, owner, repo, prNumber);

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    return { action: "updated", id: existing.id };
  }

  const { data: created } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
  return { action: "created", id: created.id };
}

module.exports = { upsertComment };
