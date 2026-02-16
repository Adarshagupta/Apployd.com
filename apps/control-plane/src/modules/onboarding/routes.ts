import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';

const onboardingAnswersSchema = z.object({
  appType: z.enum(['api_backend', 'fullstack_web', 'worker_jobs', 'other']),
  deploymentExperience: z.enum(['first_time', 'used_vercel', 'used_render', 'migrating_from_other']),
  teamSize: z.enum(['solo', 'small', 'medium', 'large']),
  primaryGoal: z.enum(['ship_fast', 'stability', 'cost_control', 'team_collaboration']),
  notes: z.string().trim().max(500).optional().nullable(),
  connectGithubNow: z.boolean().optional(),
});

export const onboardingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/onboarding/status', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as { userId: string; email: string };

    const [userRecord, githubConnection] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          onboardingCompletedAt: true,
          onboardingAnswers: true,
        },
      }),
      prisma.gitHubConnection.findUnique({
        where: { userId: user.userId },
        select: { id: true },
      }),
    ]);

    return {
      completed: Boolean(userRecord?.onboardingCompletedAt),
      completedAt: userRecord?.onboardingCompletedAt ?? null,
      answers: userRecord?.onboardingAnswers ?? null,
      githubConnected: Boolean(githubConnection),
    };
  });

  app.post('/onboarding/complete', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    const body = onboardingAnswersSchema.parse(request.body);

    const updated = await prisma.user.update({
      where: { id: user.userId },
      data: {
        onboardingCompletedAt: new Date(),
        onboardingAnswers: {
          appType: body.appType,
          deploymentExperience: body.deploymentExperience,
          teamSize: body.teamSize,
          primaryGoal: body.primaryGoal,
          ...(typeof body.notes === 'string' && body.notes.trim().length > 0
            ? { notes: body.notes.trim() }
            : {}),
          ...(typeof body.connectGithubNow === 'boolean'
            ? { connectGithubNow: body.connectGithubNow }
            : {}),
        },
      },
      select: {
        onboardingCompletedAt: true,
        onboardingAnswers: true,
      },
    });

    if (!updated.onboardingCompletedAt) {
      return reply.internalServerError('Unable to mark onboarding as complete.');
    }

    return {
      completed: true,
      completedAt: updated.onboardingCompletedAt,
      answers: updated.onboardingAnswers,
    };
  });
};
