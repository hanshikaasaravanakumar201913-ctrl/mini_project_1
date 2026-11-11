import React, { useState } from 'react';
import { FileText, Upload, Download, Trash2, Search, ShieldAlert, Link2, Calendar } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';
import { formatDateDisplay } from '../utils/dateUtils';
import { AuthGate } from '../components/AuthGate';

export const PrescriptionsPage: React.FC = () => {
  const { t } = useLanguage();
  const {
    prescriptions,
    members,
    medicines,
    activeHouseholdId,
    permissions,
    authFetch,
    refreshFromBackend,
  } = useMedicine();

  const [searchQuery, setSearchQuery] = useState('');
  const [memberFilter, setMemberFilter] = useState<string>('ALL');
  const [title, setTitle] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [prescribedDate, setPrescribedDate] = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState('');
  const [memberId, setMemberId] = useState<string>(members[0]?.id ? String(members[0].id) : '');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  if (permissions && !permissions.can_view_prescriptions) {
    return (
      <AuthGate title={t('prescriptions.title')}>
      <div className="max-w-3xl mx-auto px-4 py-12 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-danger-ink mx-auto" />
        <h2 className="text-xl font-bold text-ink">{t('prescriptions.restricted_title')}</h2>
        <p className="text-xs text-ink-muted">
          {t('prescriptions.restricted_desc')}
        </p>
      </div>
      </AuthGate>
    );
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) {
      setErrorMsg('Please provide a title and select an image or PDF file.');
      return;
    }
    setUploading(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('prescribed_date', prescribedDate);
      if (doctorName.trim()) formData.append('doctor_name', doctorName.trim());
      if (clinicName.trim()) formData.append('clinic_name', clinicName.trim());
      if (validUntil) formData.append('valid_until', validUntil);
      if (memberId) formData.append('member_id', memberId);
      if (notes.trim()) formData.append('notes', notes.trim());
      if (activeHouseholdId) formData.append('household_id', String(activeHouseholdId));
      formData.append('file', file);

      const res = await authFetch('/api/prescriptions', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || 'Upload failed.');
      } else {
        setStatusMsg(`Prescription "${data.title}" stored privately in your vault.`);
        setTitle('');
        setDoctorName('');
        setClinicName('');
        setValidUntil('');
        setNotes('');
        setFile(null);
        await refreshFromBackend();
      }
    } catch {
      setErrorMsg('Unable to reach backend vault.');
    } finally {
      setUploading(false);
    }
  };

  const handleAuthenticatedDownload = async (id: number, filename: string) => {
    const res = await authFetch(`/api/prescriptions/${id}/download`);
    if (!res.ok) {
      setErrorMsg('Authorized download failed.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleLinkMedicine = async (prescriptionId: number, medicineId: number) => {
    if (!medicineId) return;
    const res = await authFetch(`/api/prescriptions/${prescriptionId}/link-medicine/${medicineId}`, {
      method: 'POST',
    });
    if (res.ok) {
      setStatusMsg('Linked prescription to cabinet medicine.');
      await refreshFromBackend();
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('common.confirm_delete'))) return;
    const res = await authFetch(`/api/prescriptions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await refreshFromBackend();
    } else {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.detail || 'Delete failed.');
    }
  };

  const filtered = prescriptions.filter((p) => {
    if (memberFilter !== 'ALL' && String(p.member_id || '') !== memberFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        (p.doctor_name || '').toLowerCase().includes(q) ||
        (p.clinic_name || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const canEdit = !permissions || permissions.can_edit_medicines;

  return (
    <AuthGate title={t('prescriptions.title')}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="border-b border-line pb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display">
          {t('prescriptions.title')}
        </h1>
        <p className="text-xs sm:text-sm text-ink-muted mt-1">
          Private, authenticated storage for prescription images and PDFs. Files are never exposed on public URLs.
        </p>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-surface border border-brand text-xs text-brand-ink font-medium">{statusMsg}</div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-danger/15 border border-danger text-xs text-danger-ink font-medium">{errorMsg}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Upload Form */}
        {canEdit && (
          <div className="lg:col-span-5 p-6 medora-card space-y-4">
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <Upload className="w-4 h-4 text-brand-ink" />
              <span>{t('prescriptions.upload_btn')}</span>
            </h2>

            <form onSubmit={handleUpload} className="space-y-3 text-xs">
              <div>
                <label className="block text-ink font-semibold mb-1">{t('prescriptions.field_title')}</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="medora-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('prescriptions.field_doctor')}</label>
                  <input
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    className="medora-input"
                  />
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('prescriptions.field_clinic')}</label>
                  <input
                    type="text"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    className="medora-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('prescriptions.field_date')}</label>
                  <input
                    type="date"
                    required
                    value={prescribedDate}
                    onChange={(e) => setPrescribedDate(e.target.value)}
                    className="medora-input"
                  />
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('prescriptions.field_valid_until')}</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="medora-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">Household Member</label>
                <select
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  className="medora-select w-full"
                >
                  <option value="">Household General</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.relationship_role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">File (JPG, PNG, WEBP, PDF &lt;= 10MB) *</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  capture="environment"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="medora-input py-1.5 file:me-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-brand file:text-on-brand cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="medora-input py-2"
                />
              </div>

              <button
                type="submit"
                disabled={uploading}
                className="medora-btn-primary w-full"
              >
                {uploading ? 'Uploading...' : t('prescriptions.upload_btn')}
              </button>
            </form>
          </div>
        )}

        {/* Vault Listing */}
        <div className={`${canEdit ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-4`}>
          <div className="p-4 medora-card grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="relative">
              <Search className="w-4 h-4 text-ink-muted absolute start-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('common.search')}
                className="medora-input ps-9"
              />
            </div>
            <select
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              className="medora-select"
            >
              <option value="ALL">{t('cabinet.all_members')}</option>
              {members.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 medora-card text-center space-y-2 text-xs text-ink-muted">
              <FileText className="w-8 h-8 mx-auto text-brand-ink/60" />
              <p>No prescriptions stored in this vault yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((p) => {
                const expiringSoon =
                  p.days_until_expiry !== null && p.days_until_expiry !== undefined && p.days_until_expiry <= 7;
                return (
                  <div key={p.id} className="p-5 medora-card space-y-3 text-xs">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-ink">{p.title}</h3>
                        <p className="text-brand-ink font-semibold">
                          {p.doctor_name ? `Dr. ${p.doctor_name.replace(/^Dr\.?\s*/i, '')}` : 'Physician unlisted'}
                          {p.clinic_name ? ` • ${p.clinic_name}` : ''}
                        </p>
                      </div>
                      {p.valid_until && (
                        <span
                          className={`px-2.5 py-1 rounded-full font-bold flex items-center gap-1 border ${
                            expiringSoon
                              ? 'bg-danger/15 text-danger-ink border-danger'
                              : 'bg-field text-brand-ink border-line'
                          }`}
                        >
                          <Calendar className="w-3 h-3" />
                          <span>Valid until {formatDateDisplay(p.valid_until)}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-muted">
                      <span>Date: {formatDateDisplay(p.prescribed_date)}</span>
                      {p.member_name && <span>Patient: <strong className="text-ink">{p.member_name}</strong></span>}
                      <span className="font-mono">{p.original_filename} ({Math.round(p.file_size_bytes / 1024)} KB)</span>
                    </div>

                    {p.ocr_extracted_text && (
                      <div className="p-2.5 rounded-xl bg-field border border-line text-[11px] font-mono text-ink">
                        {p.ocr_extracted_text}
                      </div>
                    )}

                    <div className="pt-2 border-t border-line flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAuthenticatedDownload(p.id, p.original_filename)}
                          className="medora-btn-primary py-1.5 min-h-[34px] px-3"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{t('prescriptions.download')}</span>
                        </button>

                        {canEdit && medicines.filter((m) => !m.is_disposed).length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Link2 className="w-3.5 h-3.5 text-brand-ink" />
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleLinkMedicine(p.id, Number(e.target.value));
                                  e.target.value = '';
                                }
                              }}
                              className="medora-select py-1.5 min-h-[34px]"
                            >
                              <option value="">{t('prescriptions.link_medicine')}</option>
                              {medicines
                                .filter((m) => !m.is_disposed)
                                .map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.medicine_name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="p-2 rounded-xl bg-field text-danger-ink border border-line hover:bg-danger/15 hover:border-danger transition-colors"
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
    </AuthGate>
  );
};
