import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import QRCode from 'qrcode';

const FRONTEND_ROOT = path.resolve(import.meta.dirname, '..');

async function loadTsModule(relativePath) {
  const entry = path.join(FRONTEND_ROOT, relativePath);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medora-fe-test-'));
  const outfile = path.join(tmpDir, 'mod.mjs');
  try {
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile,
    });
    return await import(pathToFileURL(outfile).href);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('dateUtils computes day deltas, 10/5/3/1/0 thresholds, and display dates accurately', async () => {
  const { calculateDaysUntilExpiry, getExpiryStatus, formatDateDisplay } = await loadTsModule(
    'src/utils/dateUtils.ts'
  );
  const ref = new Date(2026, 4, 10); // 10 May 2026

  assert.equal(calculateDaysUntilExpiry('2026-05-09', ref), -1);
  assert.equal(calculateDaysUntilExpiry('2026-05-10', ref), 0);
  assert.equal(calculateDaysUntilExpiry('2026-05-11', ref), 1);
  assert.equal(calculateDaysUntilExpiry('2026-05-13', ref), 3);
  assert.equal(calculateDaysUntilExpiry('2026-05-15', ref), 5);
  assert.equal(calculateDaysUntilExpiry('2026-05-20', ref), 10);
  assert.equal(calculateDaysUntilExpiry('2026-05-25', ref), 15);

  assert.equal(getExpiryStatus(-1), 'EXPIRED');
  assert.equal(getExpiryStatus(0), 'EXPIRES_TODAY');
  assert.equal(getExpiryStatus(1), 'CRITICAL_1D');
  assert.equal(getExpiryStatus(3), 'URGENT_3D');
  assert.equal(getExpiryStatus(5), 'APPROACHING_5D');
  assert.equal(getExpiryStatus(10), 'NOTICE_10D');
  assert.equal(getExpiryStatus(11), 'SAFE');

  assert.equal(formatDateDisplay('2026-05-10'), '10 May 2026');
  assert.equal(formatDateDisplay(undefined), 'N/A');
});

test('all 13 language packs load with 100% key parity, authentic scripts, RTL metadata, and zero transliterated leaks', async () => {
  const { translations, getTranslationCoverageReport } = await loadTsModule('src/i18n/translations.ts');
  const { SUPPORTED_LANGUAGES, isRtlLanguage } = await loadTsModule('src/i18n/languages.ts');

  const expectedCodes = ['en', 'ta', 'hi', 'te', 'kn', 'ml', 'bn', 'mr', 'gu', 'pa', 'or', 'ur', 'as'];
  assert.deepEqual(
    SUPPORTED_LANGUAGES.map((l) => l.code),
    expectedCodes
  );

  // RTL configuration check
  assert.equal(isRtlLanguage('ur'), true);
  for (const code of expectedCodes.filter((c) => c !== 'ur')) {
    assert.equal(isRtlLanguage(code), false, `${code} should be LTR`);
  }

  // Coverage report check (0 missing, 0 empty, 0 placeholder mismatches, 100% coverage)
  const report = getTranslationCoverageReport();
  assert.equal(report.length, 13);
  for (const row of report) {
    assert.equal(row.coveragePercent, 100, `Incomplete coverage for ${row.code}`);
    assert.deepEqual(row.missingKeys, [], `Missing keys for ${row.code}`);
    assert.deepEqual(row.emptyKeys, [], `Empty keys for ${row.code}`);
    assert.deepEqual(row.placeholderMismatches, [], `Placeholder mismatch for ${row.code}`);
  }

  // Unicode script validation per language (reject English fallback masquerading as Indic text)
  const scriptChecks = {
    ta: /[\u0B80-\u0BFF]/,
    hi: /[\u0900-\u097F]/,
    te: /[\u0C00-\u0C7F]/,
    kn: /[\u0C80-\u0CFF]/,
    ml: /[\u0D00-\u0D7F]/,
    bn: /[\u0980-\u09FF]/,
    mr: /[\u0900-\u097F]/,
    gu: /[\u0A80-\u0AFF]/,
    pa: /[\u0A00-\u0A7F]/,
    or: /[\u0B00-\u0B7F]/,
    ur: /[\u0600-\u06FF]/,
    as: /[\u0980-\u09FF]/,
  };

  for (const [code, regex] of Object.entries(scriptChecks)) {
    const dict = translations[code];
    for (const [key, value] of Object.entries(dict)) {
      if (key === 'brand.name' && value.includes('Medora')) {
        assert.ok(regex.test(value), `${code}.${key} missing native script`);
        continue;
      }
      assert.ok(regex.test(value), `${code}.${key} ("${value}") does not contain expected script`);
    }
  }

  // Regression guard against English transliterations in Tamil & Hindi UI
  const forbiddenHindiTranslit = ['डैशबोर्ड', 'एक्सपायरी', 'टाइमलाइन', 'प्रिस्क्रिप्शन वॉल्ट', 'शेड्यूल', 'डेमो', 'स्कैन'];
  const hiConcat = Object.values(translations.hi).join(' ');
  for (const bad of forbiddenHindiTranslit) {
    assert.equal(hiConcat.includes(bad), false, `Found English transliteration in hi: ${bad}`);
  }

  const forbiddenTamilTranslit = ['டாஷ்போர்டு', 'ஸ்கேன்', 'பாஸ்போர்ட்', 'ஆர்டர்கள்', 'டெமோ', 'பிராண்ட்'];
  const taConcat = Object.values(translations.ta).join(' ');
  for (const bad of forbiddenTamilTranslit) {
    assert.equal(taConcat.includes(bad), false, `Found English transliteration in ta: ${bad}`);
  }
});

