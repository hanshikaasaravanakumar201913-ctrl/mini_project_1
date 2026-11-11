import React, { useState } from 'react';
import { Mic, MicOff, Check, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGE_MAP, SUPPORTED_LANGUAGES } from '../i18n/languages';
import { Language } from '../types';

interface VoiceSearchBarProps {
  onApplyQuery: (normalizedQuery: string, spokenLanguage?: Language) => void;
  suggestions?: string[];
}

export function normalizeVoiceQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^(search for|find|look up|show me|medicine|tablets?|capsules?)\s+/i, '')
    .replace(/\bmilligrams?\b/gi, 'mg')
    .replace(/\bmillilitres?\b|\bmilliliters?\b/gi, 'ml')
    .replace(/\bmicrograms?\b/gi, 'mcg')
    .replace(/[.,!?।۔]+$/g, '')
    .trim();
}

export const VoiceSearchBar: React.FC<VoiceSearchBarProps> = ({ onApplyQuery, suggestions = [] }) => {
  const { language, t } = useLanguage();
  const [voiceLang, setVoiceLang] = useState<Language>(language);
  const [isListening, setIsListening] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const SpeechRecognitionCtor =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  const activeLangMeta = LANGUAGE_MAP[voiceLang] || LANGUAGE_MAP[language] || LANGUAGE_MAP.en;
  const isSupported = Boolean(SpeechRecognitionCtor) && activeLangMeta.voiceSupport !== 'text_fallback';

  const startListening = () => {
    setVoiceNotice(null);
    if (!SpeechRecognitionCtor || activeLangMeta.voiceSupport === 'text_fallback') {
      setVoiceNotice(t('voice.unsupported'));
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = activeLangMeta.speechCode || 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setIsListening(true);
      recognition.onresult = (event: any) => {
        const rawText = event.results?.[0]?.[0]?.transcript || '';
        const normalized = normalizeVoiceQuery(rawText);
        setPendingTranscript(normalized);
        setIsListening(false);
      };
      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          setVoiceNotice(t('voice.permission_denied'));
        } else {
          setVoiceNotice(t('voice.unsupported'));
        }
      };
      recognition.onend = () => {
        setIsListening(false);
      };
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceNotice(t('voice.unsupported'));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('voice.start')}
          value={voiceLang}
          onChange={(e) => {
            setVoiceLang(e.target.value as Language);
            setVoiceNotice(null);
          }}
          className="medora-select font-semibold"
        >
          {SUPPORTED_LANGUAGES.map((meta) => (
            <option key={meta.code} value={meta.code}>
              {meta.nativeName} ({meta.speechCode})
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={startListening}
          disabled={isListening}
          aria-label={t('voice.start')}
          className={`min-h-[38px] px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors ${
            isListening
              ? 'bg-danger text-on-danger border-danger'
              : 'bg-field text-brand-ink border-brand/50 hover:bg-surface-alt'
          }`}
        >
          {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          <span>{isListening ? t('voice.listening') : `${t('voice.start')} (${activeLangMeta.nativeName})`}</span>
        </button>

        {!isSupported ? (
          <span className="text-[11px] text-danger-ink font-medium">
            {t('voice.unsupported')}
          </span>
        ) : activeLangMeta.voiceSupport === 'experimental_bcp47' ? (
          <span className="text-[11px] text-ink-muted">
            {t('voice.experimental_note')}
          </span>
        ) : null}
      </div>

      {voiceNotice && (
        <div role="status" className="text-[11px] text-danger-ink bg-field px-3 py-1.5 rounded-lg border border-danger/40 font-medium">
          {voiceNotice}
        </div>
      )}

      {pendingTranscript !== null && (
        <div className="p-2.5 rounded-xl bg-field border border-brand flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-muted">{t('voice.confirm_prompt')}</span>
          <input
            type="text"
            value={pendingTranscript}
            onChange={(e) => setPendingTranscript(e.target.value)}
            className="px-2 py-1 rounded-lg bg-surface text-ink border border-line-strong outline-none font-semibold"
          />
          <button
            type="button"
            onClick={() => {
              onApplyQuery(pendingTranscript, voiceLang);
              setPendingTranscript(null);
            }}
            className="px-2.5 py-1 rounded-lg bg-brand text-on-brand font-bold flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t('common.search')}</span>
          </button>
          <button
            type="button"
            onClick={() => setPendingTranscript(null)}
            aria-label={t('voice.discard')}
            className="p-1 rounded-lg text-ink-muted hover:text-ink"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-ink-muted">{t('voice.suggestions_label')}</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onApplyQuery(s, voiceLang)}
              className="px-2.5 py-0.5 rounded-full bg-surface-alt text-brand-ink border border-line hover:bg-brand hover:text-on-brand font-semibold transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
