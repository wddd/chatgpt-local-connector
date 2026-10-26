import { action } from './data';
export const isDesktop = false;
export async function openUrl(url: string) { action('openUrl', url); }
export async function copyText(value: string) { action('copyText', value); }
export async function notifyNative(title: string, body: string) { action('notify', { title, body }); }
