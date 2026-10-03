// Publisher details, shown in the app and used in the legal pages.
export const BRAND = {
  name: 'Crowdfill',
  publisher: 'dyrt.io',
  maker: 'Simon',
  website: 'https://dyrt.io',
  supportEmail: 'support@dyrt.io',
  securityEmail: 'dev@dyrt.io',
} as const;

/** Policy pages bundled with the extension (rendered from legal/*.md at build time). */
export const LEGAL_PAGES = [
  { id: 'terms', label: 'Terms of Use' },
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'acceptable-use', label: 'Acceptable Use Policy' },
  { id: 'licenses', label: 'Open-source licenses' },
] as const;

export type LegalPage = (typeof LEGAL_PAGES)[number]['id'];

export const legalUrl = (page: LegalPage) => chrome.runtime.getURL(`legal/${page}.html`);
