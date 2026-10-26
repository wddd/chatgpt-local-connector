import en from '../locales/en.json';
import zhCN from '../locales/zh-CN.json';
import { environment } from './environment';
export type Locale = 'en' | 'zh-CN';
export const locale = { get: () => environment.get().locale, use: () => environment.use().locale };
export function t(key: string, params: Record<string, unknown> = {}) {
  const messages = locale.get() === 'zh-CN' ? zhCN : en;
  const message = messages[key as keyof typeof en] ?? en[key as keyof typeof en] ?? key;
  return message.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}
