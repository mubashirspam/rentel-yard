'use client';

import { useState } from 'react';

import { Button, FormError, Select, TextInput } from '@/components/ui/field';
import { PageHeader, Screen } from '@/components/ui/layout';
import type { StaffMember } from '@/lib/users/service';

const ROLE_LABEL: Record<StaffMember['role'], string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
};

export function UsersScreen({
  initialUsers,
  currentUserId,
}: {
  initialUsers: StaffMember[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [adding, setAdding] = useState(false);

  return (
    <Screen>
      <PageHeader
        back={{ href: '/more', label: 'More' }}
        title="Staff &amp; roles"
        subtitle="Admins run the yard. Super admins also set item rates, billing rules, and who can sign in."
      />

      <ul className="mb-6 divide-y divide-rule rounded border border-rule bg-card">
        {users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            isSelf={user.id === currentUserId}
            onChange={(updated) =>
              setUsers((all) => all.map((u) => (u.id === updated.id ? updated : u)))
            }
          />
        ))}
      </ul>

      {adding ? (
        <AddUserForm
          onCancel={() => setAdding(false)}
          onCreated={(user) => {
            setUsers((all) => [...all, user].sort((a, b) => a.name.localeCompare(b.name)));
            setAdding(false);
          }}
        />
      ) : (
        <Button onClick={() => setAdding(true)}>Add a user</Button>
      )}
    </Screen>
  );
}

function UserRow({
  user,
  isSelf,
  onChange,
}: {
  user: StaffMember;
  isSelf: boolean;
  onChange: (user: StaffMember) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function patch(body: { role?: StaffMember['role']; isActive?: boolean }) {
    setBusy(true);
    setError(undefined);

    const response = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error?.message ?? 'That did not work.');
      setBusy(false);
      return;
    }

    onChange(payload.user);
    setBusy(false);
  }

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{user.name}</span>
        {!user.isActive && (
          <span className="rounded bg-paper px-2 py-0.5 text-xs text-ink-3">Deactivated</span>
        )}
        {isSelf && <span className="text-xs text-ink-3">you</span>}
      </div>
      <p className="text-sm text-ink-3">{user.email}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          className="tap rounded border border-rule bg-card px-2 text-sm"
          value={user.role}
          disabled={busy}
          onChange={(e) => patch({ role: e.target.value as StaffMember['role'] })}
          aria-label={`Role for ${user.name}`}
        >
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => patch({ isActive: !user.isActive })}
        >
          {user.isActive ? 'Deactivate' : 'Reactivate'}
        </Button>
      </div>

      {/* §11: a user is never deleted, only deactivated — movements reference them. */}
      <FormError>{error}</FormError>
    </li>
  );
}

function AddUserForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (user: StaffMember) => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'admin' });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error?.message ?? 'Could not create that user.');
      setBusy(false);
      return;
    }

    onCreated(payload.user);
  }

  return (
    <form onSubmit={submit} noValidate className="rounded border border-rule bg-card p-5">
      <h2 className="mb-4 text-lg font-semibold">Add a user</h2>
      <FormError>{error}</FormError>

      <TextInput
        id="name"
        label="Name"
        required
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <TextInput
        id="new-email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="off"
        required
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <TextInput
        id="new-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      <Select
        id="new-role"
        label="Role"
        value={form.role}
        onChange={(e) => setForm({ ...form, role: e.target.value })}
      >
        <option value="admin">Admin — issue, return, payments, bills</option>
        <option value="super_admin">Super admin — also rates, users, settings</option>
      </Select>

      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create user'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
