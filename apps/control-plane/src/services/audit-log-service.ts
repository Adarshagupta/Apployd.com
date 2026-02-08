import { prisma } from '../lib/prisma.js';

export class AuditLogService {
  async record(input: {
    organizationId: string;
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
      },
    });
  }
}
