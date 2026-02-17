import { EmailService } from './email-service.js';

type InviteRole = 'admin' | 'developer' | 'viewer';

export interface SendOrganizationInviteEmailInput {
  toEmail: string;
  organizationName: string;
  role: InviteRole;
  invitedByName?: string | null;
  invitedByEmail: string;
  loginUrl: string;
  signupUrl: string;
  expiresAt: Date;
}

export interface OrganizationInviteEmailDelivery {
  delivered: boolean;
  reason?: 'smtp_not_configured' | 'send_failed';
}

export class OrganizationInviteEmailService {
  private readonly email = new EmailService();

  async sendInvite(input: SendOrganizationInviteEmailInput): Promise<OrganizationInviteEmailDelivery> {
    if (!this.email.isConfigured()) {
      return {
        delivered: false,
        reason: 'smtp_not_configured',
      };
    }

    try {
      await this.email.send({
        to: input.toEmail,
        subject: `You are invited to join ${input.organizationName} on Apployd`,
        text: buildInviteText(input),
        html: buildInviteHtml(input),
      });
      return {
        delivered: true,
      };
    } catch {
      return {
        delivered: false,
        reason: 'send_failed',
      };
    }
  }
}

const buildInviteText = (input: SendOrganizationInviteEmailInput): string => {
  const inviter = formatInviter(input.invitedByName, input.invitedByEmail);
  const roleLabel = formatRoleLabel(input.role);
  const expires = input.expiresAt.toUTCString();

  return `Hi,

${inviter} invited you to join "${input.organizationName}" on Apployd as ${roleLabel}.

Accept invitation (existing account):
${input.loginUrl}

Sign up with this email and then accept:
${input.signupUrl}

This invitation expires on ${expires}.
If you were not expecting this, you can ignore this email.
`;
};

const buildInviteHtml = (input: SendOrganizationInviteEmailInput): string => {
  const inviter = escapeHtml(formatInviter(input.invitedByName, input.invitedByEmail));
  const roleLabel = escapeHtml(formatRoleLabel(input.role));
  const orgName = escapeHtml(input.organizationName);
  const expires = escapeHtml(input.expiresAt.toUTCString());
  const loginUrl = escapeHtml(input.loginUrl);
  const signupUrl = escapeHtml(input.signupUrl);

  return `<p>Hi,</p>
<p><strong>${inviter}</strong> invited you to join <strong>${orgName}</strong> on Apployd as <strong>${roleLabel}</strong>.</p>
<p><a href="${loginUrl}">Accept invitation</a> (if you already have an account)</p>
<p><a href="${signupUrl}">Create account and accept invitation</a> (if you are new)</p>
<p>This invitation expires on ${expires}.</p>
<p>If you were not expecting this, you can ignore this email.</p>`;
};

const formatInviter = (name: string | null | undefined, email: string): string => {
  if (name?.trim()) {
    return `${name.trim()} (${email})`;
  }
  return email;
};

const formatRoleLabel = (role: InviteRole): string => {
  if (role === 'admin') {
    return 'Admin';
  }
  if (role === 'developer') {
    return 'Developer';
  }
  return 'Viewer';
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
