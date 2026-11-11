import React, { useState, useEffect } from 'react';
import { Sparkles, Search, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGE_MAP } from '../i18n/languages';
import { NlpMedicineMatch, NlpSearchResponse, Language } from '../types';
import { VoiceSearchBar } from './VoiceSearchBar';

interface NlpMedicineFinderProps {
  onSelectCanonicalMedicine: (genericOrBrandQuery: string, match: NlpMedicineMatch) => void;
}

export const NlpMedicineFinder: React.FC<NlpMedicineFinderProps> = ({
  onSelectCanonicalMedicine,
}) => {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<NlpSearchResponse | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [explainedText, setExplainedText] = useState<Record<number, string>>({});

  useEffect(() => {
    fetch(`/api/nlp/search-suggestions?lang=${encodeURIComponent(language)}&limit=6`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.suggestions && Array.isArray(data.suggestions)) {
          setSuggestions(data.suggestions.map((s: any) => s.text));
        }
      })
      .catch(() => {});
  }, [language]);

  const runNlpSearch = async (searchStr: string, langHint?: Language) => {
    const clean = searchStr.trim();
    if (!clean) return;
    setLoading(true);
    setExplainedText({});
    try {
      const res = await fetch('/api/nlp/medicine-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: clean,
          preferred_language: langHint || language,
          limit: 6,
          include_pharmacy_counts: true,
          use_llm_assist: false,
        }),
      });
      if (res.ok) {
        const data: NlpSearchResponse = await res.json();
        setResponse(data);
        if (data.status === 'HIGH_CONFIDENCE' && data.results.length === 1) {
          onSelectCanonicalMedicine(data.results[0].generic_name, data.results[0]);
        }
      }
    } catch {
      // Network offline
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runNlpSearch(query);
  };

  const handleExplainCategory = async (match: NlpMedicineMatch) => {
    const term = match.therapeutic_category || match.generic_name;
    try {
      const res = await fetch('/api/nlp/llm/explain-term', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, target_language: language }),
      });
      if (res.ok) {
        const data = await res.json();
        setExplainedText((prev) => ({ ...prev, [match.medicine_id]: data.explanation }));
      }
    } catch {
      // Ignore network error
    }
  };

  return (
    <div className="p-5 sm:p-6 medora-card border-brand/50 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-ink flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-ink" />
            <span>{t('nlp.title')}</span>
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">{t('nlp.subtitle')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5 text-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-brand-ink absolute start-3 top-2.5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('nlp.placeholder')}
            className="medora-input ps-9"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="medora-btn-primary whitespace-nowrap"
        >
          {loading ? t('common.loading') : t('nlp.search_btn')}
        </button>
      </form>

      <VoiceSearchBar
        suggestions={suggestions}
        onApplyQuery={(normalized, spokenLang) => {
          setQuery(normalized);
          runNlpSearch(normalized, spokenLang);
        }}
      />

      {response && (
        <div className="space-y-3 pt-2 border-t border-line">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
            <span className="px-2 py-0.5 rounded bg-field border border-line">
              {t('nlp.detected_lang')}:{' '}
              <strong className="text-brand-ink">
                {LANGUAGE_MAP[response.detected_language as Language]?.nativeName || response.detected_language}
              </strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-field border border-line font-mono">
              {t('nlp.normalized_query')}: {response.normalized_query}
            </span>
          </div>

          {response.status === 'AMBIGUOUS_CONFIRMATION_REQUIRED' && (
            <div className="p-3 rounded-xl bg-danger/15 border border-danger text-xs text-ink flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-danger-ink shrink-0 mt-0.5" />
              <span>{t('nlp.ambiguous_warning')}</span>
            </div>
          )}

          {response.status === 'NO_MATCH' ? (
            <div className="p-3 rounded-xl bg-field border border-line text-xs text-ink-muted">
              {t('nlp.no_match')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {response.results.map((m) => (
                <div
                  key={m.medicine_id}
                  className="p-4 rounded-2xl bg-field border border-line hover:border-brand space-y-2 text-xs transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-sm text-ink block">{m.canonical_name}</strong>
                      <span className="text-[11px] text-brand-ink font-semibold">
                        {m.generic_name} • {m.strength} • {m.dosage_form}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-surface text-brand-ink border border-line font-mono text-[10px] font-bold shrink-0">
                      {Math.round(m.score * 100)}%
                    </span>
                  </div>

                  {m.matched_alias && (
                    <div className="text-[11px] text-ink-muted">
                      Matched ({m.match_type}): <strong className="text-ink">{m.matched_alias.alias_text}</strong>
                    </div>
                  )}

                  {m.brand_names.length > 0 && (
                    <div className="text-[11px] text-ink-muted">
                      {m.brand_names.join(', ')}
                    </div>
                  )}

                  {explainedText[m.medicine_id] && (
                    <div className="p-2 rounded-lg bg-surface border border-brand/40 text-[11px] text-ink">
                      {explainedText[m.medicine_id]}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleExplainCategory(m)}
                      className="text-[11px] text-brand-ink hover:underline font-semibold flex items-center gap-1"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>{t('nlp.explain_btn')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectCanonicalMedicine(m.generic_name, m)}
                      className="px-3 py-1.5 rounded-xl bg-brand text-on-brand font-bold flex items-center gap-1 hover:opacity-90 transition-opacity"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('nlp.confirm_select')}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
