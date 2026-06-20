export type AffiliateLink = { label: string; href: string; source: string };

type ExperienceLinkInput = {
  name: string;
  countryCode?: string;
  date?: string; // ISO YYYY-MM-DD
};

type CarRentalLinkInput = {
  city: string;
  countryCode?: string;
  pickupDate: string;  // ISO YYYY-MM-DD
  dropoffDate: string; // ISO YYYY-MM-DD
};

type ExperienceEnv = {
  getYourGuidePartnerId?: string;
  viatorPartnerId?: string;
};

type CarRentalEnv = {
  bookingAffiliateId?: string;
};

/** GetYourGuide affiliate search link. Functional without a partner id;
 * commission only applies when GETYOURGUIDE_PARTNER_ID is configured. */
function getYourGuideLink(input: ExperienceLinkInput, partnerId?: string): AffiliateLink {
  const q = encodeURIComponent(input.name);
  const base = `https://www.getyourguide.com/s/?q=${q}`;
  const href = partnerId ? `${base}&partner_id=${encodeURIComponent(partnerId)}` : base;
  return { label: 'GetYourGuide', href, source: 'getyourguide' };
}

/** Viator affiliate search link. Functional without a partner id;
 * commission only applies when VIATOR_PARTNER_ID is configured. */
function viatorLink(input: ExperienceLinkInput, partnerId?: string): AffiliateLink {
  const q = encodeURIComponent(input.name);
  const base = `https://www.viator.com/searchResults/all?text=${q}`;
  const href = partnerId ? `${base}&pid=${encodeURIComponent(partnerId)}` : base;
  return { label: 'Viator', href, source: 'viator' };
}

export function experienceLinks(input: ExperienceLinkInput, env: ExperienceEnv): AffiliateLink[] {
  return [
    getYourGuideLink(input, env.getYourGuidePartnerId),
    viatorLink(input, env.viatorPartnerId),
  ];
}

/** Rentalcars.com search link (Booking's car rental arm). Uses the same
 * Booking affiliate id when configured — no separate sign-up required. */
export function carRentalLink(input: CarRentalLinkInput, env: CarRentalEnv): AffiliateLink {
  const params = new URLSearchParams({
    location: input.city,
    puDate: input.pickupDate,
    doDate: input.dropoffDate,
  });
  if (env.bookingAffiliateId) params.set('aid', env.bookingAffiliateId);
  return {
    label: 'Rentalcars',
    href: `https://www.rentalcars.com/SearchResults.do?${params.toString()}`,
    source: 'rentalcars',
  };
}
