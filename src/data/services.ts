// Central service definitions - pricing, features, FAQs, and metadata
// Used by service pages, pricing tables, booking form, nav, footer, and schema
//
// Brand voice: Foam Office - the car wash that runs like an office.
// Tier names follow the career ladder (Probation Wash -> Managing Director Valet).
// Keep the joke in names and descriptions; keep prices, times, and FAQs factual.

export interface ServiceTier {
  name: string;
  subtitle?: string;
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
  department: string;
  description: string;
  usps: string[];
  tiers: ServiceTier[];
  faqs: { question: string; answer: string }[];
  schemaServiceType: string;
  relatedSlugs: string[];
  featured?: boolean;
}

export const SERVICE_PAGES: ServicePage[] = [
  {
    slug: 'ceramic-coating-bristol',
    title: 'Ceramic Coating Bristol - Long-Term Paint Protection',
    metaTitle: 'Ceramic Coating Bristol - Long-Term Paint Protection from £250',
    metaDescription: 'Professional ceramic coating in Bristol from £250. Long-lasting hydrophobic paint protection, deep gloss, easier washing. Machine polish prep included. Cars, vans, SUVs and caravans.',
    heroImage: '/images/bristol-car-polish',
    shortName: 'Ceramic Coating',
    department: 'The Permanent Contract',
    description: 'Most washes are temporary placements. Ceramic coating is the permanent contract: a professionally applied nano-ceramic layer that bonds to your paintwork and keeps working long after it leaves the building. Water beads off, dirt struggles to stick, and the deep gloss stays put through Bristol winters. Every coating includes full decontamination and machine polish preparation - the coating locks in the finish we create underneath it.',
    usps: [
      'Long-lasting hydrophobic protection - water and grime bead straight off',
      'Deep, glass-like gloss that survives the British weather',
      'Full wash, decontamination and machine polish prep included',
      'Makes every future wash faster, safer and cheaper',
      'UV protection against paint fading',
      'Cars, SUVs, vans, caravans and motorhomes all coated',
      'Aftercare advice included - we tell you exactly how to look after it',
      'Far cheaper than a respray when the paint gives up',
    ],
    tiers: [
      {
        name: 'Ceramic Coating - Small Car',
        subtitle: 'Includes machine polish prep',
        features: ['Full wash and decontamination', 'Machine polish paint correction', 'Nano-ceramic coating applied to all paintwork', 'Hydrophobic finish - water beads off', 'Aftercare guidance included'],
        time: '1-2 days',
        prices: { 'Small Car': 250 },
      },
      {
        name: 'Ceramic Coating - SUV',
        subtitle: 'Includes machine polish prep',
        features: ['Full wash and decontamination', 'Machine polish paint correction', 'Nano-ceramic coating applied to all paintwork', 'Hydrophobic finish - water beads off', 'Aftercare guidance included'],
        time: '1-2 days',
        prices: { 'SUV': 300 },
        popular: true,
      },
      {
        name: 'Ceramic Coating - Van',
        subtitle: 'Includes machine polish prep',
        features: ['Full wash and decontamination', 'Machine polish paint correction', 'Nano-ceramic coating applied to all paintwork', 'Protects signwriting and livery', 'Aftercare guidance included'],
        time: '1-2 days',
        prices: { 'Van': 350 },
      },
      {
        name: 'Ceramic Coating - Caravan / Motorhome',
        subtitle: 'Gelcoat-safe protection',
        features: ['Full wash and black streak removal', 'Machine polish where required', 'Ceramic protection for gelcoat and panels', 'Dramatically reduces black streaks', 'Price depends on size'],
        prices: { 'Caravan / Motorhome': 'Price on enquiry' },
        premium: true,
      },
    ],
    faqs: [
      {
        question: 'What does ceramic coating actually do?',
        answer: 'A ceramic coating is a liquid polymer that chemically bonds with your paintwork and cures into a hard, glossy protective layer. It repels water and dirt (hydrophobic effect), protects against UV fading and bird mess etching, and makes washing dramatically easier. Unlike wax, which lasts weeks, a properly applied ceramic coating lasts years.',
      },
      {
        question: 'Why is machine polishing included?',
        answer: 'A ceramic coating locks in whatever finish is underneath it - including swirl marks and scratches if they are not corrected first. That is why we always machine polish before coating. You get paint correction and protection in one visit, and the coating preserves that corrected finish.',
      },
      {
        question: 'How long does ceramic coating take?',
        answer: 'Allow 1-2 days. The paintwork needs to be washed, decontaminated, machine polished, and fully dry before the coating is applied, and the coating then needs time to cure before the car goes back out in the weather. We recommend booking ahead on 07 977 889747.',
      },
      {
        question: 'How do I look after a ceramic coated car?',
        answer: 'Easily - that is the point. Regular gentle washes (our Probation Wash is ideal) keep it performing. Avoid harsh chemicals and automated brush washes. We give you simple aftercare guidance when you collect the car.',
      },
      {
        question: 'Can you ceramic coat my caravan or motorhome?',
        answer: 'Yes, and it is one of the best things you can do for one. Ceramic protection on gelcoat dramatically reduces black streaks and algae adhesion, which are the two biggest caravan cleaning headaches. Pricing depends on size - call us for a quote.',
      },
      {
        question: 'Is ceramic coating worth it compared to waxing?',
        answer: 'If you plan to keep the vehicle more than a year, usually yes. A wax needs reapplying every few weeks. A ceramic coating is a one-off cost that keeps protecting for years, keeps the gloss deeper, and cuts the time and cost of every wash that follows.',
      },
    ],
    schemaServiceType: 'Ceramic Coating and Paint Protection',
    relatedSlugs: ['car-detailing-bristol', 'caravan-cleaning-bristol', 'full-valet-bristol'],
    featured: true,
  },
  {
    slug: 'caravan-cleaning-bristol',
    title: 'Caravan Cleaning & Valeting Bristol - Specialist Caravan Wash Service',
    metaTitle: 'Caravan Cleaning Bristol - Specialist Wash & Polish from £20',
    metaDescription: 'Professional caravan cleaning and valeting in Bristol. Exterior wash from £20, machine polish £280, interior polish £250. Black streak removal, roof cleaning, seasonal prep. Motorhomes welcome.',
    heroImage: '/images/Bristol-Van-valeting',
    shortName: 'Caravan Cleaning',
    department: 'The Caravan Division',
    description: 'Your caravan spends most of the year on gardening leave - then gets asked to perform all summer. The Caravan Division is Bristol’s specialist caravan cleaning and valeting service: black streak removal, roof cleaning, algae and moss removal after winter storage, and a finish you can see your reflection in. Motorhomes and campervans are welcome too.',
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
        subtitle: 'The seasonal check-in',
        features: ['Snow foam wash', 'Hand wash and hand dry', 'Window cleaning', 'Wheel and tyre cleaning', 'Black streak treatment'],
        time: '~30-45 min',
        prices: { caravan: 20 },
        popular: true,
      },
      {
        name: 'Caravan Machine Polish',
        subtitle: 'The full performance review',
        features: ['Full exterior wash', 'Machine polish entire body', 'Removes oxidation and fading', 'Restores colour and shine', 'Headlight restoration included', 'Mirror-finish quality'],
        time: '1-2 days',
        prices: { caravan: 280 },
      },
      {
        name: 'Caravan Interior Polish',
        subtitle: 'Desk-to-dinette deep clean',
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
      {
        question: 'Can my caravan be ceramic coated?',
        answer: 'Yes - ceramic coating is excellent on caravans because it dramatically reduces black streak and algae adhesion. See our ceramic coating service, or ask when you book.',
      },
    ],
    schemaServiceType: 'Caravan Cleaning and Valeting',
    relatedSlugs: ['ceramic-coating-bristol', 'van-wash-bristol', 'full-valet-bristol'],
    featured: true,
  },
  {
    slug: 'car-wash-bristol',
    title: 'Car Wash Bristol - Professional Hand Car Wash in Southmead',
    metaTitle: 'Car Wash Bristol - Professional Hand Wash from £10 | Southmead',
    metaDescription: 'Professional hand car wash in Southmead, Bristol. Snow foam wash from £10, full valet from £60. Autosmart products, hand dry, no booking required. Open 7 days.',
    heroImage: '/images/Bristol-car-wash',
    shortName: 'Car Wash',
    department: 'The Standard Workday',
    description: 'Every car at Foam Office starts somewhere on the ladder. Whether yours is on a Probation Wash or has earned the Managing Director Valet, the process is the same: a snow foam pre-wash that lifts dirt gently without scratching, premium Autosmart products (the same brand trusted by BMW and Land Rover dealerships), hand washing, and hand drying. Clock in dirty, clock out spotless.',
    usps: [
      'Snow foam pre-wash - gentle on paintwork, unlike cheap TFR sprays',
      'Autosmart professional products - used by BMW and Land Rover dealerships',
      'Hand dry - no machine streaks or water marks',
      'Door line cleaning included in every wash',
      'Tyre dressing included for a clean finish',
      'Windows cleaned inside and out (Junior Wash and above)',
      'Air compressor used for interior dust removal',
      'No booking required - just drive in',
      'Card, contactless and cash payments accepted',
      'Indoor waiting area while your car is in its meeting',
    ],
    tiers: [
      {
        name: 'Probation Wash',
        subtitle: 'Wash & wax - the quick trial period',
        features: ['Snow foam wash & hand dry', 'Windows inside & out', 'Tyre dressing (shine)', 'Door line cleaning'],
        time: '~10 min + queue',
        prices: { 'Small Car': 10, 'Van / SUV': 15, 'Luton': 15 },
      },
      {
        name: 'Junior Wash',
        subtitle: 'Bronze - first promotion',
        features: ['Everything in the Probation Wash', 'Hoover - seats, carpets, boot'],
        time: '~20 min',
        prices: { 'Small Car': 20, 'Van / SUV': 25, 'Luton': 25 },
      },
      {
        name: 'Team Leader Wash',
        subtitle: 'Silver - now with responsibilities',
        features: ['Everything in the Junior Wash', 'All plastics cleaned & treated', 'Premium Autosmart materials'],
        time: '~30-35 min',
        prices: { 'Small Car': 25, 'Van / SUV': 30, 'Luton': 30 },
      },
      {
        name: 'Performance Review Polish',
        subtitle: 'Wash & hand polish',
        features: ['Full exterior wash', 'Hand polish (cream polish)', 'Removes minor scratches', 'Restores shine - outside only'],
        time: '~30 min wash + 1 hr polish',
        prices: { 'Small Car': 40, 'Van / SUV': 50, 'Luton': 50 },
      },
      {
        name: 'Employee of the Month',
        subtitle: 'Our best-value package',
        features: ['Wash, dry & polish', 'Hoover - seats, carpets, boot', 'Windows inside & out', 'Dashboard & interior polish'],
        prices: { 'Small Car': 35, 'Van / SUV': 45, 'Luton': 45 },
        popular: true,
      },
      {
        name: 'Managing Director Valet',
        subtitle: 'Full valet - top of the company',
        features: ['Full wash, interior & exterior', 'Specialist chemicals throughout', 'All surfaces treated & shiny', 'Engine clean available'],
        time: '~5 hours',
        prices: { 'Small Car': 60, 'Van / SUV': 70, 'Luton': 70 },
        premium: true,
      },
    ],
    faqs: [
      {
        question: 'Do I need to book a car wash?',
        answer: 'No booking required for standard washes. Simply drive in during our opening hours (Mon-Sat 9am-7pm, Sun 9am-5pm). For the Managing Director Valet (full valet), we recommend calling ahead on 07 977 889747 as it takes around 5 hours.',
      },
      {
        question: 'What do the package names mean?',
        answer: 'They are our career ladder. Probation Wash is the quick wash & wax, Junior Wash adds a full hoover, Team Leader Wash adds plastics cleaning and treatment, Employee of the Month is our best-value wash-dry-polish combination, and the Managing Director Valet is the complete full valet. Same professional cleaning at every level - your car just climbs the ladder.',
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
        answer: 'Yes, we have a comfortable indoor waiting area. A Probation Wash takes about 10 minutes, a Junior Wash about 20 minutes, and a Team Leader Wash about 30-35 minutes. For full valets (approximately 5 hours), you may prefer to drop off and collect later.',
      },
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept cash, all major credit and debit cards, and contactless payments including Apple Pay and Google Pay.',
      },
    ],
    schemaServiceType: 'Car Wash',
    relatedSlugs: ['ceramic-coating-bristol', 'full-valet-bristol', 'car-detailing-bristol'],
  },
  {
    slug: 'van-wash-bristol',
    title: 'Van Wash & Van Valeting Bristol - Quick Trade Vehicle Cleaning',
    metaTitle: 'Van Wash Bristol - Quick Trade Vehicle Cleaning from £15',
    metaDescription: 'Professional van wash and valeting in Bristol. 10-minute wash & wax from £15. Perfect for tradespeople - minimal downtime, open 7 days. Fleet discounts available.',
    heroImage: '/images/Bristol-Van-valeting',
    shortName: 'Van Wash',
    department: 'The Fleet Department',
    description: 'Your van is your hardest-working employee and your mobile billboard, so it should not look like it slept in the warehouse. The Fleet Department keeps trade vehicles presentable with minimal downtime - our wash & wax takes just 10 minutes, and fleet discounts are available for 3+ vehicles.',
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
        name: 'Probation Wash',
        subtitle: 'Wash & wax - in and out in 10 minutes',
        features: ['Snow foam wash & hand dry', 'Windows inside & out', 'Tyre dressing (shine)', 'Door line cleaning'],
        time: '~10 min + queue',
        prices: { 'Van / SUV': 15, 'Luton': 15 },
      },
      {
        name: 'Junior Wash',
        subtitle: 'Bronze - adds the hoover',
        features: ['Everything in the Probation Wash', 'Hoover - seats, carpets, boot'],
        time: '~20 min',
        prices: { 'Van / SUV': 25, 'Luton': 25 },
      },
      {
        name: 'Team Leader Wash',
        subtitle: 'Silver - plastics cleaned & treated',
        features: ['Everything in the Junior Wash', 'All plastics cleaned & treated', 'Premium Autosmart materials'],
        time: '~30-35 min',
        prices: { 'Van / SUV': 30, 'Luton': 30 },
      },
      {
        name: 'Performance Review Polish',
        subtitle: 'Wash & hand polish',
        features: ['Full exterior wash', 'Hand polish (cream polish)', 'Removes minor scratches', 'Restores shine - outside only'],
        time: '~30 min wash + 1 hr polish',
        prices: { 'Van / SUV': 50, 'Luton': 50 },
      },
      {
        name: 'Employee of the Month',
        subtitle: 'Our best-value package',
        features: ['Wash, dry & polish', 'Hoover - seats, carpets, boot', 'Windows inside & out', 'Dashboard & interior polish'],
        prices: { 'Van / SUV': 45, 'Luton': 45 },
        popular: true,
      },
      {
        name: 'Managing Director Valet',
        subtitle: 'Full valet - the works',
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
        answer: 'Our wash & wax takes approximately 10 minutes plus any queue time. A Junior Wash is about 20 minutes, and a Team Leader Wash is 30-35 minutes. Full valets take around 5 hours as the interior needs time to dry.',
      },
      {
        question: 'Do you offer fleet discounts?',
        answer: 'Yes, we offer discounts for businesses with 3 or more vehicles. Contact us to discuss your requirements and we can set up a regular cleaning schedule with preferential rates.',
      },
      {
        question: 'Can you remove faded paintwork on my van?',
        answer: 'Yes, our machine polish service restores faded van paintwork and brings the colour back. Prices start from £150 for short wheelbase vans and £250-300 for long wheelbase vans. Headlight restoration is included with every machine polish.',
      },
      {
        question: 'Do I need to book for a van wash?',
        answer: 'No booking required for standard washes - just drive in during our opening hours (Mon-Sat 9am-7pm, Sun 9am-5pm). For full valets and machine polish, we recommend calling ahead on 07 977 889747.',
      },
      {
        question: 'Can you clean construction dust and plaster from the interior?',
        answer: 'Absolutely. We regularly clean trade vehicles with heavy interior soiling. Our hoover and compressed air system handles construction dust, plaster, and debris effectively. The Team Leader Wash and above include full plastics cleaning with specialist products.',
      },
    ],
    schemaServiceType: 'Van Wash and Valeting',
    relatedSlugs: ['car-wash-bristol', 'ceramic-coating-bristol', 'full-valet-bristol'],
  },
  {
    slug: 'car-detailing-bristol',
    title: 'Car Detailing & Machine Polish Bristol - Paint Correction from £100',
    metaTitle: 'Car Detailing Bristol - Machine Polish from £100 | Paint Correction',
    metaDescription: 'Professional car detailing and machine polishing in Bristol from £100. Removes scratches, swirl marks, and oxidation. Headlight restoration included. Bristol detailers charge £175-350.',
    heroImage: '/images/bristol-car-detailing',
    shortName: 'Car Detailing',
    department: 'The Annual Performance Review',
    description: 'Some paintwork needs more than a pep talk. Our machine polish is the deep, honest performance review for your car’s finish: it removes the scratches, swirl marks, and oxidation that hand polishing cannot reach, at a fraction of specialist detailing prices. Headlight restoration is included with every machine polish.',
    usps: [
      'Machine polish from £100 - Bristol detailers charge £175-350',
      'Removes deeper scratches, swirl marks, and oxidation',
      'Headlight restoration included with every machine polish',
      'Restores faded van and car paintwork',
      'Hand polish standard in our Performance Review Polish package',
      'Machine polish only on customer request - we never rush the process',
      'Ideal preparation step before ceramic coating',
    ],
    tiers: [
      {
        name: 'Performance Review Polish (Hand)',
        subtitle: 'Wash & hand polish',
        features: ['Full exterior wash', 'Hand cream polish', 'Removes minor scratches', 'Restores shine - outside only', 'Wax is spray for water resistance, polish is the real deal'],
        time: '~1.5 hours',
        prices: { 'Small Car': 40, 'Van / SUV': 50 },
      },
      {
        name: 'Machine Polish - Small Car',
        features: ['Full machine polish', 'Removes deeper scratches & swirl marks', 'Corrects paint oxidation', 'Headlight restoration included'],
        time: '~3 hours',
        prices: { 'Small Car': 100 },
        popular: true,
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
        answer: 'Hand polish uses a cream polish applied by hand to remove minor surface scratches and restore shine. It is included in our Performance Review Polish package (£40/£50). Machine polish uses a rotary or dual-action machine that cuts deeper into the clear coat to remove scratches, swirl marks, and oxidation that hand polishing cannot reach. Machine polish starts at £100.',
      },
      {
        question: 'How much does machine polishing cost compared to other Bristol detailers?',
        answer: 'Our machine polish starts at £100 for a small car. Most Bristol detailing specialists charge £175-350 for the same service. We offer the same quality results at significantly lower prices because we are a high-volume car wash rather than a boutique detailer.',
      },
      {
        question: 'Is headlight restoration included?',
        answer: 'Headlight restoration is included free of charge with every machine polish service. As a standalone service, headlight restoration costs just £20.',
      },
      {
        question: 'Can you restore faded van paintwork?',
        answer: 'Yes, machine polishing is particularly effective at restoring faded van and commercial vehicle paintwork. We can bring the colour back on panels that have dulled from sun exposure and weathering. Prices start from £150 for short wheelbase vans.',
      },
      {
        question: 'Should I get a ceramic coating after machine polishing?',
        answer: 'It is the ideal time. Machine polishing corrects the paint; a ceramic coating then locks that corrected finish in for years. Our ceramic coating packages include the machine polish preparation, so you get both in one visit.',
      },
      {
        question: 'Do I need to book for machine polishing?',
        answer: 'Yes, we recommend calling ahead on 07 977 889747 to book machine polishing. It takes 3-5 hours depending on the vehicle size, so we need to schedule time accordingly.',
      },
    ],
    schemaServiceType: 'Car Detailing and Paint Correction',
    relatedSlugs: ['ceramic-coating-bristol', 'car-wash-bristol', 'headlight-restoration-bristol'],
  },
  {
    slug: 'full-valet-bristol',
    title: 'Full Valet Bristol - Complete Interior & Exterior Car Valet from £60',
    metaTitle: 'Full Valet Bristol - Interior & Exterior from £60 | 5-Star Service',
    metaDescription: 'Complete car valet in Bristol from £60. Full interior & exterior clean with specialist chemicals. UK average is £87-150. Engine clean available. Drop off and collect.',
    heroImage: '/images/Bristol-car-valeting-cheap',
    shortName: 'Full Valet',
    department: 'The Managing Director Treatment',
    description: 'The Managing Director Valet is the top of the company: a complete transformation, inside and out. Every surface is cleaned with specialist chemicals, all plastics and trim are treated, and the entire interior is deep cleaned. The UK average for a full valet is £87-150 - ours starts at just £60. Corner office results without the corner office invoice.',
    usps: [
      'Full valet from £60 - UK average is £87-150',
      'Every surface cleaned with specialist chemicals',
      'All interior and exterior surfaces treated',
      'Engine clean available (at customer’s own risk)',
      'Drop off and collect later, or wait in our indoor area',
      'Last full valet booking at 2pm - allows drying time before close',
    ],
    tiers: [
      {
        name: 'Managing Director Valet - Small Car',
        subtitle: 'Full valet',
        features: ['Full exterior wash & dry', 'Complete interior deep clean', 'All plastics cleaned & treated', 'Dashboard, door cards, and console', 'Seats and carpets shampooed', 'Windows inside & out', 'Tyre dressing', 'Engine clean available'],
        time: '~5 hours',
        prices: { 'Small Car': 60 },
      },
      {
        name: 'Managing Director Valet - Van / SUV',
        subtitle: 'Full valet',
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
        answer: 'Engine cleaning is available as part of the full valet, but it is carried out at the customer’s own risk. Modern engines are generally safe to clean, but we recommend discussing this with us first if your vehicle has any known electrical issues.',
      },
      {
        question: 'How does your price compare to other Bristol valets?',
        answer: 'Our full valet starts at £60 for a small car and £70 for vans and SUVs. The UK average for a full valet is £87-150, so we offer exceptional value without compromising on quality.',
      },
    ],
    schemaServiceType: 'Full Car Valet',
    relatedSlugs: ['car-wash-bristol', 'ceramic-coating-bristol', 'van-wash-bristol'],
  },
  {
    slug: 'headlight-restoration-bristol',
    title: 'Headlight Restoration Bristol - Bring Your Headlights Back to New for £20',
    metaTitle: 'Headlight Restoration Bristol - Just £20 | Clear Headlights in 30 Min',
    metaDescription: 'Headlight restoration in Bristol for just £20. Yellowed, cloudy, or oxidised headlights restored to clear. Improves visibility and MOT chances. Walk-in, no appointment needed.',
    heroImage: '/images/bristol-car-detailing',
    shortName: 'Headlight Restoration',
    department: 'The Bright Ideas Department',
    description: 'Cloudy headlights are like a colleague who has stopped paying attention: dim, hazy, and a liability in the dark. UV exposure and road grime slowly yellow and oxidise the lenses, cutting your night visibility and risking an MOT failure. We restore them to near-new clarity for just £20 - most competitors charge £25-35 per headlight or £100+ per pair.',
    usps: [
      'Just £20 per pair - competitors charge £25-35 per headlight',
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
        answer: 'Yes, headlight restoration is included free of charge with every machine polish service. As a standalone service, it costs £20.',
      },
      {
        question: 'How does your price compare to other headlight restoration services?',
        answer: 'We charge £20 for both headlights (per pair). Many competitors charge £25-35 per headlight, and some specialist services charge £100 or more per pair. We offer the same quality restoration at a fraction of the cost.',
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

// Featured "executive services" highlighted on the homepage
export function getFeaturedServices() {
  return SERVICE_PAGES.filter(s => s.featured);
}
