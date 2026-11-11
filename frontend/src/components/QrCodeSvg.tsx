import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useTheme } from '../context/ThemeContext';

interface QrCodeSvgProps {
  value: string;
  size?: number;
  label?: string;
}

export const QrCodeSvg: React.FC<QrCodeSvgProps> = ({ value, size = 148, label }) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: {
        dark: resolvedTheme === 'light' ? '#153F40' : '#0E393D',
        light: resolvedTheme === 'light' ? '#FFFFFF' : '#F3EDE6',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [value, size, resolvedTheme]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-xl bg-passport/20 border border-brand/40 flex items-center justify-center text-[10px] font-mono text-brand-ink"
      >
        QR
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={label || 'Medicine Passport QR Code'}
      width={size}
      height={size}
      className="rounded-xl border-2 border-brand"
    />
  );
};
