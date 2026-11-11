import { Language, LanguageMetadata } from '../types';

export const SUPPORTED_LANGUAGES: LanguageMetadata[] = [
  {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    script: 'Latin',
    direction: 'ltr',
    speechCode: 'en-IN',
    voiceSupport: 'browser_tested',
    reviewStatus: 'AUDITED_BASELINE',
  },
  {
    code: 'ta',
    nativeName: 'தமிழ்',
    englishName: 'Tamil',
    script: 'Tamil',
    direction: 'ltr',
    speechCode: 'ta-IN',
    voiceSupport: 'browser_tested',
    reviewStatus: 'AUDITED_BASELINE',
  },
  {
    code: 'hi',
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    script: 'Devanagari',
    direction: 'ltr',
    speechCode: 'hi-IN',
    voiceSupport: 'browser_tested',
    reviewStatus: 'AUDITED_BASELINE',
  },
  {
    code: 'te',
    nativeName: 'తెలుగు',
    englishName: 'Telugu',
    script: 'Telugu',
    direction: 'ltr',
    speechCode: 'te-IN',
    voiceSupport: 'experimental_bcp47',
    reviewStatus: 'AUTHORED_AWAITING_NATIVE_REVIEW',
  },
  {
    code: 'kn',
    nativeName: 'ಕನ್ನಡ',
    englishName: 'Kannada',
    script: 'Kannada',
    direction: 'ltr',
    speechCode: 'kn-IN',
    voiceSupport: 'experimental_bcp47',
    reviewStatus: 'AUTHORED_AWAITING_NATIVE_REVIEW',
  },
  {
    code: 'ml',
    nativeName: 'മലയാളം',
    englishName: 'Malayalam',
    script: 'Malayalam',
    direction: 'ltr',
    speechCode: 'ml-IN',
    voiceSupport: 'experimental_bcp47',
    reviewStatus: 'AUTHORED_AWAITING_NATIVE_REVIEW',
  },
  {
    code: 'bn',
    nativeName: 'বাংলা',
    englishName: 'Bengali',
    script: 'Bengali',
    direction: 'ltr',
    speechCode: 'bn-IN',
    voiceSupport: 'experimental_bcp47',
    reviewStatus: 'AUTHORED_AWAITING_NATIVE_REVIEW',
  },
  {
    code: 'mr',
    nativeName: 'मराठी',
    englishName: 'Marathi',
    script: 'Devanagari',
    direction: 'ltr',
    speechCode: 'mr-IN',
    voiceSupport: 'experimental_bcp47',
    reviewStatus: 'AUTHORED_AWAITING_NATIVE_REVIEW',
  },
  {
    code: 'gu',
    nativeName: 'ગુજરાતી',
    englishName: 'Gujarati',
    script: 'Gujarati',
    direction: 'ltr',
    speechCode: 'gu-IN',
    voiceSupport: 'experimental_bcp47',
    reviewStatus: 'AUTHORED_AWAITING_NATIVE_REVIEW',
  },
  {
    code: 'pa',
    nativeName: 'ਪੰਜਾਬੀ',
    englishName: 'Punjabi',
    script: 'Gurmukhi',
    direction: 'ltr',
    speechCode: 'pa-IN',
    voiceSupport: 'experimental_bcp47',
    reviewStatus: 'AUTHORED_AWAITING_NATIVE_REVIEW',
  },
  {
    code: 'or',
    nativeName: 'ଓଡ଼ିଆ',
    englishName: 'Odia',
    script: 'Odia',
    direction: 'ltr',
    speechCode: 'or-IN',
    voiceSupport: 'text_fallback',
    reviewStatus: 'AUTHORED_AWAITING_NATIVE_REVIEW',
  },
  {
    code: 'ur',
    nativeName: 'اردو',
    englishName: 'Urdu',
    script: 'Nastaliq / Arabic',
    direction: 'rtl',
    speechCode: 'ur-IN',
    voiceSupport: 'experimental_bcp47',
    reviewStatus: 'AUTHORED_AWAITING_NATIVE_REVIEW',
  },
  {
    code: 'as',
    nativeName: 'অসমীয়া',
    englishName: 'Assamese',
    script: 'Assamese / Eastern Nagari',
    direction: 'ltr',
    speechCode: 'as-IN',
    voiceSupport: 'text_fallback',
    reviewStatus: 'AUTHORED_AWAITING_NATIVE_REVIEW',
  },
];

export const LANGUAGE_MAP: Record<Language, LanguageMetadata> = SUPPORTED_LANGUAGES.reduce(
  (acc, item) => {
    acc[item.code] = item;
    return acc;
  },
  {} as Record<Language, LanguageMetadata>
);

export function isValidLanguage(code: string | null | undefined): code is Language {
  if (!code) return false;
  return code in LANGUAGE_MAP;
}

export function isRtlLanguage(code: Language): boolean {
  return LANGUAGE_MAP[code]?.direction === 'rtl';
}
