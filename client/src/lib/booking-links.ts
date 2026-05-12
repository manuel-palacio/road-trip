import type { Stop } from './types';

export type AccommodationLinks = {
  booking: string;
  googleHotels: string;
  /** True when both check-in and check-out dates could be derived from
   * the trip's startDate + the stop's dayNumber. False = the URLs use
   * the stop name as a search query only, no date pre-fill. */
  hasDates: boolean;
};

function isoDatePlus(start: string, days: number): string | null {
  // Use UTC to avoid local-timezone day shifts when the user lives in
  // a non-zero offset (e.g. New York at 23:00 would otherwise see
  // tomorrow's date for today's stop).
  const d = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Build accommodation-search deep links for an overnight stop.
 * Caller is responsible for only invoking this when stop.type === 'overnight'.
 * The check-in date is the day the user *sleeps* at this stop = the day this
 * stop belongs to (its dayNumber) — overnight stops are the last stop of
 * their day, so checkin = startDate + (dayNumber - 1) days. */
export function accommodationLinks(
  stop: Stop,
  tripStartDate: string | null | undefined,
  bookingAffiliateId?: string | null,
): AccommodationLinks {
  const name = (stop.label || stop.name || '').trim();
  const day = stop.dayNumber && stop.dayNumber > 0 ? stop.dayNumber : 1;
  let checkin: string | null = null;
  let checkout: string | null = null;
  if (tripStartDate) {
    checkin = isoDatePlus(tripStartDate, day - 1);
    checkout = isoDatePlus(tripStartDate, day);
  }
  const hasDates = !!(checkin && checkout);

  const bookingParams = new URLSearchParams({ ss: name, group_adults: '2' });
  if (hasDates) {
    bookingParams.set('checkin', checkin!);
    bookingParams.set('checkout', checkout!);
  }
  if (bookingAffiliateId) {
    bookingParams.set('aid', bookingAffiliateId);
  }
  const booking = `https://www.booking.com/searchresults.html?${bookingParams.toString()}`;

  let googleHotels = `https://www.google.com/travel/hotels?q=${encodeURIComponent(name)}`;
  if (hasDates) {
    googleHotels += `&dates=${checkin}%2F${checkout}`;
  }

  return { booking, googleHotels, hasDates };
}
