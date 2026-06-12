// Schema.org JSON-LD generation helpers
// Used by Layout.astro (global schemas) and service pages (per-page schemas)

import {
  SITE_URL, BUSINESS_NAME, LEGAL_NAME, PHONE_INTL, EMAIL,
  ADDRESS, GEO, FOUNDING_DATE, REVIEW_COUNT, RATING_VALUE,
  AREAS_SERVED, SAME_AS, REVIEWS,
} from '../data/site-config';
import type { ServicePage } from '../data/services';

export function getLocalBusinessSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "AutoWash",
    "@id": `${SITE_URL}/#business`,
    "name": BUSINESS_NAME,
    "legalName": LEGAL_NAME,
    "description": "Foam Office - the office-themed hand car wash in Southmead, Bristol. Professional cleaning for hard-working cars: car wash, van wash, caravan cleaning, ceramic coating, car detailing, and full valet packages at affordable prices.",
    "url": SITE_URL,
    "telephone": PHONE_INTL,
    "email": EMAIL,
    "foundingDate": FOUNDING_DATE,
    "priceRange": "\u00A3",
    "currenciesAccepted": "GBP",
    "paymentAccepted": "Cash, Credit Card, Debit Card, Apple Pay, Google Pay, Contactless",
    "image": [
      `${SITE_URL}/images/Bristol-Car-Valeting.webp`,
      `${SITE_URL}/images/Bristol-van-wash.webp`,
      `${SITE_URL}/images/foam-office-logo.svg`,
    ],
    "logo": {
      "@type": "ImageObject",
      "url": `${SITE_URL}/images/foam-office-logo.svg`,
      "width": 330,
      "height": 120,
    },
    "address": {
      "@type": "PostalAddress",
      "streetAddress": ADDRESS.street,
      "addressLocality": ADDRESS.locality,
      "addressRegion": ADDRESS.region,
      "postalCode": ADDRESS.postcode,
      "addressCountry": ADDRESS.country,
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": GEO.latitude,
      "longitude": GEO.longitude,
    },
    "hasMap": ADDRESS.mapUrl,
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "opens": "09:00",
        "closes": "19:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": "Sunday",
        "opens": "09:00",
        "closes": "17:00",
      },
    ],
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": RATING_VALUE,
      "reviewCount": REVIEW_COUNT,
      "bestRating": "5",
      "worstRating": "1",
    },
    "review": REVIEWS.map(r => ({
      "@type": "Review",
      "author": { "@type": "Person", "name": r.author },
      "reviewRating": { "@type": "Rating", "ratingValue": String(r.rating), "bestRating": "5" },
      "reviewBody": r.text,
    })),
    "sameAs": SAME_AS,
    "areaServed": AREAS_SERVED.map(a => ({
      "@type": a.type,
      "name": a.name,
    })),
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Car Wash & Valeting Services",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": { "@type": "Service", "name": "Probation Wash (Wash & Wax)", "description": "Snow foam wash, hand dry, windows inside & out, tyre dressing, door line cleaning" },
          "price": "10",
          "priceCurrency": "GBP",
        },
        {
          "@type": "Offer",
          "itemOffered": { "@type": "Service", "name": "Junior Wash (Bronze)", "description": "Everything in the Probation Wash plus hoover (seats, carpets, boot)" },
          "price": "20",
          "priceCurrency": "GBP",
        },
        {
          "@type": "Offer",
          "itemOffered": { "@type": "Service", "name": "Team Leader Wash (Silver)", "description": "Everything in the Junior Wash plus all plastics cleaned & treated with premium Autosmart materials" },
          "price": "25",
          "priceCurrency": "GBP",
        },
        {
          "@type": "Offer",
          "itemOffered": { "@type": "Service", "name": "Performance Review Polish (Wash & Polish)", "description": "Full exterior wash plus hand polish (cream polish to remove minor scratches and restore shine), outside only" },
          "price": "40",
          "priceCurrency": "GBP",
        },
        {
          "@type": "Offer",
          "itemOffered": { "@type": "Service", "name": "Employee of the Month (Special Offer)", "description": "Wash, dry & polish, hoover (seats, carpets, boot), windows inside & out, dashboard & interior polish" },
          "price": "35",
          "priceCurrency": "GBP",
        },
        {
          "@type": "Offer",
          "itemOffered": { "@type": "Service", "name": "Managing Director Valet (Full Valet)", "description": "Full wash, interior & exterior cleaned with specialist chemicals, all surfaces treated, engine clean available" },
          "price": "60",
          "priceCurrency": "GBP",
        },
        {
          "@type": "Offer",
          "itemOffered": { "@type": "Service", "name": "Caravan Wash", "description": "Professional caravan exterior wash with snow foam, hand wash, and black streak removal" },
          "price": "20",
          "priceCurrency": "GBP",
        },
        {
          "@type": "Offer",
          "itemOffered": { "@type": "Service", "name": "Ceramic Coating", "description": "Long-lasting nano-ceramic paint protection with machine polish preparation included. Cars, vans, SUVs, caravans and motorhomes" },
          "price": "250",
          "priceCurrency": "GBP",
        },
        {
          "@type": "Offer",
          "itemOffered": { "@type": "Service", "name": "Machine Polish", "description": "Machine polishing to remove deeper scratches, swirl marks, and oxidation. Headlight restoration included" },
          "price": "100",
          "priceCurrency": "GBP",
        },
        {
          "@type": "Offer",
          "itemOffered": { "@type": "Service", "name": "Headlight Restoration", "description": "Restore yellowed, cloudy, and oxidised headlights to near-new clarity" },
          "price": "20",
          "priceCurrency": "GBP",
        },
      ],
    },
  };
}

