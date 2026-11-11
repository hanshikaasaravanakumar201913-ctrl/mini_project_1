import React from 'react';
import { ExpiryStatus } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { AlertCircle, AlertTriangle, CheckCircle, Clock, ShieldAlert } from 'lucide-react';

interface ExpiryBadgeProps {
  status?: ExpiryStatus;
  days?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const ExpiryBadge: React.FC<ExpiryBadgeProps> = ({ status = 'SAFE', days, size = 'md' }) => {
  const { t } = useLanguage();

  let badgeClass =
    'bg-success-bg text-success-ink border-success/40 dark:bg-[#195A5F]/40 dark:text-[#12B8B0] dark:border-[#12B8B0]/30';
  let icon = <CheckCircle className="w-3.5 h-3.5 shrink-0" />;
  let label = t(`status.${status}`);

  switch (status) {
    case 'EXPIRED':
      badgeClass =
        'bg-danger text-on-danger font-bold border-danger dark:bg-[#D97F6C] dark:text-[#0E393D] dark:border-[#F3EDE6]/40';
      icon = <ShieldAlert className="w-4 h-4 shrink-0" />;
      label = days !== undefined ? `${t('status.EXPIRED')} (${Math.abs(days)}d)` : t('status.EXPIRED');
      break;

    case 'EXPIRES_TODAY':
      badgeClass =
        'bg-danger text-on-danger font-bold border-danger dark:bg-[#D97F6C]/90 dark:text-[#F3EDE6] dark:border-[#F3EDE6]';
      icon = <AlertTriangle className="w-4 h-4 shrink-0" />;
      label = t('status.EXPIRES_TODAY');
      break;

    case 'CRITICAL_1D':
      badgeClass =
        'bg-danger/15 text-danger-ink font-semibold border-danger dark:bg-[#D97F6C]/25 dark:text-[#D97F6C] dark:border-[#D97F6C]';
      icon = <AlertTriangle className="w-3.5 h-3.5 shrink-0" />;
      label = t('status.CRITICAL_1D');
      break;

    case 'URGENT_3D':
      badgeClass =
        'bg-warning-bg text-warning-ink font-semibold border-warning/70 dark:bg-[#D97F6C]/15 dark:text-[#D97F6C] dark:border-[#D97F6C]/50';
      icon = <AlertCircle className="w-3.5 h-3.5 shrink-0" />;
      label = t('status.URGENT_3D');
      break;

    case 'APPROACHING_5D':
      badgeClass =
        'bg-surface-alt text-ink border-brand dark:bg-[#195A5F] dark:text-[#F3EDE6] dark:border-[#12B8B0]';
      icon = <Clock className="w-3.5 h-3.5 shrink-0 text-brand-ink" />;
      label = t('status.APPROACHING_5D');
      break;

    case 'NOTICE_10D':
      badgeClass =
        'bg-surface-alt text-brand-ink border-brand/50 dark:bg-[#14464B] dark:text-[#12B8B0] dark:border-[#12B8B0]/60';
      icon = <Clock className="w-3.5 h-3.5 shrink-0" />;
      label = t('status.NOTICE_10D');
      break;

    case 'SAFE':
    default:
      badgeClass =
        'bg-success-bg text-success-ink border-success/40 dark:bg-[#195A5F]/40 dark:text-[#12B8B0] dark:border-[#12B8B0]/30';
      icon = <CheckCircle className="w-3.5 h-3.5 shrink-0" />;
      label = days !== undefined ? `${days}d (${t('status.SAFE')})` : t('status.SAFE');
      break;
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2',
  };

  return (
    <span className={`inline-flex items-center rounded-full border tracking-wide uppercase font-medium ${sizeClasses[size]} ${badgeClass}`}>
      {icon}
      <span>{label}</span>
    </span>
  );
};
