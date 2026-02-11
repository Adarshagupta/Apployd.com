'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { IconCheck, IconChevronSwap, IconPlus } from './dashboard-icons';
import { useWorkspaceContext } from './workspace-provider';

/* ── Icons ──────────────────────────────────────────────── */

/* ── Create-workspace inline form ────────────────────────── */

function CreateWorkspaceForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) {
      setSlug(
        value
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 63),
      );
    }
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !slug.trim()) return;
      setSubmitting(true);
      setError('');

      try {
        const { apiClient } = await import('../lib/api');
        await apiClient.post('/organizations', { name: name.trim(), slug: slug.trim() });
        onCreated();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSubmitting(false);
      }
    },
    [name, slug, onCreated],
  );

  return (
    <form onSubmit={handleSubmit} className="ws-create-form">
      <div className="ws-create-form-title">Create Workspace</div>
      <div className="ws-create-field">
        <label className="ws-create-label" htmlFor="ws-name">
          Name
        </label>
        <input
          ref={nameRef}
          id="ws-name"
          className="ws-create-input"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="My Team"
          maxLength={120}
          required
        />
      </div>
      <div className="ws-create-field">
        <label className="ws-create-label" htmlFor="ws-slug">
          URL Slug
        </label>
        <input
          id="ws-slug"
          className="ws-create-input"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
          }}
          placeholder="my-team"
          maxLength={63}
          required
        />
      </div>
      {error && <p className="ws-create-error">{error}</p>}
      <div className="ws-create-actions">
        <button type="button" className="ws-btn-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="ws-btn-create" disabled={submitting || !name.trim() || !slug.trim()}>
          {submitting ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  );
}

/* ── Main Switcher ──────────────────────────────────────── */

export function WorkspaceSwitcher() {
  const { organizations, selectedOrganization, selectedOrganizationId, setSelectedOrganizationId, refresh } =
    useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Close on click outside */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCreate(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Close on Escape */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setShowCreate(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = (id: string) => {
    setSelectedOrganizationId(id);
    setOpen(false);
    setShowCreate(false);
  };

  const handleCreated = async () => {
    await refresh();
    setShowCreate(false);
    setOpen(false);
  };

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="ws-switcher" ref={containerRef}>
      <button className="ws-switcher-trigger" onClick={() => setOpen((v) => !v)} type="button" aria-expanded={open}>
        <span className="ws-avatar">{selectedOrganization ? initials(selectedOrganization.name) : '?'}</span>
        <span className="ws-trigger-text">
          <span className="ws-trigger-name">{selectedOrganization?.name ?? 'Select workspace'}</span>
          <span className="ws-trigger-role">{selectedOrganization?.role ?? ''}</span>
        </span>
        <span className="ws-trigger-chevron">
          <IconChevronSwap />
        </span>
      </button>

      {open && (
        <div className="ws-dropdown">
          {!showCreate ? (
            <>
              <div className="ws-dropdown-header">Workspaces</div>
              <div className="ws-dropdown-list">
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    className={`ws-dropdown-item ${org.id === selectedOrganizationId ? 'ws-dropdown-item-active' : ''}`}
                    onClick={() => handleSelect(org.id)}
                    type="button"
                  >
                    <span className="ws-avatar-sm">{initials(org.name)}</span>
                    <span className="ws-dropdown-item-text">
                      <span className="ws-dropdown-item-name">{org.name}</span>
                      <span className="ws-dropdown-item-role">{org.role}</span>
                    </span>
                    {org.id === selectedOrganizationId && (
                      <span className="ws-dropdown-check">
                        <IconCheck />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="ws-dropdown-footer">
                <button type="button" className="ws-dropdown-create" onClick={() => setShowCreate(true)}>
                  <IconPlus />
                  <span>Create Workspace</span>
                </button>
              </div>
            </>
          ) : (
            <CreateWorkspaceForm onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
          )}
        </div>
      )}
    </div>
  );
}

