import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';
import {
  Camera, ShieldCheck, AlertTriangle, Clock,
  Sparkles, CheckCircle2, QrCode, ArrowRight
} from 'lucide-react';

export const OrbitHero: React.FC = () => {
  const { t } = useLanguage();
  const { setActiveTab } = useMedicine();

  return (
    <section className="relative overflow-hidden pt-12 pb-24 md:pt-20 md:pb-36 bg-canvas border-b border-line transition-colors duration-200">
      {/* Background Architectural Grid Lines */}
      <div
        className="absolute inset-0 opacity-[0.14] pointer-events-none [background-size:32px_32px]"
        style={{ backgroundImage: 'radial-gradient(rgb(var(--color-accent-rgb)) 1px, transparent 1px)' }}
      />

      {/* Dominant Architectural Orbit SVG Curve */}
      <div className="absolute top-0 right-0 w-full h-full pointer-events-none overflow-hidden">
        <svg
          className="w-full h-full min-w-[700px] md:min-w-[1100px] -right-10 md:right-0 absolute top-[-10%] md:top-[-5%]"
          viewBox="0 0 1000 700"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(var(--color-line-rgb))" stopOpacity="0.45" />
              <stop offset="35%" stopColor="rgb(var(--color-accent-rgb))" stopOpacity="0.85" />
              <stop offset="70%" stopColor="rgb(var(--color-danger-rgb))" stopOpacity="0.9" />
              <stop offset="100%" stopColor="rgb(var(--color-ink-rgb))" stopOpacity="0.35" />
            </linearGradient>
            <linearGradient id="pulseGlow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(var(--color-accent-rgb))" stopOpacity="0.16" />
              <stop offset="100%" stopColor="rgb(var(--color-line-rgb))" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Background Ambient Sweep */}
          <path
            d="M 150 650 C 350 550, 480 320, 680 180 C 800 100, 920 120, 990 80"
            stroke="url(#pulseGlow)"
            strokeWidth="80"
            strokeLinecap="round"
          />

          {/* Primary Main Orbit Arc */}
          <path
            d="M 100 680 C 320 580, 520 360, 720 190 C 850 80, 950 110, 1020 90"
            stroke="url(#orbitGrad)"
            strokeWidth="4"
            strokeDasharray="6 8"
            strokeLinecap="round"
          />

          {/* Orbit Guide Rings */}
          <circle cx="680" cy="240" r="140" stroke="rgb(var(--color-line-rgb))" strokeWidth="1.5" strokeDasharray="4 6" opacity="0.7" />
          <circle cx="680" cy="240" r="220" stroke="rgb(var(--color-accent-rgb))" strokeWidth="1" strokeDasharray="3 7" opacity="0.45" />

          {/* Node Anchor Points */}
          <circle cx="420" cy="460" r="6" fill="rgb(var(--color-accent-rgb))" />
          <circle cx="580" cy="310" r="8" fill="rgb(var(--color-danger-rgb))" />
          <circle cx="740" cy="180" r="5" fill="rgb(var(--color-ink-rgb))" opacity="0.75" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">

          {/* Asymmetrical Column: Off-centre Headline & Action Hierarchy */}
          <div className="lg:col-span-7 xl:col-span-6 space-y-6 text-start">

            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-alt/80 border border-brand/40 text-brand-ink text-xs font-semibold tracking-wider uppercase backdrop-blur-sm">
              <Sparkles className="w-3.5 h-3.5 text-brand-ink" />
              <span>{t('hero.badge')}</span>
            </div>

            {/* Asymmetrical Off-Centre Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink font-display leading-[1.15]">
              <span className="block text-brand-ink">{t('hero.title_part1')}</span>
              <span className="block">{t('hero.title_part2')}</span>
            </h1>

            {/* Editorial Subtitle */}
            <p className="text-base sm:text-lg text-ink-muted max-w-xl leading-relaxed font-normal">
              {t('hero.subtitle')}
            </p>

            {/* Strict Color Hierarchy CTAs */}
            <div className="pt-2 flex flex-wrap gap-4 items-center">
              <button
                type="button"
                onClick={() => setActiveTab('scan')}
                className="px-6 py-3.5 rounded-xl bg-brand text-on-brand font-bold hover:opacity-90 transition-all duration-200 shadow-lg shadow-brand/20 flex items-center gap-2.5 text-base active:scale-95"
              >
                <Camera className="w-5 h-5" />
                <span>{t('hero.cta_scan')}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('cabinet')}
                className="px-6 py-3.5 rounded-xl bg-surface-alt text-ink font-semibold hover:border-brand transition-all duration-200 border border-line-strong flex items-center gap-2 text-base active:scale-95"
              >
                <span>{t('hero.cta_cabinet')}</span>
                <ArrowRight className="w-4 h-4 text-brand-ink rtl:rotate-180" />
              </button>
            </div>

            {/* Micro Pillars */}
            <div className="pt-4 grid grid-cols-3 gap-3 border-t border-line max-w-lg">
              <div>
                <span className="block text-xl font-bold text-brand-ink">{t('hero.pillar_lang_title')}</span>
                <span className="text-xs text-ink-muted">{t('hero.pillar_lang_desc')}</span>
              </div>
              <div>
                <span className="block text-xl font-bold text-danger-ink">{t('hero.pillar_alerts_title')}</span>
                <span className="text-xs text-ink-muted">{t('hero.pillar_alerts_desc')}</span>
              </div>
              <div>
                <span className="block text-xl font-bold text-ink">{t('hero.pillar_passport_title')}</span>
                <span className="text-xs text-ink-muted">{t('hero.pillar_passport_desc')}</span>
              </div>
            </div>

          </div>

          {/* Asymmetrical Right Column: Live Orbit Interactive Composition */}
          <div dir="ltr" className="lg:col-span-5 xl:col-span-6 relative min-h-[420px] sm:min-h-[480px]">

            {/* Orbit Node 1: Coral Critical Warning Node (Floating Upper Left) */}
            <div className="absolute top-2 left-2 sm:left-6 z-20 animate-float" style={{ animationDelay: '0s' }}>
              <div className="p-3.5 rounded-2xl bg-surface/95 border-2 border-danger shadow-elevated backdrop-blur-md max-w-[210px]">
                <div className="flex items-center gap-2 text-danger-ink text-xs font-bold mb-1">
                  <AlertTriangle className="w-4 h-4 animate-pulse" />
                  <span>{t('hero.orbit_critical')}</span>
                </div>
                <div className="font-semibold text-sm text-ink">Cetirizine 10mg</div>
                <div className="text-xs text-danger-ink font-medium mt-0.5">Expires in 24 Hours</div>
              </div>
            </div>

            {/* Orbit Node 2: Central Architectural Medicine Passport Card (Warm Paper Contrast) */}
            <div className="absolute top-20 right-2 sm:right-8 z-30 transform hover:-translate-y-1 transition-transform duration-300">
              <div className="w-[260px] sm:w-[290px] rounded-3xl bg-passport text-passport-ink p-5 shadow-elevated border-4 border-brand">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded bg-brand text-on-brand text-[10px] font-bold uppercase tracking-wider">
                      {t('hero.orbit_passport')}
                    </span>
                    <h4 className="text-base font-bold text-passport-ink mt-1">Dolo 650 Tablets</h4>
                    <p className="text-xs text-passport-ink/80 font-medium">Paracetamol IP 650mg</p>
                  </div>
                  <div className="p-1.5 bg-canvas text-brand-ink border border-line rounded-lg">
                    <QrCode className="w-6 h-6" />
                  </div>
                </div>

                <div className="space-y-1.5 py-2 border-y border-passport-ink/15 text-xs">
                  <div className="flex justify-between">
                    <span className="text-passport-ink/75">Batch No:</span>
                    <span className="font-mono font-bold text-passport-ink">DL-8812</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-passport-ink/75">Assigned To:</span>
                    <span className="font-semibold text-passport-ink">Karthik (Self)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-passport-ink/75">Status:</span>
                    <span className="text-xs font-bold text-passport-ink bg-accent/25 px-2 py-0.5 rounded-full">
                      10d Notice
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-passport-ink/80">
                  <span className="flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand-ink" /> OCR Verified
                  </span>
                  <span className="font-mono font-semibold">15 Units</span>
                </div>
              </div>
            </div>

            {/* Orbit Node 3: Care Teal Safe Timeline Node (Lower Center) */}
            <div className="absolute bottom-6 left-6 sm:left-14 z-20 animate-float" style={{ animationDelay: '2.5s' }}>
              <div className="p-3 rounded-2xl bg-surface border border-brand shadow-elevated backdrop-blur-md max-w-[220px]">
                <div className="flex items-center gap-2 text-brand-ink text-xs font-bold mb-1">
                  <Clock className="w-4 h-4" />
                  <span>{t('hero.orbit_safe')}</span>
                </div>
                <div className="font-semibold text-sm text-ink">Telma 40 Tablets</div>
                <div className="text-xs text-ink-muted mt-0.5">Mother (Lakshmi) • 120 Days</div>
              </div>
            </div>

            {/* Orbit Node 4: Expired Medicine Disposal Notice (Bottom Right) */}
            <div className="absolute -bottom-4 right-4 sm:right-12 z-20">
              <div className="px-3.5 py-2 rounded-xl bg-danger text-on-danger font-bold text-xs shadow-lg flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span>{t('hero.orbit_expired')} ➔ Take-Back Kiosk</span>
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
};
