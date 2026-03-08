#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { ApiError, ApploydApiClient } from './client.js';
import {
  parseArgs,
  printHelp,
  requireRuntimeToken,
  resolveRuntimeConfig,
  runLoginCommand,
  runLogoutCommand,
  runWhoAmICommand,
} from './cli.js';

const deploymentEnvironmentSchema = z.enum(['production', 'preview']);
const serviceTypeSchema = z.enum(['web_service', 'static_site', 'python']);
const deploymentEnvVarsSchema = z
  .record(
    z
      .string()
      .regex(/^[A-Z_][A-Z0-9_]*$/)
      .max(64),
    z.string().max(4096),
  )
  .optional();

const toToolText = (label: string, value: unknown): string =>
  `${label}\n\n${ApploydApiClient.toJsonText(value)}`;

const withApiErrors = async <T>(task: () => Promise<T>): Promise<T> => {
  try {
    return await task();
  } catch (error) {
    if (error instanceof ApiError) {
      throw new Error(error.message);
    }
    throw error;
  }
};

const buildServer = async () => {
  const runtimeConfig = await resolveRuntimeConfig();
  const token = requireRuntimeToken(runtimeConfig);
  const client = new ApploydApiClient(token, runtimeConfig.apiBaseUrl);
  const server = new McpServer({
    name: 'apployd-mcp',
    version: '0.1.0',
  });

  const resolveOrganizationId = async (organizationId?: string): Promise<string> => {
    if (organizationId?.trim()) {
      return organizationId.trim();
    }

    if (runtimeConfig.defaultOrganizationId) {
      return runtimeConfig.defaultOrganizationId;
    }

    const organizations = await client.getOrganizations();
    if (organizations.length === 1 && organizations[0]?.id) {
      return organizations[0].id;
    }

    throw new Error(
      'organizationId is required because the token can access multiple organizations. Set APPLOYD_DEFAULT_ORGANIZATION_ID or run login against a single-org account.',
    );
  };

  server.tool(
    'get_current_user',
    'Validate the configured Apployd token and show accessible organizations.',
    {},
    async () => {
      const [me, organizations] = await withApiErrors(() =>
        Promise.all([client.getCurrentUser(), client.getOrganizations()]),
      );
      return {
        content: [
          {
            type: 'text',
            text: toToolText('Authenticated organizations', {
              user: me.user,
              organizationCount: organizations.length,
              organizations,
            }),
          },
        ],
      };
    },
  );

  server.tool(
    'list_projects',
    'List Apployd projects for an organization.',
    {
      organizationId: z
        .string()
        .cuid()
        .optional()
        .describe(
          'Organization ID. Optional if APPLOYD_DEFAULT_ORGANIZATION_ID is set, cached from login, or the token only has one organization.',
        ),
    },
    async ({ organizationId }) => {
      const resolvedOrganizationId = await withApiErrors(() => resolveOrganizationId(organizationId));
      const projects = await withApiErrors(() => client.getProjects(resolvedOrganizationId));
      return {
        content: [
          {
            type: 'text',
            text: toToolText('Projects', {
              organizationId: resolvedOrganizationId,
              projectCount: projects.length,
              projects,
            }),
          },
        ],
      };
    },
  );

  server.tool(
    'list_recent_deployments',
    'List recent deployments for an Apployd organization.',
    {
      organizationId: z
        .string()
        .cuid()
        .optional()
        .describe(
          'Organization ID. Optional if APPLOYD_DEFAULT_ORGANIZATION_ID is set, cached from login, or the token only has one organization.',
        ),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ organizationId, limit }) => {
      const resolvedOrganizationId = await withApiErrors(() => resolveOrganizationId(organizationId));
      const deployments = await withApiErrors(() =>
        client.getRecentDeployments(resolvedOrganizationId, limit),
      );
      return {
        content: [
          {
            type: 'text',
            text: toToolText('Recent deployments', {
              organizationId: resolvedOrganizationId,
              limit,
              deploymentCount: deployments.length,
              deployments,
            }),
          },
        ],
      };
    },
  );

  server.tool(
    'list_project_deployments',
    'List recent deployments for a specific Apployd project.',
    {
      projectId: z.string().cuid(),
    },
    async ({ projectId }) => {
      const deployments = await withApiErrors(() => client.getProjectDeployments(projectId));
      return {
        content: [
          {
            type: 'text',
            text: toToolText('Project deployments', {
              projectId,
              deploymentCount: deployments.length,
              deployments,
            }),
          },
        ],
      };
    },
  );

  server.tool(
    'get_deployment',
    'Fetch full details for a deployment, including status, logs, and public URL.',
    {
      deploymentId: z.string().cuid(),
    },
    async ({ deploymentId }) => {
      const deployment = await withApiErrors(() => client.getDeployment(deploymentId));
      return {
        content: [
          {
            type: 'text',
            text: toToolText('Deployment details', deployment),
          },
        ],
      };
    },
  );

  server.tool(
    'create_deployment',
    'Queue a deployment for an Apployd project.',
    {
      projectId: z.string().cuid(),
      environment: deploymentEnvironmentSchema.default('production'),
      domain: z.string().trim().min(3).max(253).optional(),
      gitUrl: z.string().url().optional(),
      branch: z.string().trim().min(1).max(255).optional(),
      commitSha: z
        .string()
        .trim()
        .regex(/^[a-f0-9]{7,64}$/i, 'Commit SHA must be 7 to 64 hex characters')
        .optional(),
      rootDirectory: z.string().max(300).optional(),
      buildCommand: z.string().max(300).optional(),
      startCommand: z.string().min(1).max(300).optional(),
      port: z.number().int().min(1).max(65535).optional(),
      env: deploymentEnvVarsSchema,
      serviceType: serviceTypeSchema.optional(),
      outputDirectory: z.string().max(300).optional(),
      idempotencyKey: z
        .string()
        .trim()
        .min(8)
        .max(255)
        .optional()
        .describe(
          'Optional caller-supplied idempotency key. When omitted, the MCP server generates one.',
        ),
    },
    async (input) => {
      const idempotencyKey = input.idempotencyKey ?? ApploydApiClient.defaultIdempotencyKey();
      const deploymentInput = {
        projectId: input.projectId,
        environment: input.environment,
        ...(input.domain ? { domain: input.domain } : {}),
        ...(input.gitUrl ? { gitUrl: input.gitUrl } : {}),
        ...(input.branch ? { branch: input.branch } : {}),
        ...(input.commitSha ? { commitSha: input.commitSha } : {}),
        ...(input.rootDirectory ? { rootDirectory: input.rootDirectory } : {}),
        ...(input.buildCommand ? { buildCommand: input.buildCommand } : {}),
        ...(input.startCommand ? { startCommand: input.startCommand } : {}),
        ...(input.port ? { port: input.port } : {}),
        ...(input.env ? { env: input.env } : {}),
        ...(input.serviceType ? { serviceType: input.serviceType } : {}),
        ...(input.outputDirectory ? { outputDirectory: input.outputDirectory } : {}),
        idempotencyKey,
      };
      const result = await withApiErrors(() => client.createDeployment(deploymentInput));
      return {
        content: [
          {
            type: 'text',
            text: toToolText('Deployment queued', {
              idempotencyKey,
              result,
            }),
          },
        ],
      };
    },
  );

  server.tool(
    'cancel_deployment',
    'Cancel an in-progress deployment.',
    {
      deploymentId: z.string().cuid(),
    },
    async ({ deploymentId }) => {
      const result = await withApiErrors(() => client.cancelDeployment(deploymentId));
      return {
        content: [
          {
            type: 'text',
            text: toToolText('Deployment canceled', result),
          },
        ],
      };
    },
  );

  return server;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'help') {
    printHelp();
    return;
  }

  if (args.command === 'login') {
    await runLoginCommand({
      ...(args.apiBaseUrl ? { apiBaseUrl: args.apiBaseUrl } : {}),
      noOpen: args.noOpen,
    });
    return;
  }

  if (args.command === 'logout') {
    await runLogoutCommand();
    return;
  }

  if (args.command === 'whoami') {
    await runWhoAmICommand();
    return;
  }

  const server = await buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
