import type { Localized } from '@kiosko/sdk';

/** A text in the plugin's five languages: English, Spanish, German, Simplified and Traditional Chinese. */
export const L = (en: string, es: string, de: string, hans: string, hant: string): Localized => ({ en, es, de, 'zh-Hans': hans, 'zh-Hant': hant });

export const LANGUAGES = ['en', 'es', 'de', 'zh-Hant', 'zh-Hans'];