test('VoiceSearchBar normalizeVoiceQuery cleans spoken medicine phrases safely', async () => {
  const { normalizeVoiceQuery } = await loadTsModule('src/components/VoiceSearchBar.tsx');

  assert.equal(normalizeVoiceQuery('search for Dolo 650 milligrams!'), 'Dolo 650 mg');
  assert.equal(normalizeVoiceQuery('find Metformin 500 micrograms.'), 'Metformin 500 mcg');
  assert.equal(normalizeVoiceQuery('show me Amoxicillin 5 millilitres?'), 'Amoxicillin 5 ml');
  assert.equal(normalizeVoiceQuery('  Telma 40  '), 'Telma 40');
});

test('qrcode library generates verifiable data URL matrix for redacted passport links', async () => {
  const dataUrl = await QRCode.toDataURL('https://medora.local/api/medicines/passport/verify/TEST1234', {
    width: 148,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  assert.ok(dataUrl.startsWith('data:image/png;base64,'), 'Expected PNG QR data URL');
  assert.ok(dataUrl.length > 200, 'Expected non-trivial encoded QR payload');
});

test('ThemeContext preference validation & system theme resolution handle Light, Dark, and System modes', async () => {
  const { THEME_STORAGE_KEY, isValidThemePreference, resolveThemePreference } = await loadTsModule(
    'src/context/ThemeContext.tsx'
  );
  assert.equal(THEME_STORAGE_KEY, 'medora_theme_preference');
  assert.equal(isValidThemePreference('light'), true);
  assert.equal(isValidThemePreference('dark'), true);
  assert.equal(isValidThemePreference('system'), true);
  assert.equal(isValidThemePreference('sepia'), false);

  assert.equal(resolveThemePreference('light', true), 'light');
  assert.equal(resolveThemePreference('light', false), 'light');
  assert.equal(resolveThemePreference('dark', true), 'dark');
  assert.equal(resolveThemePreference('dark', false), 'dark');
  assert.equal(resolveThemePreference('system', true), 'dark');
  assert.equal(resolveThemePreference('system', false), 'light');
});

test('AuthContext storage constants and clearPrivateLocalCaches scrub private household caches without wiping theme/language', async () => {
  const { TOKEN_STORAGE_KEY, HOUSEHOLD_STORAGE_KEY, clearPrivateLocalCaches } = await loadTsModule(
    'src/context/AuthContext.tsx'
  );
  assert.equal(TOKEN_STORAGE_KEY, 'medora_auth_token');
  assert.equal(HOUSEHOLD_STORAGE_KEY, 'medora_household_id');

  const store = new Map([
    ['medora_medicines', '[{"id":1}]'],
    ['medora_members', '[{"id":1}]'],
    ['medora_notifications', '[]'],
    ['medora_schedules', '[]'],
    ['medora_disposal', '[]'],
    ['medora_history', '[]'],
    ['medora_theme_preference', 'light'],
    ['medora_lang', 'ta'],
  ]);
  const prevWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      removeItem: (k) => store.delete(k),
    },
  };
  try {
    clearPrivateLocalCaches();
    assert.equal(store.has('medora_medicines'), false);
    assert.equal(store.has('medora_members'), false);
    assert.equal(store.has('medora_notifications'), false);
    assert.equal(store.has('medora_schedules'), false);
    assert.equal(store.has('medora_disposal'), false);
    assert.equal(store.has('medora_history'), false);
    assert.equal(store.get('medora_theme_preference'), 'light');
    assert.equal(store.get('medora_lang'), 'ta');
  } finally {
    globalThis.window = prevWindow;
  }
});
