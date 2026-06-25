'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

// ── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

interface OrgRow {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  city: string | null;
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  createdBy: { id: string; email: string; name: string };
  approvedBy: { id: string; email: string } | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  memberCount: number;
  createdAt: string;
}

interface OrgDetail extends OrgRow {
  contactName: string;
  organizationType: string;
  registrationNumber: string | null;
  idType: string;
  idNumber: string;
  phone: string | null;
  facebookUrl: string | null;
  members: Array<{
    id: string;
    role: string;
    user: { id: string; email: string; name: string };
    joinedAt: string;
  }>;
  updatedAt: string;
}

interface ListResponse {
  data: OrgRow[];
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean };
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ApprovalStatus, string> = {
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  approved:  'bg-green-50 text-green-700 border-green-200',
  rejected:  'bg-red-50 text-red-700 border-red-200',
  suspended: 'bg-gray-100 text-gray-600 border-gray-200',
};

function DetailItem({ label, value, href }: { label: string; value?: string | null; href?: string | null }) {
  const display = value?.trim() || 'Not provided';
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      {href && value ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-violet-600 hover:underline break-words">
          {display}
        </a>
      ) : (
        <p className={`text-sm font-medium break-words ${value ? 'text-gray-900' : 'text-gray-400'}`}>{display}</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────────────

function OrgDrawer({
  orgId,
  onClose,
}: {
  orgId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState('');
  const [rejectAcknowledged, setRejectAcknowledged] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);

  const { data: org, isLoading } = useQuery<OrgDetail>({
    queryKey: ['admin-organizer', orgId],
    queryFn: () =>
      api.get<{ data: OrgDetail }>(`/admin/organizers/${orgId}`).then((r) => r.data.data),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-organizers'] });
    queryClient.invalidateQueries({ queryKey: ['admin-organizer', orgId] });
  };

  const approveMutation = useMutation({
    mutationFn: () => api.patch(`/admin/organizers/${orgId}/approve`),
    onSuccess: () => { toast.success('Organizer approved.'); invalidate(); },
    onError: () => toast.error('Could not approve. Please try again.'),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      api.patch(`/admin/organizers/${orgId}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Organizer rejected.');
      setShowRejectInput(false);
      setRejectReason('');
      setRejectAcknowledged(false);
      invalidate();
    },
    onError: () => toast.error('Could not reject. Please try again.'),
  });

  return (
    <div className="fixed inset-0 z-40 flex" aria-modal>
      {/* Backdrop */}
      <button className="flex-1 bg-black/30" onClick={onClose} aria-label="Close" />

      {/* Panel */}
      <aside className="w-full max-w-md bg-white shadow-xl flex flex-col overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Organizer application</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close drawer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoading || !org ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            Loading…
          </div>
        ) : (
          <div className="flex-1 px-6 py-5 space-y-5">
            {/* Status */}
            <div className="flex items-center gap-3">
              <StatusBadge status={org.approvalStatus} />
              {org.approvedAt && (
                <span className="text-xs text-gray-400">
                  Approved {new Date(org.approvedAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
                </span>
              )}
              {org.rejectedAt && (
                <span className="text-xs text-gray-400">
                  Rejected {new Date(org.rejectedAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
                </span>
              )}
            </div>

            {/* Org details */}
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-gray-900">{org.name}</h3>
              {org.description && <p className="text-sm text-gray-600">{org.description}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 pt-1">
                {org.city && <span>{org.city}</span>}
                {org.phone && <span>{org.phone}</span>}
                {org.website && (
                  <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">
                    {org.website}
                  </a>
                )}
              </div>
            </div>

            {/* KYC details */}
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">KYC details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailItem label="Organization name" value={org.name} />
                <DetailItem label="Organization type" value={org.organizationType} />
                <DetailItem label="Registration no." value={org.registrationNumber} />
                <DetailItem label="Contact person" value={org.contactName} />
                <DetailItem label="Contact phone" value={org.phone} />
                <DetailItem label="City" value={org.city} />
                <DetailItem label="Government ID type" value={org.idType} />
                <DetailItem label="ID number" value={org.idNumber} />
                <DetailItem label="Website" value={org.website} href={org.website} />
                <DetailItem label="Facebook page" value={org.facebookUrl} href={org.facebookUrl} />
              </div>
              <div className="mt-3">
                <DetailItem label="Description" value={org.description} />
              </div>
            </div>

            {/* Rejection reason */}
            {org.rejectionReason && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
                <p className="text-xs font-medium text-red-700 mb-0.5">Rejection reason</p>
                <p className="text-sm text-red-800">{org.rejectionReason}</p>
              </div>
            )}

            {/* Submitter */}
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted by</p>
              <p className="text-sm font-medium text-gray-900">{org.createdBy.name || '—'}</p>
              <p className="text-xs text-gray-500">{org.createdBy.email}</p>
              <p className="text-xs text-gray-400">
                {new Date(org.createdAt).toLocaleDateString('en-PH', { dateStyle: 'long' })}
              </p>
            </div>

            {/* Members */}
            {org.members.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Members</p>
                <div className="space-y-1.5">
                  {org.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-gray-800">{m.user.name || m.user.email}</span>
                        <span className="text-gray-400 text-xs ml-1.5">{m.user.email}</span>
                      </div>
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {m.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {org.approvalStatus === 'pending' && (
              <div className="pt-2 border-t border-gray-100 space-y-3">
                {!showRejectInput ? (
                  <div className="flex gap-3">
                    <button
                      onClick={() => approveMutation.mutate()}
                      disabled={approveMutation.isPending}
                      className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {approveMutation.isPending ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => setShowRejectInput(true)}
                      className="flex-1 border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">
                      Rejection reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      placeholder="Explain why this application is being rejected…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                    <label className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                      <input
                        type="checkbox"
                        checked={rejectAcknowledged}
                        onChange={(e) => setRejectAcknowledged(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                      />
                      <span>
                        I confirm this reason is clear and helpful. It will be emailed to the applicant and shown when they update their KYC details.
                      </span>
                    </label>
                    <div className="flex gap-3">
                      <button
                        onClick={() => rejectMutation.mutate(rejectReason)}
                        disabled={rejectReason.trim().length < 5 || !rejectAcknowledged || rejectMutation.isPending}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
                      </button>
                      <button
                        onClick={() => { setShowRejectInput(false); setRejectReason(''); setRejectAcknowledged(false); }}
                        className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {org.approvalStatus === 'rejected' && (
              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {approveMutation.isPending ? 'Approving…' : 'Approve anyway'}
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: '',         label: 'All' },
];

export default function AdminOrganizersPage() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ['admin-organizers', statusFilter, page],
    queryFn: () =>
      api
        .get<{ data: ListResponse }>('/admin/organizers', {
          params: { status: statusFilter || undefined, page, limit: 20 },
        })
        .then((r) => r.data.data),
  });

  const orgs = data?.data ?? [];
  const meta = data?.meta;

  function handleTabChange(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <>
      {selectedId && (
        <OrgDrawer orgId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Organizer Applications</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review and approve organizer registrations before they can create events.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                statusFilter === tab.value
                  ? 'border-violet-600 text-violet-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-sm text-gray-400 py-8">Loading…</div>
        ) : orgs.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-6 py-12 text-center">
            <p className="text-sm text-gray-500">
              {statusFilter === 'pending' ? 'No pending applications.' : 'No results.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Organization</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted by</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Applied</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {orgs.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{org.name}</p>
                      {org.city && <p className="text-xs text-gray-400">{org.city}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{org.createdBy.name || '—'}</p>
                      <p className="text-xs text-gray-400">{org.createdBy.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={org.approvalStatus} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(org.createdAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedId(org.id)}
                        className="text-violet-600 hover:text-violet-800 text-sm font-medium transition-colors"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
            <span>
              {meta.total} application{meta.total === 1 ? '' : 's'}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!meta.hasPrevPage}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!meta.hasNextPage}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