export function getOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    "name": BUSINESS_NAME,
    "legalName": LEGAL_NAME,
    "url": SITE_URL,
    "logo": `${SITE_URL}/images/foam-office-logo.svg`,
    "foundingDate": FOUNDING_DATE,
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": PHONE_INTL,
      "contactType": "customer service",
      "email": EMAIL,
      "availableLanguage": "English",
    },
    "address": {
      "@type": "PostalAddress",
      "streetAddress": ADDRESS.street,
      "addressLocality": ADDRESS.locality,
      "postalCode": ADDRESS.postcode,
      "addressCountry": ADDRESS.country,
    },
    "sameAs": SAME_AS,
  };
}

export function getWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    "name": BUSINESS_NAME,
    "url": SITE_URL,
    "publisher": {
      "@id": `${SITE_URL}/#organization`,
    },
  };
}

export function getBreadcrumbSchema(crumbs: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": crumb.name,
      "item": crumb.url,
    })),
  };
}

export function getServicePageSchema(service: ServicePage) {
  const offers = service.tiers
    .filter(t => {
      const firstPrice = Object.values(t.prices)[0];
      return typeof firstPrice === 'number';
    })
    .map(t => {
      const firstPrice = Object.values(t.prices)[0];
      return {
        "@type": "Offer" as const,
        "name": t.name,
        "price": String(firstPrice),
        "priceCurrency": "GBP",
      };
    });

  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": service.title,
    "serviceType": service.schemaServiceType,
    "provider": { "@id": `${SITE_URL}/#business` },
    "areaServed": { "@type": "City", "name": "Bristol" },
    "url": `${SITE_URL}/${service.slug}/`,
    "description": service.metaDescription,
    "offers": offers,
  };
}

export function getFaqPageSchema(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.answer,
      },
    })),
  };
}

// Global FAQ schema (used on homepage and contact page)
export function getGlobalFaqSchema() {
  return getFaqPageSchema([
    {
      question: 'Do I need to book in advance?',
      answer: 'No booking required! Simply drive in during our opening hours. For larger vehicles or full valets, we recommend calling ahead to ensure minimal wait time.',
    },
    {
      question: 'How long does a full valet take?',
      answer: 'A full valet typically takes around 5 hours as the seats and interior need time to dry. We recommend dropping off your car and collecting it later. Last full valet booking is at 2pm to allow drying time before closing.',
    },
    {
      question: 'Do you offer mobile valeting services?',
      answer: 'Yes, we offer mobile valeting for vans and larger vehicles. Contact us to discuss your requirements and get a quote.',
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept cash, all major credit and debit cards, and contactless payments including Apple Pay and Google Pay.',
    },
  ]);
}
