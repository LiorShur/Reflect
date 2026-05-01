// Region-keyed resources for the safety screening flow. Lifted
// VERBATIM from docs/07-safety-screening.md § Resources by region.
// The IL and EU rows the doc flags as "verify and update" carry that
// note as a TODO — DV specialist review must validate the entries
// before public launch.

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

export function resourceForLocale(localeCode: string | null | undefined): Resource {
  if (!localeCode) return DEFAULT_RESOURCE;
  // Locale codes are typically "en-US", "he-IL", etc.
  const region = localeCode.split('-').pop()?.toUpperCase();
  if (region && RESOURCES[region]) {
    return RESOURCES[region];
  }
  return DEFAULT_RESOURCE;
}
