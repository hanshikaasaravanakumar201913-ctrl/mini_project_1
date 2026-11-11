import { Language } from '../types';
import { SUPPORTED_LANGUAGES } from './languages';
import { en, TranslationKey } from './locales/en';
import { ta } from './locales/ta';
import { hi } from './locales/hi';
import { te } from './locales/te';
import { kn } from './locales/kn';
import { ml } from './locales/ml';
import { bn } from './locales/bn';
import { mr } from './locales/mr';
import { gu } from './locales/gu';
import { pa } from './locales/pa';
import { or } from './locales/or';
import { ur } from './locales/ur';
import { asLocale } from './locales/as';

export type { TranslationKey };

export const translations: Record<Language, Record<string, string>> = {
  en,
  ta,
  hi,
  te,
  kn,
  ml,
  bn,
  mr,
  gu,
  pa,
  or,
  ur,
  as: asLocale,
};

export interface TranslationCoverageItem {
  code: Language;
  nativeName: string;
  englishName: string;
  totalKeys: number;
  translatedKeys: number;
  missingKeys: string[];
  emptyKeys: string[];
  placeholderMismatches: string[];
  coveragePercent: number;
  direction: 'ltr' | 'rtl';
  reviewStatus: string;
}

function extractPlaceholders(str: string): string[] {
  const matches = str.match(/\{[a-zA-Z0-9_]+\}/g);
  return matches ? matches.sort() : [];
}

export function getTranslationCoverageReport(): TranslationCoverageItem[] {
  const baseKeys = Object.keys(en) as TranslationKey[];

  return SUPPORTED_LANGUAGES.map((meta) => {
    const dict = translations[meta.code] || {};
    const missingKeys: string[] = [];
    const emptyKeys: string[] = [];
    const placeholderMismatches: string[] = [];
    let translatedCount = 0;

    for (const key of baseKeys) {
      if (!(key in dict)) {
        missingKeys.push(key);
        continue;
      }
      const val = (dict[key] || '').trim();
      if (!val) {
        emptyKeys.push(key);
        continue;
      }
      translatedCount += 1;
      const basePh = extractPlaceholders(en[key]);
      const langPh = extractPlaceholders(val);
      if (basePh.join(',') !== langPh.join(',')) {
        placeholderMismatches.push(key);
      }
    }

    const coveragePercent = Math.round((translatedCount / baseKeys.length) * 100);
    return {
      code: meta.code,
      nativeName: meta.nativeName,
      englishName: meta.englishName,
      totalKeys: baseKeys.length,
      translatedKeys: translatedCount,
      missingKeys,
      emptyKeys,
      placeholderMismatches,
      coveragePercent,
      direction: meta.direction,
      reviewStatus: meta.reviewStatus,
    };
  });
}
