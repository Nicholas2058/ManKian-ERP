import type { Channel } from '@/domain/types';

/** Synthetic inbound enquiries for "Simulate inbound enquiry". No real channel is connected. */
export const ENQUIRY_TEMPLATES: { channel: Channel; customerId?: string; contactName: string; contactPhone: string; subject: string; text: string; siteName?: string; reply: string }[] = [
  {
    channel: 'whatsapp',
    customerId: 'c01',
    contactName: 'Ahmad Faizal (Teratai Build Works)',
    contactPhone: '+60 12-000 1214',
    subject: 'Safety top-up for new site',
    text: 'Salam boss, need 60 pcs safety helmet yellow, 10 box nitrile gloves and 40 pcs reflective safety vest. Site at Bandar Kinrara, deliver Thursday.',
    siteName: 'Bandar Kinrara',
    reply: 'Also add 20 pcs PVC safety cone 28" please',
  },
  {
    channel: 'email',
    customerId: 'c11',
    contactName: 'Lee Kok Wai (Merbau Steel Fabricators)',
    contactPhone: '+60 12-000 1277',
    subject: 'RFQ: angle bar and hollow sections',
    text: 'Dear sales, please quote 80 lengths angle bar 50x50x5mm, 40 lengths square hollow section 50x50x2mm and 6 box hex bolt M16. Delivery to Klang workshop.',
    siteName: 'Klang workshop',
    reply: 'Can you also include 10 pcs chemical anchor capsule M16?',
  },
  {
    channel: 'website',
    customerId: 'c18',
    contactName: 'Jessica Lau (Mutiara Kitchen & Bath)',
    contactPhone: '+60 12-000 1326',
    subject: 'Website enquiry — showroom renovation',
    text: 'Request for quotation: 2 ctn silicone sealant white, 20 bags tile adhesive 25kg and 6 pcs brass bib tap 1/2". Self pickup.',
    reply: 'Make it 3 ctn of the sealant instead.',
  },
  {
    channel: 'phone',
    customerId: 'c23',
    contactName: 'Hanis Rahman (Embun Aqua Systems)',
    contactPhone: '+60 12-000 1361',
    subject: 'Phone call — pump room piping',
    text: 'Called for 30 lengths 3" PVC pipe class D, 20 pcs 1" brass ball valve and 10 box PTFE tape. Needs by Monday.',
    reply: 'Customer confirmed delivery to Cyberjaya site.',
  },
  {
    channel: 'whatsapp',
    customerId: 'c16',
    contactName: 'Zulkifli Hassan (Lestari Roofing)',
    contactPhone: '+60 12-000 1312',
    subject: 'Roofing job — Setia Alam',
    text: 'Boss, 250 m metal deck roofing 0.4mm, 6 roll roofing felt, 3 box roofing screw and 2 pcs full body harness. Thanks!',
    siteName: 'Setia Alam',
    reply: 'Can deliver Saturday morning?',
  },
  {
    channel: 'email',
    customerId: 'c10',
    contactName: 'Hafizah Omar (Orkid Precast Products)',
    contactPhone: '+60 12-000 1273',
    subject: 'Monthly consumables',
    text: 'Please quote 2 drum mould release oil, 40 pcs rubber bearing pad 300x300x25mm and 30 bags non-shrink grout 25kg.',
    reply: 'PO will follow after approval.',
  },
];

export const STAFF_REPLIES = [
  'Thanks! Checking stock and pricing now — will revert shortly.',
  'Noted. May I confirm the delivery site and required date?',
  'Quotation is being prepared. Prices are valid until the date stated on the quote.',
];
