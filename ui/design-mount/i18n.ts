import en from '../locales/en.json';
import zhCN from '../locales/zh-CN.json';
import { environment } from './environment';
import { formatMessage } from '../i18nMessage';
export type { Locale } from '../i18nMessage';
export const locale = { get: () => environment.get().locale, use: () => environment.use().locale };
export function t(key: string, params: Record<string, unknown> = {}) {
  const selected = locale.get();
  return formatMessage(selected, selected === 'zh-CN' ? zhCN : en, key, params)
    ?? formatMessage('en', en, key, params) ?? key;
}
