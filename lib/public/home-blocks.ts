/**
 * What every block of the public home page is, in plain words: the name the client sees in the editor, where the block
 * sits on the page, and the fields it has. The page (app/(public)/page.tsx) and the Home page editor
 * (components/cms/home-editor.tsx) both read this one catalogue, so a field that is editable is always a field that is
 * shown, and the other way round.
 */

export type ItemFieldKind = 'text' | 'textarea' | 'link' | 'icon';

export interface ItemField {
  key: 'title' | 'subtitle' | 'text' | 'value' | 'label' | 'icon' | 'link' | 'linkLabel';
  label: string;
  kind: ItemFieldKind;
  help?: string;
  placeholder?: string;
}

export interface HomeBlockMeta {
  key: string;
  /** The name in the editor. */
  name: string;
  /** Where the block appears on the page. */
  where: string;
  /** One sentence for a person who has never seen the editor. */
  help: string;
  /** Labels of the block's own fields; a missing label means the block has no such field. */
  headingLabel?: string;
  subheadingLabel?: string;
  textLabel?: string;
  textHelp?: string;
  photo?: { label: string; help: string };
  /** The repeating rows of the block. */
  itemName?: string;
  itemFields?: ItemField[];
  maxItems?: number;
  /** A block that cannot be hidden (the page makes no sense without it). */
  alwaysVisible?: boolean;
}

export const ICON_NAMES = [
  'scale', 'gavel', 'hardhat', 'leaf', 'alert', 'droplet', 'zap', 'users', 'user-check', 'star', 'lock', 'building', 'landmark', 'shield',
  'clipboard', 'checksquare', 'heart', 'globe', 'book', 'file', 'shirt', 'fuel', 'factory', 'printer', 'utensils', 'pill', 'cog', 'layers',
  'sun', 'award', 'check', 'briefcase', 'calculator', 'calendar', 'compass', 'phone', 'mail', 'clock', 'pin',
] as const;

const LINK_HELP = 'A page of this website (for example /services) or a full web address (https://…). Leave empty for no link.';

