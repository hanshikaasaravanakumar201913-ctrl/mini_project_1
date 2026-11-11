import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';
import { MedicineRecord, DataSource } from '../types';
import { ExpiryBadge } from '../components/ExpiryBadge';
import { VoiceSearchBar } from '../components/VoiceSearchBar';
import { AuthGate } from '../components/AuthGate';
import { formatDateDisplay } from '../utils/dateUtils';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  FileText,
  X,
  Pill,
  Camera,
  SlidersHorizontal,
  AlertCircle,
} from 'lucide-react';

export const CabinetPage: React.FC = () => {
  const { t } = useLanguage();
  const {
    permissions,
    medicines,
    members,
    addMedicine,
    updateMedicine,
    deleteMedicine,
    adjustMedicineQuantity,
    setSelectedMedicineForPassport,
    setActiveTab,
    activeMemberFilter,
    setActiveMemberFilter,
  } = useMedicine();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<MedicineRecord | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    medicine_name: '',
    brand: '',
    strength: '',
    dosage_form: 'Tablet',
    manufacturer: '',
    category: 'General',
    prescribed_dosage: '',
    prescription_required: false,
    batch_number: '',
    manufacturing_date: '',
    printed_expiry_date: '',
    purchase_date: '',
    opened_date: '',
    quantity: 10,
    quantity_unit: 'units',
    stock_threshold: 5,
    storage_instructions: 'Store in cool, dry place below 25°C away from direct sunlight.',
    notes: '',
    assigned_member_id: 1,
    data_source: 'MANUAL' as DataSource,
    is_confirmed: true,
  });

  const canEdit = !permissions || permissions.can_edit_medicines;

  const openAddModal = () => {
    setEditingMed(null);
    setErrorMsg(null);
    setFormData({
      medicine_name: '',
      brand: '',
      strength: '',
      dosage_form: 'Tablet',
      manufacturer: '',
      category: 'General',
      prescribed_dosage: '',
      prescription_required: false,
      batch_number: `B-${new Date().getFullYear()}-${Math.floor(Math.random() * 900) + 100}`,
      manufacturing_date: '',
      printed_expiry_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString().split('T')[0],
      purchase_date: new Date().toISOString().split('T')[0],
      opened_date: '',
      quantity: 10,
      quantity_unit: 'units',
      stock_threshold: 5,
      storage_instructions: 'Store in cool, dry place below 25°C away from direct sunlight.',
      notes: '',
      assigned_member_id: members[0]?.id || 1,
      data_source: 'MANUAL',
      is_confirmed: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (med: MedicineRecord) => {
    setEditingMed(med);
    setErrorMsg(null);
    setFormData({
      medicine_name: med.medicine_name,
      brand: med.brand || '',
      strength: med.strength || '',
      dosage_form: med.dosage_form,
      manufacturer: med.manufacturer || '',
      category: med.category || 'General',
      prescribed_dosage: med.prescribed_dosage || '',
      prescription_required: Boolean(med.prescription_required),
      batch_number: med.batch_number || '',
      manufacturing_date: med.manufacturing_date || '',
      printed_expiry_date: med.printed_expiry_date,
      purchase_date: med.purchase_date || '',
      opened_date: med.opened_date || '',
      quantity: med.quantity,
      quantity_unit: med.quantity_unit || 'units',
      stock_threshold: med.stock_threshold,
      storage_instructions: med.storage_instructions || '',
      notes: med.notes || '',
      assigned_member_id: med.assigned_member_id || members[0]?.id || 1,
      data_source: med.data_source,
      is_confirmed: med.is_confirmed,
    });
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!formData.medicine_name.trim() || !formData.printed_expiry_date) {
      setErrorMsg('Please provide at least a medicine name and printed expiry date.');
      return;
    }

    try {
      if (editingMed) {
        await updateMedicine(editingMed.id, formData);
        setFeedbackMsg(`Updated "${formData.medicine_name}".`);
      } else {
        await addMedicine(formData);
        setFeedbackMsg(`Added "${formData.medicine_name}" to household cabinet.`);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to save medicine record.');
    }
  };

  const handleQuickAdjust = async (med: MedicineRecord) => {
    const input = prompt(`Correct inventory quantity for ${med.medicine_name}:`, String(med.quantity));
    if (input === null) return;
    const parsed = Number(input);
    if (Number.isNaN(parsed) || parsed < 0) return;
    await adjustMedicineQuantity(med.id, Math.floor(parsed), 'Corrected from Cabinet');
    setFeedbackMsg(`Updated quantity for ${med.medicine_name} to ${Math.floor(parsed)}.`);
  };

  const filteredMeds = medicines.filter((m) => {
    if (m.is_disposed) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hit =
        m.medicine_name.toLowerCase().includes(q) ||
        (m.brand || '').toLowerCase().includes(q) ||
        (m.batch_number || '').toLowerCase().includes(q) ||
        (m.category || '').toLowerCase().includes(q) ||
        (m.strength || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (activeMemberFilter !== null && m.assigned_member_id !== activeMemberFilter) return false;
    if (selectedStatus !== 'ALL' && m.expiry_status !== selectedStatus) return false;
    if (lowStockOnly && m.quantity > m.stock_threshold) return false;
    return true;
  });

  return (
    <AuthGate title={t('cabinet.title')}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display">
            {t('cabinet.title')}
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-1">
            Showing {filteredMeds.length} of {medicines.filter((m) => !m.is_disposed).length} active medicines
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('scan')}
            className="medora-btn-secondary bg-surface text-brand-ink border-brand/40"
          >
            <Camera className="w-4 h-4" />
            <span>{t('nav.scan')}</span>
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={openAddModal}
              className="medora-btn-primary"
            >
              <Plus className="w-4 h-4" />
              <span>{t('cabinet.add_modal_title')}</span>
            </button>
          )}
        </div>
      </div>

      {feedbackMsg && (
        <div className="p-3 rounded-xl bg-surface border border-brand text-xs text-brand-ink font-medium">{feedbackMsg}</div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-danger/15 border border-danger text-xs text-danger-ink font-medium">{errorMsg}</div>
      )}

      {/* Search, Voice & Filter Controls */}
      <div className="p-4 medora-card space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-ink-muted absolute start-3 top-2.5" />
            <input
              type="text"
              placeholder={t('cabinet.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="medora-input ps-9"
            />
          </div>

          <select
            aria-label={t('cabinet.all_members')}
            value={activeMemberFilter ?? 'ALL'}
            onChange={(e) => setActiveMemberFilter(e.target.value === 'ALL' ? null : Number(e.target.value))}
            className="medora-select"
          >
            <option value="ALL">{t('cabinet.all_members')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.relationship_role})
              </option>
            ))}
          </select>

          <select
            aria-label={t('cabinet.all_statuses')}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="medora-select"
          >
            <option value="ALL">{t('cabinet.all_statuses')}</option>
            <option value="EXPIRED">{t('status.EXPIRED')}</option>
            <option value="EXPIRES_TODAY">{t('status.EXPIRES_TODAY')}</option>
            <option value="CRITICAL_1D">{t('status.CRITICAL_1D')}</option>
            <option value="URGENT_3D">{t('status.URGENT_3D')}</option>
            <option value="APPROACHING_5D">{t('status.APPROACHING_5D')}</option>
            <option value="NOTICE_10D">{t('status.NOTICE_10D')}</option>
            <option value="SAFE">{t('status.SAFE')}</option>
          </select>

          <label className="flex items-center gap-2 min-h-[38px] px-3 py-2 rounded-xl bg-field border border-line-strong cursor-pointer text-xs text-ink font-medium hover:border-brand transition-colors">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => setLowStockOnly(e.target.checked)}
            />
            <span>{t('cabinet.low_stock_only')}</span>
          </label>
        </div>

        <VoiceSearchBar onApplyQuery={(q) => setSearchQuery(q)} />
      </div>

      {filteredMeds.length === 0 ? (
        <div className="p-12 medora-card text-center space-y-3">
          <Pill className="w-10 h-10 text-ink-muted/60 mx-auto" />
          <h3 className="text-base font-bold text-ink">{t('cabinet.empty')}</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMeds.map((med) => {
            const isLowStock = med.quantity <= med.stock_threshold;
            return (
              <article
                key={med.id}
                className="p-5 medora-card hover:border-brand flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Primary Header: Name, Brand, Classification + Expiry Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base text-ink leading-snug">{med.medicine_name}</h3>
                      {med.brand && (
                        <span className="text-xs text-brand-ink font-semibold block mt-0.5">{med.brand}</span>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-field border border-line text-[10px] font-semibold text-ink-muted">
                          {med.category || 'General'}
                        </span>
                        {med.prescription_required && (
                          <span className="px-2 py-0.5 rounded-md bg-warning-bg text-warning-ink border border-warning/40 text-[10px] font-bold">
                            Rx
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <ExpiryBadge status={med.expiry_status} days={med.days_until_expiry} size="sm" />
                      {isLowStock && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger/15 text-danger-ink border border-danger/40 text-[10px] font-bold">
                          <AlertCircle className="w-3 h-3" />
                          <span>{t('dashboard.stat_low_stock')}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Secondary Telemetry Strip: Expiry Date & Stock Qty */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-field border border-line text-xs">
                    <div>
                      <span className="text-[10px] text-ink-muted block">{t('cabinet.label_expiry')}</span>
                      <span className="font-mono font-bold text-ink mt-0.5 block">
                        {formatDateDisplay(med.printed_expiry_date)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-ink-muted block">{t('cabinet.label_stock')}</span>
                      <span className={`font-bold mt-0.5 block ${isLowStock ? 'text-danger-ink' : 'text-brand-ink'}`}>
                        {med.quantity} {med.quantity_unit || t('common.units')}
                      </span>
                    </div>
                  </div>

                  {/* Supporting Metadata Rows */}
                  <div className="space-y-1.5 text-xs pt-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-muted">{t('cabinet.label_strength_form')}</span>
                      <span className="font-medium text-ink text-end">
                        {med.strength || t('common.na')} • {med.dosage_form}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-muted">{t('cabinet.label_batch')}</span>
                      <span className="font-mono font-bold text-ink text-end">{med.batch_number || t('common.na')}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-muted">{t('cabinet.label_member')}</span>
                      <span className="text-brand-ink font-semibold text-end">
                        {med.assigned_member ? med.assigned_member.name : t('common.none')}
                      </span>
                    </div>
                    {!med.is_confirmed && (
                      <div className="pt-1">
                        <span className="inline-block text-[10px] font-semibold bg-danger/15 text-danger-ink px-2 py-0.5 rounded border border-danger/40">
                          {t('scan.unconfirmed_badge')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Footer */}
                <div className="pt-3 border-t border-line flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMedicineForPassport(med);
                      setActiveTab('passport');
                    }}
                    className="text-brand-ink hover:underline font-bold flex items-center gap-1.5 py-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{t('nav.passport')}</span>
                  </button>

                  {canEdit && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuickAdjust(med)}
                        className="h-8 w-8 rounded-lg bg-field text-brand-ink border border-line hover:border-brand flex items-center justify-center transition-colors"
                        title="Adjust Stock Quantity"
                        aria-label="Adjust Stock Quantity"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(med)}
                        className="h-8 w-8 rounded-lg bg-field text-ink border border-line hover:border-brand flex items-center justify-center transition-colors"
                        title={t('common.edit')}
                        aria-label={t('common.edit')}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(t('common.confirm_delete'))) {
                            deleteMedicine(med.id);
                          }
                        }}
                        className="h-8 w-8 rounded-lg bg-field text-danger-ink border border-line hover:border-danger hover:bg-danger/10 flex items-center justify-center transition-colors"
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Add / Edit Medicine Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-surface border-2 border-brand p-6 shadow-elevated space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-bold text-lg text-ink font-display">
                {editingMed ? t('cabinet.edit_modal_title') : t('cabinet.add_modal_title')}
              </h3>
              <button
                type="button"
                aria-label={t('common.cancel')}
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-ink-muted hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('cabinet.field_name')}</label>
                  <input
                    type="text"
                    required
                    value={formData.medicine_name}
                    onChange={(e) => setFormData({ ...formData, medicine_name: e.target.value })}
                    className="medora-input"
                  />
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('cabinet.field_brand')}</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="medora-input"
                  />
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">Manufacturer</label>
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    className="medora-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('cabinet.field_strength')}</label>
                  <input
                    type="text"
                    value={formData.strength}
                    onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                    placeholder="650mg"
                    className="medora-input"
                  />
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('cabinet.field_form')}</label>
                  <select
                    value={formData.dosage_form}
                    onChange={(e) => setFormData({ ...formData, dosage_form: e.target.value })}
                    className="medora-select w-full"
                  >
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Inhaler">Inhaler</option>
                    <option value="Drops">Drops</option>
                    <option value="Ointment">Ointment</option>
                    <option value="Injection">Injection</option>
                  </select>
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('cabinet.field_category')}</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="medora-input"
                  />
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('cabinet.field_batch')}</label>
                  <input
                    type="text"
                    value={formData.batch_number}
                    onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                    className="medora-input font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('cabinet.field_mfg_date')}</label>
                  <input
                    type="date"
                    value={formData.manufacturing_date}
                    onChange={(e) => setFormData({ ...formData, manufacturing_date: e.target.value })}
                    className="medora-input"
                  />
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('cabinet.field_expiry')}</label>
                  <input
                    type="date"
                    required
                    value={formData.printed_expiry_date}
                    onChange={(e) => setFormData({ ...formData, printed_expiry_date: e.target.value })}
                    className="medora-input"
                  />
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('cabinet.field_quantity')} & {t('cabinet.field_unit')}</label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      min="0"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                      className="medora-input w-16 px-2"
                    />
                    <input
                      type="text"
                      value={formData.quantity_unit}
                      onChange={(e) => setFormData({ ...formData, quantity_unit: e.target.value })}
                      placeholder={t('common.units')}
                      className="medora-input flex-1 min-w-0 px-2"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('cabinet.field_threshold')}</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock_threshold}
                    onChange={(e) => setFormData({ ...formData, stock_threshold: Number(e.target.value) })}
                    className="medora-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('cabinet.field_member')}</label>
                  <select
                    value={formData.assigned_member_id}
                    onChange={(e) => setFormData({ ...formData, assigned_member_id: Number(e.target.value) })}
                    className="medora-select w-full"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.relationship_role})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('cabinet.field_dosage')}</label>
                  <input
                    type="text"
                    value={formData.prescribed_dosage}
                    onChange={(e) => setFormData({ ...formData, prescribed_dosage: e.target.value })}
                    className="medora-input"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-ink font-medium">
                <input
                  type="checkbox"
                  checked={formData.prescription_required}
                  onChange={(e) => setFormData({ ...formData, prescription_required: e.target.checked })}
                />
                <span>{t('cabinet.field_rx_required')}</span>
              </label>

              <div>
                <label className="block text-ink font-semibold mb-1">{t('cabinet.field_storage')}</label>
                <textarea
                  rows={2}
                  value={formData.storage_instructions}
                  onChange={(e) => setFormData({ ...formData, storage_instructions: e.target.value })}
                  className="medora-input py-2"
                />
              </div>

              <div className="pt-3 border-t border-line flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="medora-btn-secondary">
                  {t('common.cancel')}
                </button>
                <button type="submit" className="medora-btn-primary px-5">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </AuthGate>
  );
};
