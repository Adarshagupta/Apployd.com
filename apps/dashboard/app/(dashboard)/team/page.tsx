'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { SectionCard } from '../../../components/section-card';
import { apiClient } from '../../../lib/api';
import { useWorkspaceContext } from '../../../components/workspace-provider';

interface Member {
  id: string;
  role: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export default function TeamPage() {
  const { selectedOrganizationId, selectedOrganization, refresh } = useWorkspaceContext();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('developer');
  const [members, setMembers] = useState<Member[]>([]);
  const [organizationInvites, setOrganizationInvites] = useState<
    Array<{
      id: string;
      email: string;
      role: string;
      expiresAt: string;
      createdAt: string;
      invitedBy: {
        id: string;
        email: string;
        name: string | null;
      };
    }>
  >([]);
  const [myInvites, setMyInvites] = useState<
    Array<{
      id: string;
      email: string;
      role: string;
      expiresAt: string;
      createdAt: string;
      organization: {
        id: string;
        name: string;
        slug: string;
      };
      invitedBy: {
        id: string;
        email: string;
        name: string | null;
      };
    }>
  >([]);
  const [canManageInvites, setCanManageInvites] = useState(false);
  const [inviteActionId, setInviteActionId] = useState('');
  const handledInviteFromQuery = useRef('');
  const [manualInviteLinks, setManualInviteLinks] = useState<{
    loginUrl: string;
    signupUrl: string;
  } | null>(null);
  const [loading, setLoading] = useState(Boolean(selectedOrganizationId));
  const [message, setMessage] = useState('Manage organization RBAC.');

  const loadMembers = async () => {
    if (!selectedOrganizationId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiClient.get(`/teams/${selectedOrganizationId}/members`);
      setMembers(data.members ?? []);
      setOrganizationInvites(data.invites ?? []);
      setCanManageInvites(Boolean(data.permissions?.canManageInvites));
      setMessage(`Loaded ${data.members?.length ?? 0} members`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId]);

  const loadMyInvites = async () => {
    try {
      const data = await apiClient.get('/teams/invites/pending');
      setMyInvites(data.invites ?? []);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  useEffect(() => {
    loadMyInvites().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId]);

  const invite = async () => {
    if (!selectedOrganizationId) {
      setMessage('Organization required.');
      return;
    }

    try {
      const data = await apiClient.post('/teams/invite', {
        organizationId: selectedOrganizationId,
        email,
        role,
      });
      const emailDelivery = data.emailDelivery as
        | {
            delivered?: boolean;
            loginUrl?: string;
            signupUrl?: string;
          }
        | undefined;

      if (
        emailDelivery?.delivered === false
        && emailDelivery.loginUrl
        && emailDelivery.signupUrl
      ) {
        setManualInviteLinks({
          loginUrl: emailDelivery.loginUrl,
          signupUrl: emailDelivery.signupUrl,
        });
      } else {
        setManualInviteLinks(null);
      }

      setEmail('');
      setMessage(data.message ?? 'Invitation processed.');
      await loadMembers();
      await loadMyInvites();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const acceptInvite = async (inviteId: string) => {
    setInviteActionId(inviteId);
    try {
      const data = await apiClient.post(`/teams/invites/${inviteId}/accept`, {});
      setMessage(
        data.alreadyMember
          ? 'Invitation synced. You were already a member.'
          : 'Invitation accepted. Workspace membership added.',
      );
      await Promise.all([loadMyInvites(), loadMembers(), refresh()]);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setInviteActionId('');
    }
  };

  const declineInvite = async (inviteId: string) => {
    setInviteActionId(inviteId);
    try {
      await apiClient.post(`/teams/invites/${inviteId}/decline`, {});
      setMessage('Invitation declined.');
      await loadMyInvites();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setInviteActionId('');
    }
  };

  useEffect(() => {
    const inviteId = searchParams?.get('invite')?.trim() ?? '';
    if (!inviteId || handledInviteFromQuery.current === inviteId) {
      return;
    }

    const pendingInvite = myInvites.find((invite) => invite.id === inviteId);
    if (!pendingInvite) {
      return;
    }

    handledInviteFromQuery.current = inviteId;
    acceptInvite(inviteId).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myInvites, searchParams]);

  return (
    <div className="space-y-4">
      <SectionCard title="Team & RBAC" subtitle="Role levels: owner, admin, developer, viewer.">
        <div className="flex items-end gap-3">
          <button onClick={loadMembers} className="btn-secondary" disabled={loading}>
            Refresh
          </button>
        </div>
      </SectionCard>

      {myInvites.length ? (
        <SectionCard title="Invitations For You" subtitle="Accept or decline invitations sent to your account email.">
          <ul className="space-y-2">
            {myInvites.map((invite) => (
              <li key={invite.id} className="panel-muted space-y-2 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{invite.organization.name}</p>
                    <p className="text-xs text-slate-600">
                      Role: {invite.role} • Expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-slate-500">
                      Invited by {invite.invitedBy.name ?? invite.invitedBy.email}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-primary"
                      onClick={() => acceptInvite(invite.id)}
                      disabled={inviteActionId === invite.id}
                    >
                      {inviteActionId === invite.id ? 'Saving...' : 'Accept'}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => declineInvite(invite.id)}
                      disabled={inviteActionId === invite.id}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="Invite Member">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <label>
            <span className="field-label">Email</span>
            <input
              placeholder="teammate@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field-input"
            />
          </label>
          <label>
            <span className="field-label">Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value)} className="field-input">
              <option value="admin">admin</option>
              <option value="developer">developer</option>
              <option value="viewer">viewer</option>
            </select>
          </label>
          <button onClick={invite} className="btn-primary self-end" disabled={!canManageInvites}>
            Send invite
          </button>
        </div>
        {!canManageInvites ? (
          <p className="mt-2 text-xs text-slate-600">
            Only owner/admin can invite members. Your role in this workspace is {selectedOrganization?.role ?? 'unknown'}.
          </p>
        ) : null}
        {manualInviteLinks ? (
          <p className="mt-2 text-xs text-slate-700">
            Email delivery is unavailable right now.
            {' '}
            <a className="underline" href={manualInviteLinks.loginUrl}>
              Login invite link
            </a>
            {' '}
            |
            {' '}
            <a className="underline" href={manualInviteLinks.signupUrl}>
              Signup invite link
            </a>
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Members">
        {loading ? (
          <ul className="space-y-2">
            {[0, 1, 2].map((placeholder) => (
              <li key={placeholder} className="panel-muted flex items-center justify-between p-3">
                <div className="space-y-2">
                  <SkeletonBlock className="h-4 w-40 rounded" />
                  <SkeletonBlock className="h-3 w-56 rounded" />
                </div>
                <SkeletonBlock className="h-5 w-16 rounded-full" />
              </li>
            ))}
          </ul>
        ) : members.length ? (
          <ul className="space-y-2">
            {members.map((member) => (
              <li key={member.id} className="panel-muted flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{member.user.name ?? member.user.email}</p>
                  <p className="text-xs text-slate-600">{member.user.email}</p>
                </div>
                <p className="mono text-xs uppercase text-slate-700">{member.role}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">No members found.</p>
        )}
      </SectionCard>

      <SectionCard title="Pending Organization Invites">
        {organizationInvites.length ? (
          <ul className="space-y-2">
            {organizationInvites.map((invite) => (
              <li key={invite.id} className="panel-muted flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{invite.email}</p>
                  <p className="text-xs text-slate-600">
                    Role: {invite.role} • Expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-slate-500">
                    Invited by {invite.invitedBy.name ?? invite.invitedBy.email}
                  </p>
                </div>
                <p className="mono text-xs uppercase text-slate-700">pending</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">No pending invites.</p>
        )}
      </SectionCard>

      <p className="text-sm text-slate-700">{message}</p>
    </div>
  );
}
