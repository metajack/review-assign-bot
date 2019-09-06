import { Application, Context } from 'probot'

interface AppConfig {
  reviewers: string[],
}

export = (app: Application) => {
  app.on('pull_request.opened', async (context: Context) => {
    const config: AppConfig | null = await context.config<AppConfig | null>("review-assign-bot.yml");
    if (!config) {
      throw new Error('configuration failed to load');
    }

    const pr_owner = context.payload.pull_request.user.login;
    const available_reviewers = config.reviewers.filter(i => i !== pr_owner);
    if (available_reviewers.length > 0) {
      const reviewer = available_reviewers[Math.floor(Math.random() * available_reviewers.length)];
      const params = context.issue({ reviewers: [reviewer] });
      context.github.pullRequests.createReviewRequest(params);
    }
  });
  
  app.on('issue_comment.created', async (context: Context) => {
    // Ignore bot comments
    if (context.payload.comment.user.type === "Bot") {
      return;
    }

    const repo_owner = context.payload.repository.owner.login;
    const repo_name = context.payload.repository.name;
    const num = context.payload.issue.number;
    const body = context.payload.comment.body;
    
    // Look for r? requests
    const match = /\br\?\s+@([-A-Za-z0-9_]+)/.exec(body);
    if (match && match.length > 0) {
      const reviewer = match[1];
      context.log(`review request for ${reviewer}`);
      
      // Disallow self-requests
      const issue_owner = context.payload.issue.user.login;
      if (reviewer === issue_owner) {
        context.github.issues.createComment({
          owner: repo_owner,
          repo: repo_name,
          number: num,
          body: `> ${match[0]}\n\nReviewer cannot be the pull request author.`,
        });
        return;
      }

      // Disallow non-collaborators
      try {
        await context.github.repos.checkCollaborator({
          owner: repo_owner,
          repo: repo_name,
          username: reviewer,
        });
      } catch (e) {
        context.github.issues.createComment({
          owner: repo_owner,
          repo: repo_name,
          number: num,
          body: `> ${match[0]}\n\nReviewer is not a collaborator.`,
        });
        return;
      }

      // Create the review request
      const params = context.issue({ reviewers: [reviewer] });
      context.github.pullRequests.createReviewRequest(params);
    } else {
      context.log("no review request found");
    }
  });
}
