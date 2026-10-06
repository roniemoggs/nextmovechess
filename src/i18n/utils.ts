import { ui, defaultLang, languages, localesConfig, type SupportedLanguage } from './ui';

export function getLangFromUrl(url: URL | string): SupportedLanguage {
  const pathname = typeof url === 'string' ? url : url.pathname;
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0]?.toLowerCase();

  if (firstSegment && firstSegment in languages) {
    return firstSegment as SupportedLanguage;
  }

  return defaultLang;
}

export function useTranslations(lang: SupportedLanguage) {
  return function t(key: keyof (typeof ui)[typeof defaultLang]): string {
    const langDict = ui[lang] as Record<string, string>;
    if (langDict && key in langDict) {
      return langDict[key];
    }
    const defaultDict = ui[defaultLang] as Record<string, string>;
    return defaultDict[key] || (key as string);
  };
}

export function cleanPathWithoutLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && segments[0] in languages) {
    segments.shift();
  }
  const clean = segments.join('/');
  return clean ? `/${clean}` : '/';
}

export function useTranslatedPath(lang: SupportedLanguage) {
  return function translatePath(path: string, targetLang: SupportedLanguage = lang): string {
    const rawPath = cleanPathWithoutLocale(path);
    if (targetLang === defaultLang) {
      return rawPath === '' ? '/' : rawPath;
    }
    return rawPath === '/' ? `/${targetLang}` : `/${targetLang}${rawPath}`;
  };
}

export function getAlternateHreflangLinks(currentPath: string, siteUrl: string = 'https://nextmovechesss.com') {
  const rawPath = cleanPathWithoutLocale(currentPath);
  const normalizedRaw = rawPath === '/' ? '' : rawPath;

  const links: Array<{ hreflang: string; href: string }> = [];

  // Default / English (x-default and en)
  links.push({
    hreflang: 'x-default',
    href: `${siteUrl}${normalizedRaw || '/'}`,
  });

  for (const [langKey, config] of Object.entries(localesConfig)) {
    const lang = langKey as SupportedLanguage;
    const pathPrefix = lang === defaultLang ? '' : `/${lang}`;
    const fullHref = `${siteUrl}${pathPrefix}${normalizedRaw || (lang === defaultLang ? '/' : '')}`;
    links.push({
      hreflang: config.hreflang,
      href: fullHref,
    });
  }

  return links;
}

export function getLocaleConfig(lang: SupportedLanguage) {
  return localesConfig[lang] || localesConfig[defaultLang];
}
