import type { FastifyBaseLogger } from 'fastify';

import { env } from '../config/env.js';
import { redis } from '../lib/redis.js';

import { OrganizationInviteDeliveryService } from './organization-invite-delivery-service.js';

const INVITE_MAINTENANCE_LOCK_KEY = 'apployd:invite-maintenance:lock';

export class OrganizationInviteMaintenanceService {
  private readonly delivery = new OrganizationInviteDeliveryService();

  private timer: NodeJS.Timeout | null = null;

  private running = false;

  start(log: FastifyBaseLogger): void {
    if (this.timer) {
      return;
    }

    const intervalMs = env.INVITE_MAINTENANCE_INTERVAL_SECONDS * 1000;
    this.timer = setInterval(() => {
      void this.runCycle(log);
    }, intervalMs);
    this.timer.unref?.();

    void this.runCycle(log);
    log.info(
      { intervalSeconds: env.INVITE_MAINTENANCE_INTERVAL_SECONDS },
      'Invite maintenance scheduler started',
    );
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  private async runCycle(log: FastifyBaseLogger): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      const lockTtlSeconds = Math.max(30, env.INVITE_MAINTENANCE_INTERVAL_SECONDS - 5);
      const lockToken = `${process.pid}:${Date.now()}`;
      const lockAcquired = await redis.set(
        INVITE_MAINTENANCE_LOCK_KEY,
        lockToken,
        'NX',
        'EX',
        lockTtlSeconds,
      );
      if (!lockAcquired) {
        return;
      }

      const [expired, reminders] = await Promise.all([
        this.delivery.expirePendingInvites(),
        this.delivery.sendDueReminders(),
      ]);

      if (expired > 0 || reminders.sent > 0 || reminders.failed > 0) {
        log.info(
          {
            autoExpiredInvites: expired,
            remindersScanned: reminders.scanned,
            remindersSent: reminders.sent,
            remindersFailed: reminders.failed,
          },
          'Invite maintenance cycle completed',
        );
      }
    } catch (error) {
      log.error({ error }, 'Invite maintenance cycle failed');
    } finally {
      this.running = false;
    }
  }
}
