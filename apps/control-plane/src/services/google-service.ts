import { env } from '../config/env.js';

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  scope?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfoResponse {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export interface GoogleUserSummary {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

export class GoogleService {
  isConfigured(): boolean {
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  }

  getOAuthRedirectUri(): string {
    return env.GOOGLE_OAUTH_REDIRECT_URI ?? `${env.API_BASE_URL}/api/v1/auth/google/callback`;
  }

  getAuthorizeUrl(state: string): string {
    this.assertConfigured();

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', this.getOAuthRedirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  async exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
    this.assertConfigured();

    const payload = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: this.getOAuthRedirectUri(),
      grant_type: 'authorization_code',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    });

    if (!response.ok) {
      throw new Error(`Google token exchange failed: HTTP ${response.status}`);
    }

    return (await response.json()) as GoogleTokenResponse;
  }

  async getUser(accessToken: string): Promise<GoogleUserSummary> {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Google user fetch failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as GoogleUserInfoResponse;
    if (!data.sub?.trim()) {
      throw new Error('Google did not return a user identifier.');
    }

    return {
      subject: data.sub.trim(),
      email: data.email?.trim().toLowerCase() || null,
      emailVerified: Boolean(data.email_verified),
      name: data.name?.trim() || null,
      avatarUrl: data.picture?.trim() || null,
    };
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('Google OAuth is not configured.');
    }
  }
}
