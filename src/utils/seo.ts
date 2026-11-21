export interface DynamicSEOConfig {
  title: string;
  description: string;
  canonicalPath?: string;
  imageUrl?: string;
  type?: 'website' | 'article' | 'profile';
  keywords?: string[];
  jsonLd?: Record<string, any> | Record<string, any>[];
}

const DEFAULT_TITLE = 'Civisha – Civic Issue Reporting & Community Verification';
const DEFAULT_DESCRIPTION =
  'Report, verify, and track local civic issues in real time with community-driven accountability, GPS verification, and civic radar heatmaps.';

function upsertMetaTag(attr: 'name' | 'property', key: string, content: string) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonicalLink(url: string) {
  if (typeof document === 'undefined') return;
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

function upsertJsonLd(data?: Record<string, any> | Record<string, any>[]) {
  if (typeof document === 'undefined') return;
  const scriptId = 'civisha-dynamic-jsonld';
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!data) {
    if (script) script.remove();
    return;
  }
  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

export function updatePageSEO(config: DynamicSEOConfig) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const origin = window.location.origin;
  const fullTitle = config.title.includes('Civisha') ? config.title : `${config.title} | Civisha`;
  const description = (config.description || DEFAULT_DESCRIPTION).slice(0, 160);
  const canonicalUrl = config.canonicalPath
    ? `${origin}${config.canonicalPath.startsWith('/') ? config.canonicalPath : `/${config.canonicalPath}`}`
    : `${origin}${window.location.pathname}`;
  const imageUrl = config.imageUrl
    ? config.imageUrl.startsWith('http')
      ? config.imageUrl
      : `${origin}${config.imageUrl.startsWith('/') ? config.imageUrl : `/${config.imageUrl}`}`
    : `${origin}/og-fallback.png`;

  document.title = fullTitle;

  upsertMetaTag('name', 'description', description);
  if (config.keywords && config.keywords.length > 0) {
    upsertMetaTag('name', 'keywords', config.keywords.join(', '));
  }

  upsertMetaTag('property', 'og:title', fullTitle);
  upsertMetaTag('property', 'og:description', description);
  upsertMetaTag('property', 'og:url', canonicalUrl);
  upsertMetaTag('property', 'og:image', imageUrl);
  upsertMetaTag('property', 'og:type', config.type || 'website');

  upsertMetaTag('name', 'twitter:card', 'summary_large_image');
  upsertMetaTag('name', 'twitter:title', fullTitle);
  upsertMetaTag('name', 'twitter:description', description);
  upsertMetaTag('name', 'twitter:image', imageUrl);

  upsertCanonicalLink(canonicalUrl);
  upsertJsonLd(config.jsonLd);
}

export function resetDefaultSEO() {
  updatePageSEO({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonicalPath: '/',
    type: 'website',
  });
}
