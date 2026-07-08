export interface SolutionBenefit {
  title: string;
  description: string;
}

export interface SolutionCategory {
  slug: string;
  name: string;
  cardLine: string;
  heroTitle: string;
  heroSubtitle: string;
  metaDescription: string;
  benefits: SolutionBenefit[];
  ctaHeading: string;
}

export const solutionCategories: SolutionCategory[] = [
  {
    slug: 'conferences',
    name: 'Conferences',
    cardLine: 'Multi-tier tickets, agendas, and fast check-in',
    heroTitle: 'Conference registration without the spreadsheet chaos',
    heroSubtitle:
      'Create your conference page, sell tiered tickets, publish your agenda and speakers, and check delegates in with QR codes.',
    metaDescription:
      'Run conference ticketing and registration with Axon Tickets — tiered tickets, agenda pages, verified attendee records, and QR check-in.',
    benefits: [
      { title: 'Tiered tickets', description: 'Early bird, regular, and VIP tiers with their own prices and capacity limits.' },
      { title: 'Agenda and speakers on your page', description: 'Publish your program, speakers, and sponsors on a branded public event page.' },
      { title: 'Verified attendee records', description: 'Every registration is verified by email OTP, so your delegate list is real.' },
      { title: 'QR check-in that keeps lines moving', description: 'Scan QR tickets at the door and see who has arrived in real time.' },
    ],
    ctaHeading: 'Run your next conference on Axon Tickets',
  },
  {
    slug: 'fun-runs',
    name: 'Fun Runs',
    cardLine: 'Online registration and QR validation at the start line',
    heroTitle: 'Race-day registration that keeps the start line moving',
    heroSubtitle:
      'Take runner registrations online, collect payment proof, and validate participants with QR codes at kit claiming or the starting line.',
    metaDescription:
      'Organize fun run registration with Axon Tickets — online sign-ups, payment proof collection, participant records, and QR validation on race day.',
    benefits: [
      { title: 'Online registration', description: 'Runners sign up from their phones — no more printed forms or walk-in queues.' },
      { title: 'QR validation on race day', description: 'Scan each runner’s QR code at kit claiming or the start line.' },
      { title: 'Payment proof collection', description: 'Collect GCash or bank transfer proof with each registration and verify it from your dashboard.' },
      { title: 'Complete participant records', description: 'Every runner’s details in one list, ready for kits, waivers, and reports.' },
    ],
    ctaHeading: 'Run your next fun run on Axon Tickets',
  },
  {
    slug: 'church-events',
    name: 'Church Events',
    cardLine: 'Gatherings, retreats, and conferences with less admin',
    heroTitle: 'Less admin for gatherings, retreats, and worship events',
    heroSubtitle:
      'Take registrations for free or paid church events, send confirmations automatically, and check attendees in with QR codes.',
    metaDescription:
      'Manage church event registration with Axon Tickets — free or paid sign-ups, automatic confirmations, attendee lists, and QR check-in.',
    benefits: [
      { title: 'Free or paid registration', description: 'Run free sign-ups or ticketed events — both work the same way.' },
      { title: 'Automatic confirmations', description: 'Every attendee gets a confirmation email with their QR code, without manual follow-ups.' },
      { title: 'Attendee lists in one place', description: 'See who registered across services, retreats, and conferences.' },
      { title: 'QR check-in at the venue', description: 'Volunteers scan attendees in from a phone — no printed lists.' },
    ],
    ctaHeading: 'Run your next church event on Axon Tickets',
  },
  {
    slug: 'school-events',
    name: 'School Events',
    cardLine: 'Proms, fairs, and org events in one place',
    heroTitle: 'Proms, fairs, and org events — organized in one place',
    heroSubtitle:
      'Set capacity limits, take registrations online, and validate entry with QR codes so student events stay organized and accounted for.',
    metaDescription:
      'Organize school event ticketing with Axon Tickets — capacity limits, online registration, QR entry validation, and attendee reports.',
    benefits: [
      { title: 'Capacity limits per ticket type', description: 'Cap attendance overall or per tier so events never oversell.' },
      { title: 'Online registration', description: 'Students register from their phones instead of lining up at a booth.' },
      { title: 'QR entry validation', description: 'Scan tickets at the gate to keep entry fast and accountable.' },
      { title: 'Attendee reports', description: 'A clean record of who registered and who attended, for org and admin reporting.' },
    ],
    ctaHeading: 'Run your next school event on Axon Tickets',
  },
  {
    slug: 'corporate-events',
    name: 'Corporate Events',
    cardLine: 'Seminars and company events without the RSVP mess',
    heroTitle: 'Seminars and company events without the RSVP mess',
    heroSubtitle:
      'Give your seminar or team event a branded page, take registrations with automatic confirmations, and keep complete attendee records.',
    metaDescription:
      'Manage corporate event registration with Axon Tickets — branded event pages, automatic confirmations, attendee records with exports, and QR check-in.',
    benefits: [
      { title: 'Branded event page', description: 'A professional public page for your seminar, town hall, or client event.' },
      { title: 'Registration with confirmations', description: 'Attendees register once and receive their confirmation and QR code by email.' },
      { title: 'Attendee records and exports', description: 'Complete registration data you can export for attendance and compliance.' },
      { title: 'QR check-in', description: 'Badge-free check-in — scan attendees in at the door from any phone.' },
    ],
    ctaHeading: 'Run your next corporate event on Axon Tickets',
  },
  {
    slug: 'concerts',
    name: 'Concerts',
    cardLine: 'Sell tickets online, validate them at the gate',
    heroTitle: 'Sell tickets online. Validate them at the gate.',
    heroSubtitle:
      'Sell tiered concert tickets, deliver QR tickets by email, and scan them at the gate while tracking sales from your dashboard.',
    metaDescription:
      'Sell concert tickets with Axon Tickets — tiered pricing, QR tickets by email, gate scanning, and sales tracking for organizers.',
    benefits: [
      { title: 'Tiered pricing', description: 'GA, VIP, and early bird tiers with separate prices and capacities.' },
      { title: 'QR tickets by email', description: 'Every buyer gets their QR ticket in their inbox — nothing to print.' },
      { title: 'Gate scanning', description: 'Scan tickets at the gate and catch reused or invalid codes instantly.' },
      { title: 'Sales tracking', description: 'Watch ticket sales and check-ins from your organizer dashboard.' },
    ],
    ctaHeading: 'Run your next concert on Axon Tickets',
  },
];

export function getSolutionCategory(slug: string): SolutionCategory | undefined {
  return solutionCategories.find((c) => c.slug === slug);
}
