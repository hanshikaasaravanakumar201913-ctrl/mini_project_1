import { ExpiryStatus } from '../types';

export function calculateDaysUntilExpiry(expiryDateStr: string, refDate: Date = new Date()): number {
  try {
    const cleanStr = expiryDateStr.trim().split('T')[0];
    const [year, month, day] = cleanStr.split('-').map(Number);
    const expDate = new Date(year, month - 1, day);
    
    // Reset time components for clean date-only comparison
    const today = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
    
    const diffTime = expDate.getTime() - today.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  } catch (e) {
    return 0;
  }
}

export function getExpiryStatus(days: number): ExpiryStatus {
  if (days < 0) return 'EXPIRED';
  if (days === 0) return 'EXPIRES_TODAY';
  if (days === 1) return 'CRITICAL_1D';
  if (days <= 3) return 'URGENT_3D';
  if (days <= 5) return 'APPROACHING_5D';
  if (days <= 10) return 'NOTICE_10D';
  return 'SAFE';
}

export function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  try {
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = monthNames[parseInt(parts[1], 10) - 1] || parts[1];
      const day = parts[2];
      return `${day} ${month} ${year}`;
    }
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}
