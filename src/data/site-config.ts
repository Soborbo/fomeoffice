// Site-wide business configuration - single source of truth
// Update values here and they propagate to all components, pages, schema, and emails

export const SITE_URL = 'https://foamoffice.co.uk';
export const BUSINESS_NAME = 'Foam Office';
export const LEGAL_NAME = 'PAINLESS VAN & CAR VALETING LTD';

// Brand voice - office-themed car wash. Friendly corporate satire, never mean.
export const TAGLINE = "Your Car's Place of Work";
export const TAGLINE_SECONDARY = 'Professional cleaning for hard-working cars';
export const MOTTO = 'Clock in dirty. Clock out spotless.';
export const APPROVED_STAMP = 'FOAM OFFICE APPROVED';
export const QUALITY_LINE = "We don't cut corners. We clean them.";

export const PHONE = '07977889747';
export const PHONE_DISPLAY = '07 977 889747';
export const PHONE_INTL = '+447977889747';
export const EMAIL = 'hello@foamoffice.co.uk';
export const BOOKING_EMAIL = 'bookings@foamoffice.co.uk';
export const OFFICE_EMAIL = 'office@foamoffice.co.uk';

export const SOCIAL_HANDLE = '@foamoffice.bristol';

export const ADDRESS = {
  street: '290-294 Southmead Road',
  streetShort: '290-294 Southmead Rd',
  locality: 'Bristol',
  region: 'Bristol',
  postcode: 'BS10 5EN',
  country: 'GB',
  full: '290-294 Southmead Road, Bristol BS10 5EN',
  short: '290-294 Southmead Rd, Bristol BS10 5EN',
  mapUrl: 'https://maps.google.com/?q=290-294+Southmead+Rd,+Bristol+BS10+5EN',
};

export const HOURS = {
  weekday: { days: 'Monday to Saturday', short: 'Mon-Sat', open: '9am', close: '7pm' },
  weekend: { days: 'Sunday', short: 'Sun', open: '9am', close: '5pm' },
  display: 'Mon-Sat: 9am-7pm | Sun: 9am-5pm',
  shortDisplay: 'Mon-Sat 9am-7pm, Sun 9am-5pm',
  headerDisplay: 'Office hours: Mon-Sat 9-7 | Sun 9-5',
};

export const GEO = {
  latitude: 51.5002,
  longitude: -2.5927,
};

export const FOUNDING_DATE = '2024';

// Update these when reviews change
export const REVIEW_COUNT = '31';
export const RATING_VALUE = '4.9';

export const AREAS_SERVED = [
  { type: 'City' as const, name: 'Bristol' },
  { type: 'Place' as const, name: 'Southmead' },
  { type: 'Place' as const, name: 'Westbury-on-Trym' },
  { type: 'Place' as const, name: 'Filton' },
  { type: 'Place' as const, name: 'Henleaze' },
  { type: 'Place' as const, name: 'Horfield' },
  { type: 'Place' as const, name: 'Bishopston' },
  { type: 'Place' as const, name: 'Stoke Bishop' },
  { type: 'Place' as const, name: 'Henbury' },
  { type: 'Place' as const, name: 'Brentry' },
  { type: 'Place' as const, name: 'Patchway' },
  { type: 'Place' as const, name: 'Bradley Stoke' },
  { type: 'Place' as const, name: 'Aztec West' },
  { type: 'Place' as const, name: 'Cribbs Causeway' },
  { type: 'Place' as const, name: 'Lockleaze' },
  { type: 'Place' as const, name: 'North Bristol' },
];

export const SAME_AS = [
  'https://share.google/m8qhZn8y0hSYzbgqx',
  // Add Facebook page URL when available
  // Add Instagram page URL when available
];

// Reviews data used in schema
export const REVIEWS = [
  {
    author: 'Lee Turner',
    rating: 5,
    text: 'Brought my X5 for a full valet that we won in a charity auction. The car has never looked cleaner. I was surprised!',
  },
  {
    author: 'Katie Wilkins',
    rating: 5,
    text: 'A brilliant, efficient 5 star service. All my family go there now. Brilliant service! The best!',
  },
  {
    author: 'Charles Russell-Smith',
    rating: 5,
    text: 'Excellent quick service at this car wash. They take the time to do a complete clean even inside door trims and the guys are always polite and efficient.',
  },
  {
    author: 'Danielle Price',
    rating: 5,
    text: 'Friendly staff that pay attention to detail! Would highly recommend them for a clean. Also, a waiting room for your convenience.',
  },
  {
    author: 'Natalia Mielewczyk',
    rating: 5,
    text: "I'm beyond impressed with the level of service. From the moment I arrived, the staff was friendly, professional, and thorough.",
  },
  {
    author: 'Jawad Burhan',
    rating: 5,
    text: 'One of the best car wash in Bristol! Indoor waiting area! Great customer service!',
  },
];
