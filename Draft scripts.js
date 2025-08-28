import * as core from "@actions/core";
import * as github from "@actions/github";
import { Octokit } from "@octokit/action";

const token =
  core.getInput("token") && core.getInput("token") !== ""
    ? core.getInput("token")
    : process.env.GITHUB_TOKEN;

const octokit = new Octokit({ auth: `token ${token}` });
const context = github.context;
const repo = context.repo;

// -------------------- Constants --------------------
export const COMMENT_GREETING = `:robot: OpenAI`;

export const COMMENT_TAG =
  "<!-- This is an auto-generated comment by OpenAI -->";
export const COMMENT_REPLY_TAG =
  "<!-- This is an auto-generated reply by OpenAI -->";

export const SUMMARIZE_TAG =
  "<!-- This is an auto-generated comment: summarize by openai -->";

export const DESCRIPTION_TAG =
  "<!-- This is an auto-generated comment: release notes by openai -->";
export const DESCRIPTION_TAG_END =
  "<!-- end of auto-generated comment: release notes by openai -->";

// -------------------- Helpers --------------------
async function safeCall<T>(
  action: string,
  fn: () => Promise<T>,
  fallback: T | null = null
): Promise<T | null> {
  try {
    return await fn();
  } catch (e: any) {
    core.warning(`Failed to ${action}: ${e.message ?? e}`);
    return fallback;
  }
}

function buildBody(message: string, tag: string = COMMENT_TAG): string {
  return `${COMMENT_GREETING}\n\n${message}\n\n${tag}`;
}

// -------------------- Commenter Class --------------------
export class Commenter {
  /**
   * Create / replace / append / prepend a PR or issue comment
   */
  async comment(message: string, tag = COMMENT_TAG, mode: "create" | "replace" | "append" | "prepend" = "replace") {
    const target = this.getTargetNumber();
    if (!target) return;

    const body = buildBody(message, tag);

    switch (mode) {
      case "create":
        return this.create(body, target);
      case "replace":
      case "append":
      case "prepend":
        return this.upsertComment(body, tag, target, mode);
      default:
        core.warning(`Unknown mode: ${mode}, using "replace"`);
        return this.upsertComment(body, tag, target, "replace");
    }
  }

  private getTargetNumber(): number | null {
    if (context.payload.pull_request) {
      return context.payload.pull_request.number;
    }
    if (context.payload.issue) {
      return context.payload.issue.number;
    }
    core.warning("Skipped: no pull_request or issue found in context.");
    return null;
  }

  // -------------------- PR Description --------------------
  private stripDescription(description: string): string {
    const start = description.indexOf(DESCRIPTION_TAG);
    const end = description.indexOf(DESCRIPTION_TAG_END);
    if (start >= 0 && end >= 0) {
      return (
        description.slice(0, start) +
        description.slice(end + DESCRIPTION_TAG_END.length)
      );
    }
    return description;
  }

  async updateDescription(pull_number: number, message: string) {
    const pr = await safeCall("get PR", () =>
      octokit.pulls.get({ owner: repo.owner, repo: repo.repo, pull_number })
    );
    if (!pr) return;

    const current = pr.data.body ?? "";
    const cleaned = this.stripDescription(current);

    const comment = `${DESCRIPTION_TAG}\n${message}\n${DESCRIPTION_TAG_END}`;
    const newBody =
      cleaned.includes(DESCRIPTION_TAG) && cleaned.includes(DESCRIPTION_TAG_END)
        ? cleaned.replace(
            new RegExp(`${DESCRIPTION_TAG}[\\s\\S]*?${DESCRIPTION_TAG_END}`),
            comment
          )
        : `${cleaned}\n${comment}`;

    await safeCall("update PR description", () =>
      octokit.pulls.update({
        owner: repo.owner,
        repo: repo.repo,
        pull_number,
        body: newBody,
      })
    );
  }