export const HOME_BLOCKS: HomeBlockMeta[] = [
  {
    key: 'hero',
    name: 'Top banner',
    where: 'The first thing a visitor reads, under the menu',
    help: 'The big headline, the line of keywords above it, the short introduction and up to two buttons. The sign-in panel beside it is the next block.',
    headingLabel: 'Headline',
    subheadingLabel: 'Line under the headline (separate the words with | )',
    textLabel: 'Introduction',
    textHelp: 'Two short sentences are enough.',
    itemName: 'button',
    itemFields: [
      { key: 'title', label: 'Button words', kind: 'text', placeholder: 'Schedule a plant audit' },
      { key: 'link', label: 'Where it goes', kind: 'link', help: LINK_HELP + ' #contact scrolls to the enquiry form.', placeholder: '#contact' },
    ],
    maxItems: 2,
    alwaysVisible: true,
  },
  {
    key: 'gateways',
    name: 'Sign-in cards',
    where: 'Panel beside the top banner',
    help: 'One card for each kind of person who signs in (employer, employee, auditor …). Each card has a short line and a button.',
    headingLabel: 'Panel title',
    subheadingLabel: 'Panel sub-title',
    itemName: 'sign-in card',
    itemFields: [
      { key: 'title', label: 'Who it is for', kind: 'text', placeholder: 'Employer' },
      { key: 'text', label: 'One line about it', kind: 'text', placeholder: 'Run payroll, attendance and audits for your factory' },
      { key: 'link', label: 'Where the button goes', kind: 'link', help: LINK_HELP, placeholder: '/login' },
      { key: 'linkLabel', label: 'Button words', kind: 'text', placeholder: 'Sign in' },
    ],
    maxItems: 4,
  },
  {
    key: 'pillars',
    name: 'Focus areas',
    where: 'Small line of keywords in the top banner',
    help: 'The handful of subjects the company stands for, shown as a quiet one-line list.',
    itemName: 'focus area',
    itemFields: [{ key: 'title', label: 'Name', kind: 'text', placeholder: 'Legal Compliance' }],
    maxItems: 8,
  },
  {
    key: 'proof',
    name: 'Numbers strip',
    where: 'Dark strip right under the top banner',
    help: 'Big figures about the company, for example years of experience or number of clients. Only enter figures that are true today.',
    itemName: 'figure',
    itemFields: [
      { key: 'value', label: 'The figure', kind: 'text', placeholder: '500+' },
      { key: 'label', label: 'What it counts', kind: 'text', placeholder: 'Clients served' },
    ],
    maxItems: 6,
  },
  {
    key: 'services',
    name: 'Services',
    where: 'First section below the numbers',
    help: 'What the company does, one numbered row for each service. Each row can open a page.',
    headingLabel: 'Section title',
    subheadingLabel: 'Line under the title',
    itemName: 'service',
    itemFields: [
      { key: 'title', label: 'Service name', kind: 'text', placeholder: 'Safety Audit (IS 14489)' },
      { key: 'text', label: 'Short description', kind: 'textarea' },
      { key: 'link', label: 'Opens this page', kind: 'link', help: LINK_HELP, placeholder: '/services' },
      { key: 'linkLabel', label: 'Link words', kind: 'text', placeholder: 'Read more' },
    ],
    maxItems: 12,
  },
  {
    key: 'spotlight',
    name: 'Principal — photo and message',
    where: 'Between the services and the statutory directory',
    help: 'The photo, name and a few words from the person clients deal with. The portrait of Kannan is already on the site; choose another photo here to replace it.',
    headingLabel: 'Name',
    subheadingLabel: 'Designation (for example Founder & Principal Consultant)',
    textLabel: 'Message',
    textHelp: 'In their own words, in the first person. Leave empty to show a short standard line instead.',
    photo: { label: 'Photo', help: 'A portrait works best (taller than wide). JPG, PNG or WebP, up to 5 MB.' },
    itemName: 'qualification or highlight',
    itemFields: [{ key: 'title', label: 'Highlight', kind: 'text', placeholder: 'Chartered Safety Auditor' }],
    maxItems: 4,
  },
  {
    key: 'statutory',
    name: 'Statutory directory — heading',
    where: 'Heading of the tabbed directory (Acts, central links, Tamil Nadu links, reports)',
    help: 'Only the heading and the line under it; the four tabs have their own blocks below.',
    headingLabel: 'Section title',
    subheadingLabel: 'Line under the title',
  },
  {
    key: 'acts',
    name: 'Directory tab: Acts & Rules',
    where: 'First tab of the statutory directory',
    help: 'The Acts and Rules you want visitors to find first. The “View all Acts” button always opens the full Acts library.',
    headingLabel: 'Tab name',
    itemName: 'Act or Rule',
    itemFields: [
      { key: 'title', label: 'Name of the Act', kind: 'text', placeholder: 'Factories Act 1948' },
      { key: 'subtitle', label: 'Tag (optional)', kind: 'text', placeholder: 'Central' },
      { key: 'link', label: 'Opens this page', kind: 'link', help: LINK_HELP, placeholder: '/acts-compliance' },
    ],
    maxItems: 16,
  },
  {
    key: 'links_central',
    name: 'Directory tab: Central Government',
    where: 'Second tab of the statutory directory',
    help: 'Links to the ministries and boards of the Government of India that your clients deal with.',
    headingLabel: 'Tab name',
    itemName: 'link',
    itemFields: [
      { key: 'title', label: 'Name', kind: 'text', placeholder: 'Central Pollution Control Board (CPCB)' },
      { key: 'link', label: 'Web address', kind: 'link', help: LINK_HELP, placeholder: 'https://cpcb.nic.in' },
    ],
    maxItems: 16,
  },
  {
    key: 'links_state',
    name: 'Directory tab: State Government',
    where: 'Third tab of the statutory directory',
    help: 'Links to the state departments and boards that your clients deal with.',
    headingLabel: 'Tab name',
    itemName: 'link',
    itemFields: [
      { key: 'title', label: 'Name', kind: 'text', placeholder: 'TN Pollution Control Board (TNPCB)' },
      { key: 'link', label: 'Web address', kind: 'link', help: LINK_HELP, placeholder: 'https://tnpcb.gov.in' },
    ],
    maxItems: 16,
  },
  {
    key: 'reports_grid',
    name: 'Directory tab: Reports',
    where: 'Fourth tab of the statutory directory',
    help: 'The kinds of reports the company prepares. The “View all reports” button always opens the Reports page.',
    headingLabel: 'Tab name',
    itemName: 'report',
    itemFields: [
      { key: 'title', label: 'Report', kind: 'text', placeholder: 'HAZOP Study' },
      { key: 'subtitle', label: 'Second line (optional)', kind: 'text', placeholder: 'Study' },
      { key: 'link', label: 'Opens this page', kind: 'link', help: LINK_HELP, placeholder: '/reports' },
    ],
    maxItems: 16,
  },
  {
    key: 'expertise',
    name: 'Expertise',
    where: 'Dark band after the directory',
    help: 'What the specialists cover, as a checklist of headings with one sentence each.',
    headingLabel: 'Section title',
    subheadingLabel: 'Small label above the title',
    itemName: 'area of expertise',
    itemFields: [
      { key: 'title', label: 'Heading', kind: 'text', placeholder: 'Fire Safety Systems Audit' },
      { key: 'text', label: 'One sentence', kind: 'textarea' },
    ],
    maxItems: 12,
  },
  {
    key: 'industries',
    name: 'Industries served',
    where: 'Inside the dark expertise band',
    help: 'The industries the company works with, each with an icon and a few words.',
    headingLabel: 'Section title',
    subheadingLabel: 'Line under the title',
    itemName: 'industry',
    itemFields: [
      { key: 'title', label: 'Industry', kind: 'text', placeholder: 'Textile & Apparel' },
      { key: 'text', label: 'A few words', kind: 'text', placeholder: 'Garmenting, spinning & knitting compliance' },
      { key: 'icon', label: 'Icon', kind: 'icon' },
    ],
    maxItems: 12,
  },
  {
    key: 'certifications',
    name: 'Standards and certifications',
    where: 'Quiet strip after the dark band',
    help: 'The brand and sustainability standards the company supports.',
    headingLabel: 'Section title',
    subheadingLabel: 'Small label above the title',
    itemName: 'standard',
    itemFields: [
      { key: 'title', label: 'Name', kind: 'text', placeholder: 'GOTS' },
      { key: 'subtitle', label: 'Second line', kind: 'text', placeholder: 'Global Organic' },
    ],
    maxItems: 16,
  },
  {
    key: 'enquiry',
    name: 'Enquiry section',
    where: 'Bottom of the page, beside the enquiry form',
    help: 'The heading above the contact details and the enquiry form. The address, phone and e-mail come from Settings → Company settings.',
    headingLabel: 'Section title',
    subheadingLabel: 'Line under the title',
    textLabel: 'Highlighted note (optional)',
    textHelp: 'A short assurance in the yellow box. Only write what the company can stand behind.',
    alwaysVisible: true,
  },
];

export const HOME_BLOCK_BY_KEY = Object.fromEntries(HOME_BLOCKS.map((block) => [block.key, block])) as Record<string, HomeBlockMeta>;

/** Links the editor accepts: pages of this site, web addresses, e-mail and phone links — never script. */
export function isSafeLink(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return /^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+0-9() -]+|#[\w-]+)$/i.test(v);
}
