import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import { ShieldAlert, Cpu } from 'lucide-react';
import { Language } from '../types';

export const Footer: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();

  return (
    <footer className="bg-canvas border-t border-line text-ink pt-12 pb-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Col 1: Wordmark & Purpose */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-brand" />
              <span className="font-display font-extrabold text-lg text-ink">
                {t('brand.name')}
              </span>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed max-w-sm">
              {t('footer.description')}
            </p>
            <div className="pt-2 flex items-center gap-2" aria-hidden="true">
              <span className="w-4 h-4 rounded bg-surface-alt border border-line-strong" />
              <span className="w-4 h-4 rounded bg-brand border border-line" />
              <span className="w-4 h-4 rounded bg-danger border border-line" />
              <span className="w-4 h-4 rounded bg-passport border border-line-strong" />
            </div>
          </div>

          {/* Col 2: C Data Structures Module */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-brand-ink flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              <span>{t('settings.c_module_title')}</span>
            </h5>
            <ul className="text-xs space-y-1 text-ink-muted font-mono">
              <li>• Min-Heap Priority Queue</li>
              <li>• djb2 Chaining Hash Table</li>
              <li>• Singly Linked List</li>
              <li>• Python ctypes Bridge</li>
            </ul>
          </div>

          {/* Col 3: 13 Indian Languages */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-brand-ink">
              {t('hero.pillar_lang_title')}
            </h5>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {SUPPORTED_LANGUAGES.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => setLanguage(item.code as Language)}
                  className={`px-2 py-0.5 rounded border text-[11px] transition-colors ${
                    language === item.code
                      ? 'bg-brand text-on-brand border-brand font-bold'
                      : 'bg-surface border-line text-ink hover:border-brand'
                  }`}
                >
                  {item.nativeName}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Safety Disclaimer Banner */}
        <div className="p-3.5 rounded-xl bg-surface border border-danger/40 text-xs text-ink-muted flex items-start gap-3 shadow-card">
          <ShieldAlert className="w-5 h-5 text-danger-ink shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-danger-ink">{t('footer.disclaimer_title')}</strong>{' '}
            {t('education.disclaimer')}
          </p>
        </div>

        <div className="pt-4 border-t border-line flex flex-col sm:flex-row items-center justify-between text-[11px] text-ink-muted gap-2">
          <span>{t('footer.academic_tag')}</span>
          <span>{t('brand.tagline')}</span>
        </div>
      </div>
    </footer>
  );
};