  // -------------------- Review Comments --------------------
  async reviewComment(
    pull_number: number,
    commit_id: string,
    path: string,
    line: number,
    message: string,
    tag: string = COMMENT_TAG
  ) {
    const body = buildBody(message, tag);
    const comments = await this.getCommentsAtLine(pull_number, path, line);

    const existing = comments.find((c) => c.body.includes(tag));
    if (existing) {
      return safeCall("update review comment", () =>
        octokit.pulls.updateReviewComment({
          owner: repo.owner,
          repo: repo.repo,
          comment_id: existing.id,
          body,
        })
      );
    }

    return safeCall("create review comment", () =>
      octokit.pulls.createReviewComment({
        owner: repo.owner,
        repo: repo.repo,
        pull_number,
        body,
        commit_id,
        path,
        line,
      })
    );
  }

  async reviewCommentReply(pull_number: number, top: any, message: string) {
    const reply = buildBody(message, COMMENT_REPLY_TAG);

    // Try reply
    const res = await safeCall("reply to review comment", () =>
      octokit.pulls.createReplyForReviewComment({
        owner: repo.owner,
        repo: repo.repo,
        pull_number,
        body: reply,
        comment_id: top.id,
      })
    );

    // Try updating original top-level comment tag
    if (top.body.includes(COMMENT_TAG)) {
      const newBody = top.body.replace(COMMENT_TAG, COMMENT_REPLY_TAG);
      await safeCall("update top-level review comment", () =>
        octokit.pulls.updateReviewComment({
          owner: repo.owner,
          repo: repo.repo,
          comment_id: top.id,
          body: newBody,
        })
      );
    }

    return res;
  }

  async getCommentsAtLine(pull_number: number, path: string, line: number) {
    const comments = await this.listReviewComments(pull_number);
    return comments.filter(
      (c: any) => c.path === path && c.line === line && c.body !== ""
    );
  }

  // Conversation chain methods (same, but trimmed a bit)
  async composeConversationChain(comments: any[], top: any) {
    const chain: string[] = [];
    chain.push(`${top.user.login}: ${top.body}`);
    comments
      .filter((c) => c.in_reply_to_id === top.id)
      .forEach((c) => chain.push(`${c.user.login}: ${c.body}`));
    return chain.join("\n---\n");
  }

  async getConversationChain(pull_number: number, comment: any) {
    const comments = await this.listReviewComments(pull_number);
    let top = comment;
    while (top.in_reply_to_id) {
      const parent = comments.find((c: any) => c.id === top.in_reply_to_id);
      if (!parent) break;
      top = parent;
    }
    return {
      chain: await this.composeConversationChain(comments, top),
      topLevelComment: top,
    };
  }

  // -------------------- Comment CRUD --------------------
  private async create(body: string, target: number) {
    return safeCall("create issue comment", () =>
      octokit.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: target,
        body,
      })
    );
  }

  private async upsertComment(
    body: string,
    tag: string,
    target: number,
    mode: "replace" | "append" | "prepend"
  ) {
    const existing = await this.findCommentWithTag(tag, target);
    if (existing) {
      let newBody = body;
      if (mode === "append") newBody = `${existing.body}\n${body}`;
      if (mode === "prepend") newBody = `${body}\n${existing.body}`;
      return safeCall("update issue comment", () =>
        octokit.issues.updateComment({
          owner: repo.owner,
          repo: repo.repo,
          comment_id: existing.id,
          body: newBody,
        })
      );
    }
    return this.create(body, target);
  }

  private async findCommentWithTag(tag: string, target: number) {
    const comments = await this.listComments(target);
    return comments.find((c) => c.body?.includes(tag)) ?? null;
  }

  // -------------------- Pagination --------------------
  private async listComments(target: number) {
    const all: any[] = [];
    for (let page = 1; ; page++) {
      const res = await safeCall("list issue comments", () =>
        octokit.issues.listComments({
          owner: repo.owner,
          repo: repo.repo,
          issue_number: target,
          page,
          per_page: 100,
        })
      );
      if (!res) break;
      all.push(...res.data);
      if (res.data.length < 100) break;
    }
    return all;
  }

  private async listReviewComments(target: number) {
    const all: any[] = [];
    for (let page = 1; ; page++) {
      const res = await safeCall("list review comments", () =>
        octokit.pulls.listReviewComments({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: target,
          page,
          per_page: 100,
        })
      );
      if (!res) break;
      all.push(...res.data);
      if (res.data.length < 100) break;
    }
    return all;
  }
}
