/**
 * ILLUSTRATIVE warehouse layout — not a survey of any real facility.
 * Units are metres. X runs left→right (60 m), Z runs front→back (36 m).
 */
import type { Bin, Rack, Warehouse, Zone } from '@/domain/types';

export function buildWarehouse() {
  const warehouse: Warehouse = {
    id: 'wh1',
    code: 'WH-DEMO',
    name: 'Main warehouse (illustrative)',
    note: 'Illustrative warehouse layout — not an actual survey of any MK Hardware facility.',
    width: 60,
    depth: 36,
  };
  const zones: Zone[] = [
    { id: 'z_rcv', code: 'RCV', name: 'Receiving dock', kind: 'receiving', x: 0, z: 0, w: 10, d: 12 },
    { id: 'z_dsp', code: 'DSP', name: 'Dispatch staging & loading bay', kind: 'dispatch', x: 50, z: 0, w: 10, d: 12 },
    { id: 'z_qrn', code: 'QRN', name: 'Quarantine', kind: 'quarantine', x: 0, z: 26, w: 8, d: 10 },
    { id: 'z_a', code: 'A', name: 'Zone A · Long goods (cantilever)', kind: 'storage', x: 10, z: 20, w: 22, d: 16 },
    { id: 'z_b', code: 'B', name: 'Zone B · Pallet racking & bulk floor', kind: 'storage', x: 34, z: 20, w: 26, d: 16 },
    { id: 'z_c', code: 'C', name: 'Zone C · Small parts shelving', kind: 'storage', x: 12, z: 2, w: 36, d: 14 },
  ];
  const racks: Rack[] = [];
  // Zone A: 4 cantilever racks along X
  [22.5, 26.5, 30.5, 34].forEach((z, i) =>
    racks.push({ id: `r_a${i + 1}`, zoneId: 'z_a', code: `A0${i + 1}`, type: 'cantilever', x: 12, z, w: 18, d: 1.4, h: 3.2, levels: 3, bays: 5, rotation: 0 }),
  );
  // Zone B: 4 selective pallet racks along X + 2 bulk floor areas
  [22.5, 26.5, 30.5, 34].forEach((z, i) =>
    racks.push({ id: `r_b${i + 1}`, zoneId: 'z_b', code: `B0${i + 1}`, type: 'selective', x: 36, z, w: 15, d: 1.2, h: 4.6, levels: 3, bays: 5, rotation: 0 }),
  );
  racks.push({ id: 'r_bf1', zoneId: 'z_b', code: 'BF1', type: 'floor', x: 53, z: 21.5, w: 6, d: 5.5, h: 1.2, levels: 1, bays: 4, rotation: 0 });
  racks.push({ id: 'r_bf2', zoneId: 'z_b', code: 'BF2', type: 'floor', x: 53, z: 29, w: 6, d: 5.5, h: 1.2, levels: 1, bays: 4, rotation: 0 });
  // Zone C: 6 shelving rows (2 columns x 3 rows)
  let n = 1;
  for (const z of [4, 8.5, 13]) {
    for (const x of [14, 32]) {
      racks.push({ id: `r_c${n}`, zoneId: 'z_c', code: `C0${n}`, type: 'shelving', x, z, w: 14, d: 0.9, h: 2.4, levels: 4, bays: 5, rotation: 0 });
      n++;
    }
  }
  const bins: Bin[] = [];
  for (const r of racks) {
    for (let b = 1; b <= r.bays; b++) {
      for (let l = 1; l <= r.levels; l++) {
        bins.push({
          id: `bin_${r.code}_${b}_${l}`,
          code: r.type === 'floor' ? `${r.code}-${String(b).padStart(2, '0')}` : `${r.code}-${String(b).padStart(2, '0')}-${l}`,
          zoneId: r.zoneId,
          rackId: r.id,
          level: l,
          bay: b,
          capacity: 100,
          kind: r.type === 'floor' ? 'floor' : 'rack',
        });
      }
    }
  }
  bins.push({ id: 'bin_dock', code: 'RCV-DOCK', zoneId: 'z_rcv', level: 1, bay: 1, capacity: 400, kind: 'dock' });
  bins.push({ id: 'bin_stage', code: 'DSP-STAGE', zoneId: 'z_dsp', level: 1, bay: 1, capacity: 400, kind: 'staging' });
  bins.push({ id: 'bin_qrn', code: 'QRN-01', zoneId: 'z_qrn', level: 1, bay: 1, capacity: 200, kind: 'quarantine' });
  return { warehouse, zones, racks, bins };
}

/** Which storage area a product type lives in. */
export function storageArea(sku: string, cat: string, baseUom: string): 'A' | 'B' | 'BF' | 'C' {
  const floor = ['CPV-60', 'CPV-80', 'HVB-DIA', 'HVB-SQR', 'CEM-50', 'CRB-1000', 'PRB-1500', 'IBC-1000'];
  if (floor.includes(sku)) return 'BF';
  if (baseUom === 'LEN') return 'A';
  if (['bld', 'chm'].includes(cat)) return 'B';
  if (['WT-1000', 'AWP-20', 'HSE-SR5', 'HSE-PLT', 'HSE-LD6', 'HSE-GB120', 'HND-WB65', 'WRP-10', 'ELC-WF24'].includes(sku)) return 'B';
  return 'C';
}
