import type { Prisma } from '@prisma/client';

import { prisma } from '../core/prisma.js';
import { SecurityIncidentEmailNotifier } from '../notifications/security-incident-email-notifier.js';

const ACTIVE_INCIDENT_STATUSES = ['open', 'appealed', 'reviewing'] as const;
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

interface RecordBlockedIncidentInput {
  deploymentId: string;
  containerId: string;
  reasonCode: string;
  severity: string;
  title: string;
  description: string;
  evidence?: Prisma.InputJsonValue;
}

export class SecurityIncidentService {
  private readonly emailNotifier = new SecurityIncidentEmailNotifier();

  async recordAutoBlockedIncident(input: RecordBlockedIncidentInput): Promise<string | null> {
    const deployment = await prisma.deployment.findUnique({
      where: { id: input.deploymentId },
      select: {
        id: true,
        project: {
          select: {
            id: true,
            name: true,
            organizationId: true,
          },
        },
      },
    });

    if (!deployment) {
      return null;
    }

    const now = new Date();
    const dedupeSince = new Date(now.getTime() - DEDUPE_WINDOW_MS);
    const existing = await prisma.securityIncident.findFirst({
      where: {
        deploymentId: input.deploymentId,
        containerId: input.containerId,
        reasonCode: input.reasonCode,
        blocked: true,
        status: {
          in: [...ACTIVE_INCIDENT_STATUSES],
        },
        detectedAt: {
          gte: dedupeSince,
        },
      },
      orderBy: {
        detectedAt: 'desc',
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      await prisma.securityIncident
        .update({
          where: { id: existing.id },
          data: {
            severity: input.severity,
            title: input.title,
            description: input.description,
            blocked: true,
            status: 'open',
            blockedAt: now,
            resolvedAt: null,
            resolvedById: null,
            resolutionNote: null,
            ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
          },
        })
        .catch(() => undefined);

      return existing.id;
    }

    const incident = await prisma.securityIncident.create({
      data: {
        organizationId: deployment.project.organizationId,
        projectId: deployment.project.id,
        deploymentId: deployment.id,
        containerId: input.containerId,
        category: 'runtime_abuse',
        severity: input.severity,
        title: input.title,
        description: input.description,
        reasonCode: input.reasonCode,
        blocked: true,
        status: 'open',
        blockedAt: now,
        ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
      },
      select: {
        id: true,
        blockedAt: true,
      },
    });

    await this.emailNotifier
      .sendIncidentBlockedEmail({
        incidentId: incident.id,
        organizationId: deployment.project.organizationId,
        projectId: deployment.project.id,
        projectName: deployment.project.name,
        severity: input.severity,
        title: input.title,
        description: input.description,
        blockedAt: incident.blockedAt ?? now,
      })
      .catch((error) => {
        console.error('Failed to send security incident email', incident.id, error);
      });

    return incident.id;
  }
}
