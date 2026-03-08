import { randomUUID } from 'node:crypto';

interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
}

interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role?: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  branch?: string | null;
  runtime?: string | null;
  serviceType?: string | null;
  targetPort?: number | null;
  activeDeploymentId?: string | null;
  organizationId?: string | null;
}

export interface DeploymentCreateInput {
  projectId: string;
  environment?: 'production' | 'preview';
  domain?: string;
  gitUrl?: string;
  branch?: string;
  commitSha?: string;
  rootDirectory?: string;
  buildCommand?: string;
  startCommand?: string;
  port?: number;
  env?: Record<string, string>;
  serviceType?: 'web_service' | 'static_site' | 'python';
  outputDirectory?: string;
  idempotencyKey?: string;
}

interface CurrentUserResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    emailVerifiedAt?: string | null;
    createdAt?: string;
  };
}

interface CliLoginStartResponse {
  challengeId: string;
  verificationUrl: string;
  expiresInSeconds: number;
  pollIntervalSeconds: number;
}

type CliLoginPollResponse =
  | {
      status: 'pending';
      expiresInSeconds: number;
      pollIntervalSeconds: number;
    }
  | {
      status: 'expired';
    }
  | {
      status: 'complete';
      token: string;
      user: {
        id: string;
        email: string;
        name: string | null;
      };
    };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const toJsonText = (value: unknown): string => JSON.stringify(value, null, 2);

export class ApploydApiClient {
  private readonly baseUrl: string;

  constructor(
    private readonly token: string | undefined,
    baseUrl: string,
  ) {
    this.baseUrl = trimTrailingSlash(baseUrl);
  }

  async getCurrentUser(): Promise<CurrentUserResponse> {
    return this.request<CurrentUserResponse>('/auth/me');
  }

  async getOrganizations(): Promise<OrganizationSummary[]> {
    const response = await this.request<{ organizations?: OrganizationSummary[] }>('/organizations');
    return Array.isArray(response.organizations) ? response.organizations : [];
  }

  async getProjects(organizationId: string): Promise<ProjectSummary[]> {
    const query = new URLSearchParams({
      organizationId,
      includeUsage: 'false',
    });
    const response = await this.request<{ projects?: ProjectSummary[] }>(`/projects?${query.toString()}`);
    return Array.isArray(response.projects) ? response.projects : [];
  }

  async getRecentDeployments(organizationId: string, limit = 20): Promise<unknown[]> {
    const query = new URLSearchParams({
      organizationId,
      limit: String(limit),
    });
    const response = await this.request<{ deployments?: unknown[] }>(
      `/deployments/recent?${query.toString()}`,
    );
    return Array.isArray(response.deployments) ? response.deployments : [];
  }

  async getProjectDeployments(projectId: string): Promise<unknown[]> {
    const query = new URLSearchParams({ projectId });
    const response = await this.request<{ deployments?: unknown[] }>(`/deployments?${query.toString()}`);
    return Array.isArray(response.deployments) ? response.deployments : [];
  }

  async getDeployment(deploymentId: string): Promise<unknown> {
    return this.request(`/deployments/${encodeURIComponent(deploymentId)}`);
  }

  async createDeployment(input: DeploymentCreateInput): Promise<unknown> {
    const { idempotencyKey, ...body } = input;
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    return this.request('/deployments', {
      method: 'POST',
      headers,
      body,
    });
  }

  async cancelDeployment(deploymentId: string): Promise<unknown> {
    return this.request(`/deployments/${encodeURIComponent(deploymentId)}/cancel`, {
      method: 'POST',
      body: {},
    });
  }

  async startCliLogin(): Promise<CliLoginStartResponse> {
    return this.request<CliLoginStartResponse>('/auth/cli/start', {
      method: 'POST',
      body: {},
    });
  }

  async pollCliLogin(challengeId: string): Promise<CliLoginPollResponse> {
    const query = new URLSearchParams({ challengeId });
    return this.request<CliLoginPollResponse>(`/auth/cli/poll?${query.toString()}`);
  }

  static defaultIdempotencyKey(): string {
    return randomUUID();
  }

  static toJsonText(value: unknown): string {
    return toJsonText(value);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    let response: Response;
    try {
      const init: RequestInit = {
        method,
        headers,
      };
      if (options.body !== undefined) {
        init.body = JSON.stringify(options.body);
      }
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch (error) {
      throw new Error(
        `Unable to reach Apployd API at ${this.baseUrl}: ${(error as Error).message}`,
      );
    }

    const text = await response.text();
    let parsed: unknown = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { message: text };
      }
    }

    if (!response.ok) {
      const message =
        typeof parsed === 'object' &&
        parsed !== null &&
        'message' in parsed &&
        typeof (parsed as { message?: unknown }).message === 'string'
          ? (parsed as { message: string }).message
          : `Request failed with HTTP ${response.status}`;
      throw new ApiError(`${message} [${method} ${this.baseUrl}${path}]`, response.status);
    }

    return parsed as T;
  }
}
