// Region-keyed resources for the safety screening flow. Lifted
// verbatim from docs/07-safety-screening.md § Resources by region.
// DV specialist review is a prerequisite before this list drives
// public-launch behavior; entries marked TODO(dv-review) still need
// validation.

export interface Resource {
  region: string;
  primary: string;
  secondary?: string;
}

export const RESOURCES: Record<string, Resource> = {
  US: {
    region: 'United States',
    primary: 'National DV Hotline: 1-800-799-7233',
    secondary: 'thehotline.org',
  },
  GB: {
    region: 'United Kingdom',
    primary: 'Refuge: 0808 2000 247',
    secondary: 'refuge.org.uk',
  },
  AU: {
    region: 'Australia',
    primary: '1800RESPECT: 1800 737 732',
    secondary: '1800respect.org.au',
  },
  CA: {
    region: 'Canada',
    primary: 'ShelterSafe.ca',
    secondary: 'sheltersafe.ca',
  },
  // TODO(dv-review): verify hotline and add a secondary URL.
  IL: {
    region: 'Israel',
    primary: 'WIZO Hotline: 1-800-353-3000',
  },
};

export const DEFAULT_RESOURCE: Resource = {
  region: 'International',
  primary: 'No More Directory',
  secondary: 'nomoredirectory.org',
};

export function ensureHttps(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}
