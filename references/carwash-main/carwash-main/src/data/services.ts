// Central service definitions - pricing, features, FAQs, and metadata
// Used by service pages, pricing tables, booking form, nav, footer, and schema

export interface ServiceTier {
  name: string;
  features: string[];
  time?: string;
  prices: Record<string, number | string>;
  popular?: boolean;
  premium?: boolean;
}

export interface ServicePage {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  heroImage: string;
  shortName: string;
  description: string;
  usps: string[];
  tiers: ServiceTier[];
  faqs: { question: string; answer: string }[];
  schemaServiceType: string;
  relatedSlugs: string[];
}

export const SERVICE_PAGES: ServicePage[] = [
  {
    slug: 'caravan-cleaning-bristol',
    title: 'Caravan Cleaning & Valeting Bristol - Specialist Caravan Wash Service',
    metaTitle: 'Caravan Cleaning Bristol - Specialist Wash & Polish from \u00A320',
    metaDescription: 'Professional caravan cleaning and valeting in Bristol. Exterior wash from \u00A320, machine polish \u00A3280, interior polish \u00A3250. Black streak removal, roof cleaning, seasonal prep. Motorhomes welcome.',
    heroImage: '/images/Bristol-Van-valeting',
    shortName: 'Caravan Cleaning',
    description: 'Bristol\'s specialist caravan cleaning and valeting service. Whether your caravan has been sitting in storage all winter or needs a pre-season refresh, we provide a thorough professional clean that restores the showroom shine. We also clean motorhomes and campervans.',
    usps: [
      'The only specialist caravan cleaning service in the Bristol area',
      'Black streak removal using specialist products',
      'Roof cleaning - no need to climb up yourself',
      'Algae and moss removal after winter storage',
      'Mirror-finish quality - you can see your reflection',
      'Motorhomes and campervans welcome',
      'Convenient Southmead Road location - easy access for towed caravans',
      'Get your caravan season-ready or protect it before winter',
    ],
    tiers: [
      {
        name: 'Caravan Exterior Wash',
        features: ['Snow foam wash', 'Hand wash and hand dry', 'Window cleaning', 'Wheel and tyre cleaning', 'Black streak treatment'],
        time: '~30-45 min',
        prices: { caravan: 20 },
      },
      {
        name: 'Caravan Machine Polish',
        features: ['Full exterior wash', 'Machine polish entire body', 'Removes oxidation and fading', 'Restores colour and shine', 'Headlight restoration included', 'Mirror-finish quality'],
        time: '1-2 days',
        prices: { caravan: 280 },
      },
      {
        name: 'Caravan Interior Polish',
        features: ['All interior surfaces cleaned', 'Dashboard and worktops polished', 'Upholstery cleaned', 'Windows inside and out', 'All surfaces treated and protected'],
        prices: { caravan: 250 },
      },
      {
        name: 'Motorhome Wash',
        features: ['Snow foam wash', 'Hand wash and hand dry', 'Exterior cleaned thoroughly', 'Wheels and tyres', 'Price depends on size'],
        prices: { motorhome: 'Price on enquiry' },
      },
    ],
    faqs: [
      {
        question: 'How do I prepare my caravan for the season?',
        answer: 'We recommend a full exterior wash to remove winter grime, algae, and black streaks before your first trip. For caravans that have been stored for months, a machine polish restores the finish and protects the gelcoat. Book in between February and April for the best pre-season prep.',
      },
      {
        question: 'Can you remove black streaks from my caravan?',
        answer: 'Yes. Black streaks are the most common complaint among caravan owners. We use specialist caravan cleaning products that safely remove black streaks without damaging the gelcoat or paintwork. Most streaks come off with our exterior wash service.',
      },
      {
        question: 'Do I need to bring my caravan to you?',
        answer: 'Yes, please tow or drive your caravan to our Southmead Road location (290-294 Southmead Road, Bristol BS10 5EN). We have plenty of space for caravans and motorhomes. The site is easily accessible from the A38 and major Bristol routes.',
      },
      {
        question: 'How long does a caravan clean take?',
        answer: 'An exterior wash takes approximately 30-45 minutes. A full machine polish takes 1-2 days as we need to work carefully over the entire body. We recommend calling ahead for machine polish bookings so we can schedule enough time.',
      },
      {
        question: 'Do you clean motorhomes and campervans too?',
        answer: 'Yes, we clean motorhomes, campervans, and all types of leisure vehicles. Pricing depends on the size of the vehicle - please call us on 07 977 889747 for a quote.',
      },
    ],
    schemaServiceType: 'Caravan Cleaning and Valeting',
    relatedSlugs: ['van-wash-bristol', 'full-valet-bristol', 'car-detailing-bristol'],
  },
  {
    slug: 'van-wash-bristol',
    title: 'Van Wash & Van Valeting Bristol - Quick Trade Vehicle Cleaning',
    metaTitle: 'Van Wash Bristol - Quick Trade Vehicle Cleaning from \u00A315',
    metaDescription: 'Professional van wash and valeting in Bristol. 10-minute wash & wax from \u00A315. Perfect for tradespeople - minimal downtime, open 7 days. Fleet discounts available.',
    heroImage: '/images/Bristol-Van-valeting',
    shortName: 'Van Wash',
    description: 'Your van is your mobile billboard. Keep it looking professional with our quick, affordable van wash and valeting service. We understand tradespeople need speed and minimal downtime - our wash & wax takes just 10 minutes.',
    usps: [
      '10-minute wash & wax - minimal downtime for your business',
      'Open 7 days a week including Sundays',
      'Van-specific interior cleaning for construction dust and tool marks',
      'Faded paintwork restoration with machine polish',
      'Fleet discounts available for 3+ vehicles',
      'Card and contactless payments accepted',
      'Indoor waiting area with refreshments',
      'Luton van pricing available',
    ],
    tiers: [
      {
        name: 'Wash & Wax',
        features: ['Snow foam wash & hand dry', 'Windows inside & out', 'Tyre dressing (shine)', 'Door line cleaning'],
        time: '~10 min + queue',
        prices: { 'Van / SUV': 15, 'Luton': 15 },
      },
      {
        name: 'Bronze Wash',
        features: ['Everything in Wash & Wax', 'Hoover - seats, carpets, boot'],
        time: '~20 min',
        prices: { 'Van / SUV': 25, 'Luton': 25 },
      },
      {
        name: 'Silver Wash',
        features: ['Everything in Bronze Wash', 'All plastics cleaned & treated', 'Premium Autosmart materials'],
        time: '~30-35 min',
        prices: { 'Van / SUV': 30, 'Luton': 30 },
      },
      {
        name: 'Wash & Polish',
        features: ['Full exterior wash', 'Hand polish (cream polish)', 'Removes minor scratches', 'Restores shine - outside only'],
        time: '~30 min wash + 1 hr polish',
        prices: { 'Van / SUV': 50, 'Luton': 50 },
      },
      {
        name: 'Special Offer',
        features: ['Wash, dry & polish', 'Hoover - seats, carpets, boot', 'Windows inside & out', 'Dashboard & interior polish'],
        prices: { 'Van / SUV': 45, 'Luton': 45 },
        popular: true,
      },
      {
        name: 'Full Valet',
        features: ['Full wash, interior & exterior', 'Specialist chemicals throughout', 'All surfaces treated & shiny', 'Engine clean available'],
        time: '~5 hours',
        prices: { 'Van / SUV': 70, 'Luton': 70 },
        premium: true,
      },
      {
        name: 'Machine Polish - Short Wheelbase',
        features: ['Full machine polish', 'Restores faded paintwork', 'Removes deeper scratches', 'Headlight restoration included'],
        time: '~5 hours',
        prices: { 'Short WB Van': 150 },
      },
      {
        name: 'Machine Polish - Long Wheelbase',
        features: ['Full machine polish', 'Restores faded paintwork', 'Removes deeper scratches', 'Headlight restoration included'],
        prices: { 'Long WB Van': '250-300' },
      },
    ],
    faqs: [
      {
        question: 'How long does a van wash take?',
        answer: 'Our wash & wax takes approximately 10 minutes plus any queue time. A bronze wash is about 20 minutes, and a silver wash is 30-35 minutes. Full valets take around 5 hours as the interior needs time to dry.',
      },
      {
        question: 'Do you offer fleet discounts?',
        answer: 'Yes, we offer discounts for businesses with 3 or more vehicles. Contact us to discuss your requirements and we can set up a regular cleaning schedule with preferential rates.',
      },
      {
        question: 'Can you remove faded paintwork on my van?',
        answer: 'Yes, our machine polish service restores faded van paintwork and brings the colour back. Prices start from \u00A3150 for short wheelbase vans and \u00A3250-300 for long wheelbase vans. Headlight restoration is included with every machine polish.',
      },
      {
        question: 'Do I need to book for a van wash?',
        answer: 'No booking required for standard washes - just drive in during our opening hours (Mon-Sat 9am-7pm, Sun 9am-5pm). For full valets and machine polish, we recommend calling ahead on 07 977 889747.',
      },
      {
        question: 'Can you clean construction dust and plaster from the interior?',
        answer: 'Absolutely. We regularly clean trade vehicles with heavy interior soiling. Our hoover and compressed air system handles construction dust, plaster, and debris effectively. The silver wash and above include full plastics cleaning with specialist products.',
      },
    ],
    schemaServiceType: 'Van Wash and Valeting',
    relatedSlugs: ['car-wash-bristol', 'full-valet-bristol', 'car-detailing-bristol'],
  },
  {
    slug: 'car-wash-bristol',
    title: 'Car Wash Bristol - Professional Hand Car Wash in Southmead',
    metaTitle: 'Car Wash Bristol - Professional Hand Wash from \u00A310 | Southmead',
    metaDescription: 'Professional hand car wash in Southmead, Bristol. Snow foam wash from \u00A310, full valet from \u00A360. Autosmart products, hand dry, no booking required. Open 7 days.',
    heroImage: '/images/Bristol-car-wash',
    shortName: 'Car Wash',
    description: 'Professional hand car wash using premium Autosmart products - the same brand trusted by BMW and Land Rover dealerships. Every wash starts with a snow foam pre-wash that lifts dirt gently without scratching your paintwork, followed by hand washing, hand drying, and finishing touches.',
    usps: [
      'Snow foam pre-wash - gentle on paintwork, unlike cheap TFR sprays',
      'Autosmart professional products - used by BMW and Land Rover dealerships',
      'Hand dry - no machine streaks or water marks',
      'Door line cleaning included in every wash',
      'Tyre dressing included for a clean finish',
      'Windows cleaned inside and out (Bronze wash and above)',
      'Air compressor used for interior dust removal',
      'Silicon spray on dashboard for a fresh finish',
      'No booking required - just drive in',
      'Card, contactless and cash payments accepted',
      'Indoor waiting area while we work',
    ],
    tiers: [
      {
        name: 'Wash & Wax',
        features: ['Snow foam wash & hand dry', 'Windows inside & out', 'Tyre dressing (shine)', 'Door line cleaning'],
        time: '~10 min + queue',
        prices: { 'Small Car': 10, 'Van / SUV': 15, 'Luton': 15 },
      },
      {
        name: 'Bronze Wash',
        features: ['Everything in Wash & Wax', 'Hoover - seats, carpets, boot'],
        time: '~20 min',
        prices: { 'Small Car': 20, 'Van / SUV': 25, 'Luton': 25 },
      },
      {
        name: 'Silver Wash',
        features: ['Everything in Bronze Wash', 'All plastics cleaned & treated', 'Premium Autosmart materials'],
        time: '~30-35 min',
        prices: { 'Small Car': 25, 'Van / SUV': 30, 'Luton': 30 },
      },
      {
        name: 'Wash & Polish',
        features: ['Full exterior wash', 'Hand polish (cream polish)', 'Removes minor scratches', 'Restores shine - outside only'],
        time: '~30 min wash + 1 hr polish',
        prices: { 'Small Car': 40, 'Van / SUV': 50, 'Luton': 50 },
      },
      {
        name: 'Special Offer',
        features: ['Wash, dry & polish', 'Hoover - seats, carpets, boot', 'Windows inside & out', 'Dashboard & interior polish'],
        prices: { 'Small Car': 35, 'Van / SUV': 45, 'Luton': 45 },
        popular: true,
      },
      {
        name: 'Full Valet',
        features: ['Full wash, interior & exterior', 'Specialist chemicals throughout', 'All surfaces treated & shiny', 'Engine clean available'],
        time: '~5 hours',
        prices: { 'Small Car': 60, 'Van / SUV': 70, 'Luton': 70 },
        premium: true,
      },
    ],
    faqs: [
      {
        question: 'Do I need to book a car wash?',
        answer: 'No booking required for standard washes. Simply drive in during our opening hours (Mon-Sat 9am-7pm, Sun 9am-5pm). For full valets, we recommend calling ahead on 07 977 889747 as they take around 5 hours.',
      },
      {
        question: 'What products do you use?',
        answer: 'We use Autosmart professional products - the same brand trusted by BMW and Land Rover dealerships. These are premium cleaning products that are effective yet gentle on your paintwork. We never use cheap TFR (traffic film remover) sprays that can damage your clear coat.',
      },
      {
        question: 'What is snow foam and why does it matter?',
        answer: 'Snow foam is a thick, clinging pre-wash that covers your entire car and dissolves dirt, grime, and road film before we touch the paintwork. This means when we hand wash, there is less risk of scratching from trapped dirt particles. It is the safest way to start a car wash.',
      },
      {
        question: 'Can I wait while my car is being washed?',
        answer: 'Yes, we have a comfortable indoor waiting area. A wash & wax takes about 10 minutes, a bronze wash about 20 minutes, and a silver wash about 30-35 minutes. For full valets (approximately 5 hours), you may prefer to drop off and collect later.',
      },
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept cash, all major credit and debit cards, and contactless payments including Apple Pay and Google Pay.',
      },
    ],
    schemaServiceType: 'Car Wash',
    relatedSlugs: ['full-valet-bristol', 'car-detailing-bristol', 'headlight-restoration-bristol'],
  },
  {
    slug: 'car-detailing-bristol',
    title: 'Car Detailing & Machine Polish Bristol - Paint Correction from \u00A3100',
    metaTitle: 'Car Detailing Bristol - Machine Polish from \u00A3100 | Paint Correction',
    metaDescription: 'Professional car detailing and machine polishing in Bristol from \u00A3100. Removes scratches, swirl marks, and oxidation. Headlight restoration included. Bristol detailers charge \u00A3175-350.',
    heroImage: '/images/bristol-car-detailing',
    shortName: 'Car Detailing',
    description: 'Professional paint correction and machine polishing at a fraction of specialist detailing prices. Our machine polish removes deeper scratches, swirl marks, and oxidation that hand polishing cannot reach. Headlight restoration is included with every machine polish service.',
    usps: [
      'Machine polish from \u00A3100 - Bristol detailers charge \u00A3175-350',
      'Removes deeper scratches, swirl marks, and oxidation',
      'Headlight restoration included with every machine polish',
      'Restores faded van and car paintwork',
      'Hand polish standard in our Wash & Polish package',
      'Machine polish only on customer request - we never rush the process',
      'All hand polish work done by hand, machine polish only when requested',
    ],
    tiers: [
      {
        name: 'Wash & Polish (Hand)',
        features: ['Full exterior wash', 'Hand cream polish', 'Removes minor scratches', 'Restores shine - outside only', 'Wax is spray for water resistance, polish is the real deal'],
        time: '~1.5 hours',
        prices: { 'Small Car': 40, 'Van / SUV': 50 },
      },
      {
        name: 'Machine Polish - Small Car',
        features: ['Full machine polish', 'Removes deeper scratches & swirl marks', 'Corrects paint oxidation', 'Headlight restoration included'],
        time: '~3 hours',
        prices: { 'Small Car': 100 },
      },
      {
        name: 'Machine Polish - SUV',
        features: ['Full machine polish', 'Removes deeper scratches & swirl marks', 'Corrects paint oxidation', 'Headlight restoration included'],
        prices: { 'SUV': 150 },
      },
      {
        name: 'Machine Polish - Short Wheelbase Van',
        features: ['Full machine polish', 'Restores faded van paintwork', 'Brings the colour back', 'Headlight restoration included'],
        time: '~5 hours',
        prices: { 'Short WB Van': 150 },
      },
      {
        name: 'Machine Polish - Long Wheelbase Van',
        features: ['Full machine polish', 'Restores faded van paintwork', 'Brings the colour back', 'Headlight restoration included'],
        prices: { 'Long WB Van': '250-300' },
      },
      {
        name: 'Headlight Restoration',
        features: ['Yellowed or cloudy headlights restored', 'Improves visibility and safety', 'Helps pass MOT'],
        time: '~30 min',
        prices: { 'Per pair': 20 },
      },
    ],
    faqs: [
      {
        question: 'What is the difference between hand polish and machine polish?',
        answer: 'Hand polish uses a cream polish applied by hand to remove minor surface scratches and restore shine. It is included in our Wash & Polish package (\u00A340/\u00A350). Machine polish uses a rotary or dual-action machine that cuts deeper into the clear coat to remove scratches, swirl marks, and oxidation that hand polishing cannot reach. Machine polish starts at \u00A3100.',
      },
      {
        question: 'How much does machine polishing cost compared to other Bristol detailers?',
        answer: 'Our machine polish starts at \u00A3100 for a small car. Most Bristol detailing specialists charge \u00A3175-350 for the same service. We offer the same quality results at significantly lower prices because we are a high-volume car wash rather than a boutique detailer.',
      },
      {
        question: 'Is headlight restoration included?',
        answer: 'Headlight restoration is included free of charge with every machine polish service. As a standalone service, headlight restoration costs just \u00A320.',
      },
      {
        question: 'Can you restore faded van paintwork?',
        answer: 'Yes, machine polishing is particularly effective at restoring faded van and commercial vehicle paintwork. We can bring the colour back on panels that have dulled from sun exposure and weathering. Prices start from \u00A3150 for short wheelbase vans.',
      },
      {
        question: 'Do I need to book for machine polishing?',
        answer: 'Yes, we recommend calling ahead on 07 977 889747 to book machine polishing. It takes 3-5 hours depending on the vehicle size, so we need to schedule time accordingly.',
      },
    ],
    schemaServiceType: 'Car Detailing and Paint Correction',
    relatedSlugs: ['car-wash-bristol', 'headlight-restoration-bristol', 'full-valet-bristol'],
  },
  {
    slug: 'full-valet-bristol',
    title: 'Full Valet Bristol - Complete Interior & Exterior Car Valet from \u00A360',
    metaTitle: 'Full Valet Bristol - Interior & Exterior from \u00A360 | 5-Star Service',
    metaDescription: 'Complete car valet in Bristol from \u00A360. Full interior & exterior clean with specialist chemicals. UK average is \u00A387-150. Engine clean available. Drop off and collect.',
    heroImage: '/images/Bristol-car-valeting-cheap',
    shortName: 'Full Valet',
    description: 'Our full valet is a complete transformation for your vehicle. Every surface is cleaned with specialist chemicals, all plastics and trim are treated and made shiny, and the entire interior is deep cleaned. The UK average for a full valet is \u00A387-150 - ours starts at just \u00A360.',
    usps: [
      'Full valet from \u00A360 - UK average is \u00A387-150',
      'Every surface cleaned with specialist chemicals',
      'All interior and exterior surfaces treated',
      'Engine clean available (at customer\'s own risk)',
      'Drop off and collect later, or wait in our indoor area',
      'Last full valet booking at 2pm - allows drying time before close',
    ],
    tiers: [
      {
        name: 'Full Valet - Small Car',
        features: ['Full exterior wash & dry', 'Complete interior deep clean', 'All plastics cleaned & treated', 'Dashboard, door cards, and console', 'Seats and carpets shampooed', 'Windows inside & out', 'Tyre dressing', 'Engine clean available'],
        time: '~5 hours',
        prices: { 'Small Car': 60 },
      },
      {
        name: 'Full Valet - Van / SUV',
        features: ['Full exterior wash & dry', 'Complete interior deep clean', 'All plastics cleaned & treated', 'Dashboard, door cards, and console', 'Seats and carpets shampooed', 'Windows inside & out', 'Tyre dressing', 'Engine clean available'],
        time: '~5 hours',
        prices: { 'Van / SUV': 70 },
        premium: true,
      },
    ],
    faqs: [
      {
        question: 'How long does a full valet take?',
        answer: 'A full valet typically takes around 5 hours. The seats and interior need time to dry properly. We recommend dropping off your vehicle and collecting it later, or you can wait in our indoor waiting area.',
      },
      {
        question: 'What time is the last full valet booking?',
        answer: 'The last full valet booking is at 2pm. This allows enough drying time before we close. We are open Mon-Sat until 7pm and Sunday until 5pm.',
      },
      {
        question: 'Is the engine clean safe?',
        answer: 'Engine cleaning is available as part of the full valet, but it is carried out at the customer\'s own risk. Modern engines are generally safe to clean, but we recommend discussing this with us first if your vehicle has any known electrical issues.',
      },
      {
        question: 'How does your price compare to other Bristol valets?',
        answer: 'Our full valet starts at \u00A360 for a small car and \u00A370 for vans and SUVs. The UK average for a full valet is \u00A387-150, so we offer exceptional value without compromising on quality.',
      },
    ],
    schemaServiceType: 'Full Car Valet',
    relatedSlugs: ['car-wash-bristol', 'car-detailing-bristol', 'van-wash-bristol'],
  },
  {
    slug: 'headlight-restoration-bristol',
    title: 'Headlight Restoration Bristol - Bring Your Headlights Back to New for \u00A320',
    metaTitle: 'Headlight Restoration Bristol - Just \u00A320 | Clear Headlights in 30 Min',
    metaDescription: 'Headlight restoration in Bristol for just \u00A320. Yellowed, cloudy, or oxidised headlights restored to clear. Improves visibility and MOT chances. Walk-in, no appointment needed.',
    heroImage: '/images/bristol-car-detailing',
    shortName: 'Headlight Restoration',
    description: 'Over time, headlights become yellowed, cloudy, and oxidised from UV exposure and road grime. This reduces your visibility at night and can cause an MOT failure. Our headlight restoration brings them back to near-new clarity for just \u00A320 - most competitors charge \u00A325-35 per headlight or \u00A3100+ per pair.',
    usps: [
      'Just \u00A320 per pair - competitors charge \u00A325-35 per headlight',
      'Restores yellowed, cloudy, and oxidised headlights',
      'Improves night visibility and driving safety',
      'Helps your car pass its MOT (headlight clarity is checked)',
      'Included free with any machine polish service',
      'Walk-in, no appointment needed - takes about 30 minutes',
      'See the difference immediately',
    ],
    tiers: [
      {
        name: 'Headlight Restoration',
        features: ['Both headlights restored', 'Yellowing and cloudiness removed', 'Oxidation buffed out', 'Clear, bright finish'],
        time: '~30 min',
        prices: { 'Per pair': 20 },
      },
    ],
    faqs: [
      {
        question: 'Why do headlights go yellow and cloudy?',
        answer: 'Modern headlight lenses are made from polycarbonate plastic with a UV-resistant clear coat. Over time, UV exposure breaks down this coating, causing the plastic to oxidise and turn yellow or cloudy. Road debris, chemicals, and weather accelerate the process.',
      },
      {
        question: 'Will headlight restoration help me pass my MOT?',
        answer: 'Yes, headlight clarity is checked during an MOT. Cloudy or yellowed headlights can reduce light output below the required threshold, causing a fail. Restoring your headlights before an MOT is a quick, cheap way to avoid problems.',
      },
      {
        question: 'How long does headlight restoration take?',
        answer: 'Approximately 30 minutes for both headlights. No appointment needed - just walk in during our opening hours (Mon-Sat 9am-7pm, Sun 9am-5pm).',
      },
      {
        question: 'Is headlight restoration included with machine polishing?',
        answer: 'Yes, headlight restoration is included free of charge with every machine polish service. As a standalone service, it costs \u00A320.',
      },
      {
        question: 'How does your price compare to other headlight restoration services?',
        answer: 'We charge \u00A320 for both headlights (per pair). Many competitors charge \u00A325-35 per headlight, and some specialist services charge \u00A3100 or more per pair. We offer the same quality restoration at a fraction of the cost.',
      },
    ],
    schemaServiceType: 'Headlight Restoration',
    relatedSlugs: ['car-detailing-bristol', 'car-wash-bristol', 'full-valet-bristol'],
  },
];

// Helper to look up a service by slug
export function getServiceBySlug(slug: string): ServicePage | undefined {
  return SERVICE_PAGES.find(s => s.slug === slug);
}

// Export navigation-ready list for header dropdown and footer links
export function getServiceNavItems() {
  return SERVICE_PAGES.map(s => ({
    label: s.shortName,
    slug: s.slug,
    href: `/${s.slug}/`,
  }));
}
