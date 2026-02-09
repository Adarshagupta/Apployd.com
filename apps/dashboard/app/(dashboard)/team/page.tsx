'use client';

import { useEffect, useState } from 'react';

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

export default function TeamPage() {
  const { selectedOrganizationId } = useWorkspaceContext();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('developer');
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState('Manage organization RBAC.');

  const loadMembers = async () => {
    if (!selectedOrganizationId) {
      setMembers([]);
      return;
    }
    try {
      const data = await apiClient.get(`/teams/${selectedOrganizationId}/members`);
      setMembers(data.members ?? []);
      setMessage(`Loaded ${data.members?.length ?? 0} members`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  useEffect(() => {
    loadMembers().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId]);

  const invite = async () => {
    if (!selectedOrganizationId) {
      setMessage('Organization required.');
      return;
    }

    try {
      await apiClient.post('/teams/invite', {
        organizationId: selectedOrganizationId,
        email,
        role,
      });
      setEmail('');
      setMessage('Member added.');
      await loadMembers();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Team & RBAC" subtitle="Role levels: owner, admin, developer, viewer.">
        <div className="flex items-end gap-3">
          <button onClick={loadMembers} className="btn-secondary">
            Refresh
          </button>
        </div>
      </SectionCard>

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
          <button onClick={invite} className="btn-primary self-end">
            Add member
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Members">
        {members.length ? (
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

      <p className="text-sm text-slate-700">{message}</p>
    </div>
  );
}
