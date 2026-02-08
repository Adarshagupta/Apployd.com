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
}
