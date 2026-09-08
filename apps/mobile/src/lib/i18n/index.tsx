/**
 * Tiny i18n runtime for CoalGuard Field.
 *
 *   const { t, lang, setLang } = useI18n();
 *   <AppText>{t('action.startInspection')}</AppText>
 *   <AppText>{t('checklist.answered', { answered: 3, total: 8 })}</AppText>
 *
 * - `en` is the fallback; a missing key returns the English string, then the key.
 * - The chosen language persists to AsyncStorage and is restored on launch.
 * - Adding a language = add it to LANGUAGES + a dictionary in ./strings.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  STRINGS,
  type LanguageCode,
  type StringKey,
} from './strings';

const STORAGE_KEY = 'coalguard.field.lang';

type TParams = Record<string, string | number>;

interface I18nValue {
  lang: LanguageCode;
  ready: boolean;
  setLang: (code: LanguageCode) => void;
  t: (key: StringKey | string, params?: TParams) => string;
  languages: typeof LANGUAGES;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (alive && (v === 'en' || v === 'hi')) setLangState(v);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const setLang = useCallback((code: LanguageCode) => {
    setLangState(code);
    void AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  }, []);

  const t = useCallback(
    (key: StringKey | string, params?: TParams) => {
      const dict = STRINGS[lang] ?? STRINGS.en;
      const raw = dict[key] ?? STRINGS.en[key] ?? String(key);
      return interpolate(raw, params);
    },
    [lang],
  );

  const value = useMemo<I18nValue>(
    () => ({ lang, ready, setLang, t, languages: LANGUAGES }),
    [lang, ready, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export { LANGUAGES } from './strings';
export type { LanguageCode } from './strings';
