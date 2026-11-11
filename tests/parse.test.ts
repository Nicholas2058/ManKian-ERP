import { describe, expect, it } from 'vitest';
import { buildSeed, pid } from '@/data/seed';
import { extractLines, splitSegments } from '@/domain/parse';

const db = buildSeed({ anchor: '2026-11-11T06:30:00.000Z' });
const products = Object.values(db.products);
let n = 0;
const ex = (t: string) => extractLines(t, products, () => `x${n++}`);

describe('rule-based enquiry extraction', () => {
  it('extracts the WhatsApp scenario lines with quantity and UOM', () => {
    const lines = ex('Hi MK team, boleh quote? Need 40 pcs 2" PVC elbow 90 and 20 lengths 2" PVC pipe class D. Deliver to our site by Friday.');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ productId: pid('PVE-050'), qty: 40, uom: 'PCS' });
    expect(lines[1]).toMatchObject({ productId: pid('PVP-D-050'), qty: 20, uom: 'LEN' });
  });

  it('handles rolls, boxes and metres', () => {
    const lines = ex('Boss, need 300 m metal deck roofing 0.4mm, 10 roll roofing felt and 4 box roofing screw.');
    console.log(splitSegments('Boss, need 300 m metal deck roofing 0.4mm, 10 roll roofing felt and 4 box roofing screw.'), lines);
    expect(lines.map((l) => l.productId)).toEqual([pid('MDR-040'), pid('RFF-20'), pid('RSW-50')]);
    expect(lines.map((l) => l.uom)).toEqual(['M', 'ROLL', 'BOX']);
  });

  it('matches electrical items', () => {
    const lines = ex('Please quote 5 roll 2.5mm cable, 20 pcs MCB 20A and 10 pcs LED floodlight 100W.');
    console.log(lines);
    expect(lines.map((l) => l.productId)).toEqual([pid('ELC-CBL25'), pid('ELC-MCB20'), pid('ELC-FL100')]);
    expect(lines[0].uom).toBe('ROLL');
  });

  it('flags unknown items instead of guessing', () => {
    const lines = ex('Need 3 pcs unicorn saddle');
    expect(lines.length).toBe(1);
    expect(['low', 'medium']).toContain(lines[0].confidence);
  });
});
