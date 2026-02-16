import { createHmac, timingSafeEqual } from 'crypto';

import { env } from '../config/env.js';

interface OAuthAccessTokenResponse {
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url: string | null;
}

interface GitHubEmailItem {
  email: string;
  primary: boolean;
  verified: boolean;
}

interface GitHubRepoApiItem {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  owner: {
    login: string;
  };
  permissions?: {
    admin?: boolean;
    push?: boolean;
    pull?: boolean;
  };
}

interface GitHubWebhookApiItem {
  id: number;
  active: boolean;
  events?: string[];
  config?: {
    url?: string;
  };
}

interface GitHubCommitApiItem {
  sha?: string;
}

export interface GitHubRepoSummary {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  canAdmin: boolean;
}

export class GitHubService {
  isConfigured(): boolean {
    return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
  }

  getOAuthRedirectUri(): string {
    return env.GITHUB_OAUTH_REDIRECT_URI ?? `${env.API_BASE_URL}/api/v1/integrations/github/callback`;
  }

  getAuthorizeUrl(state: string): string {
    this.assertConfigured();

    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
    url.searchParams.set('redirect_uri', this.getOAuthRedirectUri());
    url.searchParams.set('scope', 'repo read:user user:email');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCodeForToken(code: string): Promise<OAuthAccessTokenResponse> {
    this.assertConfigured();

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: this.getOAuthRedirectUri(),
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub token exchange failed: HTTP ${response.status}`);
    }

    return (await response.json()) as OAuthAccessTokenResponse;
  }

  async getUser(accessToken: string): Promise<GitHubUser> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'apployd-control-plane',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub user fetch failed: HTTP ${response.status}`);
    }

    return (await response.json()) as GitHubUser;
  }

  async getPrimaryEmail(accessToken: string): Promise<string | null> {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'apployd-control-plane',
      },
    });

    if (!response.ok) {
      return null;
    }

    const emails = (await response.json()) as GitHubEmailItem[];
    const preferred = emails.find((item) => item.primary && item.verified)
      ?? emails.find((item) => item.verified)
      ?? emails[0];

    return preferred?.email ?? null;
  }

  async listRepositories(input: {
    accessToken: string;
    page: number;
    perPage: number;
    search?: string;
  }): Promise<{ repos: GitHubRepoSummary[]; hasNextPage: boolean }> {
    const url = new URL('https://api.github.com/user/repos');
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');
    url.searchParams.set('affiliation', 'owner,collaborator,organization_member');
    url.searchParams.set('page', String(input.page));
    url.searchParams.set('per_page', String(input.perPage + 1));

    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${input.accessToken}`,
        'User-Agent': 'apployd-control-plane',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub repo list failed: HTTP ${response.status}`);
    }

    const raw = (await response.json()) as GitHubRepoApiItem[];

    const normalized = raw
      .map((repo) => ({
        id: String(repo.id),
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
        defaultBranch: repo.default_branch,
        htmlUrl: repo.html_url,
        canAdmin: Boolean(repo.permissions?.admin || repo.permissions?.push),
      }))
      .filter((repo) =>
        input.search
          ? repo.fullName.toLowerCase().includes(input.search.toLowerCase())
          : true,
      );

    const hasNextPage = normalized.length > input.perPage;

    return {
      repos: normalized.slice(0, input.perPage),
      hasNextPage,
    };
  }

  async getBranchHeadCommitSha(input: {
    owner: string;
    repo: string;
    branch: string;
    accessToken?: string;
  }): Promise<string> {
    const owner = input.owner.trim();
    const repo = input.repo.trim();
    const branch = input.branch.trim();

    if (!owner || !repo || !branch) {
      throw new Error('Repository owner, repository name, and branch are required.');
    }

    const response = await this.githubRequest(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`,
      input.accessToken,
      { method: 'GET' },
    );

    const payload = (await response.json()) as GitHubCommitApiItem;
    const sha = payload.sha?.trim();
    if (!sha) {
      throw new Error('GitHub did not return a commit SHA for this branch.');
    }

    return sha;
  }

  async ensureRepositoryPushWebhook(input: {
    accessToken: string;
    owner: string;
    repo: string;
    webhookUrl: string;
    secret: string;
  }): Promise<{ hookId: number; created: boolean }> {
    const owner = input.owner.trim();
    const repo = input.repo.trim();
    if (!owner || !repo) {
      throw new Error('Repository owner and name are required for webhook configuration.');
    }

    const webhookUrl = normalizeWebhookUrl(input.webhookUrl);
    const hooksApiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`;

    const hooksResponse = await this.githubRequest(hooksApiUrl, input.accessToken, {
      method: 'GET',
    });
    const hooks = (await hooksResponse.json()) as GitHubWebhookApiItem[];

    const existing = hooks.find((hook) => normalizeWebhookUrl(hook.config?.url ?? '') === webhookUrl);
    const payload = {
      active: true,
      events: ['push'],
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret: input.secret,
        insecure_ssl: '0',
      },
    };

    if (existing) {
      await this.githubRequest(
        `${hooksApiUrl}/${existing.id}`,
        input.accessToken,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      );
      return { hookId: existing.id, created: false };
    }

    const createdResponse = await this.githubRequest(hooksApiUrl, input.accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const created = (await createdResponse.json()) as GitHubWebhookApiItem;
    return { hookId: created.id, created: true };
  }

  verifyWebhookSignature(payload: Buffer, signatureHeader?: string): boolean {
    if (!env.GITHUB_WEBHOOK_SECRET || !signatureHeader) {
      return false;
    }

    const expected = `sha256=${createHmac('sha256', env.GITHUB_WEBHOOK_SECRET).update(payload).digest('hex')}`;
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(signatureHeader, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, providedBuffer);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('GitHub OAuth is not configured.');
    }
  }

  private async githubRequest(url: string, accessToken: string | undefined, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers ?? {});
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('User-Agent', 'apployd-control-plane');
    headers.set('X-GitHub-Api-Version', '2022-11-28');
    if (accessToken?.trim()) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (response.ok) {
      return response;
    }

    const responseText = await response.text().catch(() => '');
    let detail = '';
    if (responseText) {
      try {
        const parsed = JSON.parse(responseText) as { message?: string };
        detail = parsed.message ?? responseText;
      } catch {
        detail = responseText;
      }
    }

    if (response.status === 401 || response.status === 403) {
      if (!accessToken) {
        throw new Error('GitHub access denied. Connect GitHub to access private repositories.');
      }
      throw new Error(`GitHub access denied (${response.status}). Reconnect GitHub and ensure repo admin access.`);
    }
    if (response.status === 404) {
      if (!accessToken) {
        throw new Error('Repository or branch not found. Connect GitHub to access private repositories.');
      }
      throw new Error('Repository not found or webhook API unavailable for your token.');
    }
    if (response.status === 422) {
      throw new Error(`GitHub rejected webhook setup: ${detail || 'Validation failed.'}`);
    }

    throw new Error(`GitHub API request failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }
}

const normalizeWebhookUrl = (value: string): string =>
  value.trim().replace(/\/+$/, '');
