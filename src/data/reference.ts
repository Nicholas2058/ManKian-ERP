/**
 * Reference data for the demo. Product TYPES reflect categories publicly listed by
 * MK Hardware; every price, cost, spec value, supplier, customer and person below is
 * FICTIONAL and for demonstration only. Brand names are public product brands; no
 * official specifications or prices are implied.
 */
import type { ArtKey, CustomerTier, CustomerType, UomCode } from '@/domain/types';

export const CATEGORIES = [
  { id: 'plb', code: 'PLB', name: 'Plumbing', icon: 'Droplets', sort: 1 },
  { id: 'bld', code: 'BLD', name: 'Building Materials', icon: 'BrickWall', sort: 2 },
  { id: 'ind', code: 'IND', name: 'Industrial & Steel', icon: 'Factory', sort: 3 },
  { id: 'pwr', code: 'PWR', name: 'Power Tools', icon: 'Drill', sort: 4 },
  { id: 'hnd', code: 'HND', name: 'Hand Tools', icon: 'Hammer', sort: 5 },
  { id: 'saf', code: 'SAF', name: 'Safety Products', icon: 'HardHat', sort: 6 },
  { id: 'elc', code: 'ELC', name: 'Electrical Appliances', icon: 'PlugZap', sort: 7 },
  { id: 'chm', code: 'CHM', name: 'Chemicals & Sealants', icon: 'FlaskConical', sort: 8 },
  { id: 'hse', code: 'HSE', name: 'Household & Storage', icon: 'Archive', sort: 9 },
] as const;

export const BRANDS = [
  { id: 'b_bina', name: 'BINA PLASTIC', origin: 'MY' },
  { id: 'b_hilti', name: 'HILTI', origin: 'LI' },
  { id: 'b_sika', name: 'Sika', origin: 'CH' },
  { id: 'b_bosch', name: 'BOSCH', origin: 'DE' },
  { id: 'b_makita', name: 'MAKITA', origin: 'JP' },
  { id: 'b_dewalt', name: 'DeWALT', origin: 'US' },
  { id: 'b_hikoki', name: 'HIKOKI', origin: 'JP' },
  { id: 'b_bahco', name: 'BAHCO', origin: 'SE' },
  { id: 'b_3m', name: '3M', origin: 'US' },
  { id: 'b_fosroc', name: 'FOSROC', origin: 'GB' },
  { id: 'b_mapei', name: 'MAPEI', origin: 'IT' },
  { id: 'b_wurth', name: 'WURTH', origin: 'DE' },
  { id: 'b_pye', name: 'PYE', origin: 'MY' },
  { id: 'b_gen', name: 'Generic (unbranded)', origin: '—' },
] as const;

const B: Record<string, string> = {
  bina: 'b_bina', hilti: 'b_hilti', sika: 'b_sika', bosch: 'b_bosch', makita: 'b_makita', dewalt: 'b_dewalt', hikoki: 'b_hikoki',
  bahco: 'b_bahco', '3m': 'b_3m', fosroc: 'b_fosroc', mapei: 'b_mapei', wurth: 'b_wurth', pye: 'b_pye', gen: 'b_gen',
};

export interface SupplierDef {
  id: string; code: string; name: string; contact: string; currency: 'MYR' | 'USD' | 'CNY'; terms: number; lead: number; onTime: number; quality: number; cats: string[]; town: string; isImport?: boolean;
}

export const SUPPLIERS: SupplierDef[] = [
  { id: 's1', code: 'SUP-ARD', name: 'Ardent Steel Trading', contact: 'Wong Kar Leong', currency: 'MYR', terms: 30, lead: 4, onTime: 91, quality: 4.4, cats: ['ind', 'bld'], town: 'Klang' },
  { id: 's2', code: 'SUP-BLR', name: 'BlueRiver Pipe Supplies', contact: 'Siti Mariam', currency: 'MYR', terms: 45, lead: 3, onTime: 95, quality: 4.6, cats: ['plb'], town: 'Shah Alam' },
  { id: 's3', code: 'SUP-KEN', name: 'Kenanga Industrial Supply', contact: 'Ganesh Pillai', currency: 'MYR', terms: 30, lead: 5, onTime: 84, quality: 4.0, cats: ['ind', 'saf', 'chm'], town: 'Seri Kembangan' },
  { id: 's4', code: 'SUP-ORC', name: 'Orchid Safety Distributors', contact: 'Chloe Tan', currency: 'MYR', terms: 30, lead: 3, onTime: 93, quality: 4.5, cats: ['saf'], town: 'Petaling Jaya' },
  { id: 's5', code: 'SUP-HAL', name: 'Halcyon Tools Distribution', contact: 'Arif Rosli', currency: 'MYR', terms: 60, lead: 4, onTime: 88, quality: 4.3, cats: ['pwr', 'hnd'], town: 'Subang Jaya' },
  { id: 's6', code: 'SUP-MER', name: 'Meranti Chemicals Supply', contact: 'Lim Pei Shan', currency: 'MYR', terms: 30, lead: 5, onTime: 86, quality: 4.2, cats: ['chm'], town: 'Bangi' },
  { id: 's7', code: 'SUP-NPE', name: 'NorthPoint Electrical Wholesale', contact: 'Rajesh Kumar', currency: 'MYR', terms: 45, lead: 3, onTime: 92, quality: 4.4, cats: ['elc'], town: 'Kuala Lumpur' },
  { id: 's8', code: 'SUP-PNW', name: 'Pinewood Building Materials', contact: 'Hazwan Ali', currency: 'MYR', terms: 30, lead: 2, onTime: 89, quality: 4.1, cats: ['bld'], town: 'Kajang' },
  { id: 's9', code: 'SUP-RMB', name: 'Rimba Fasteners & Fixings', contact: 'Ong Siew Mei', currency: 'MYR', terms: 30, lead: 3, onTime: 94, quality: 4.6, cats: ['ind'], town: 'Puchong' },
  { id: 's10', code: 'SUP-SPP', name: 'Seri Polymer Products', contact: 'Daniel Yap', currency: 'MYR', terms: 30, lead: 4, onTime: 87, quality: 4.2, cats: ['plb', 'hse'], town: 'Rawang' },
  { id: 's11', code: 'SUP-TDW', name: 'Tidewater Trading Imports', contact: 'Melissa Goh', currency: 'USD', terms: 60, lead: 21, onTime: 78, quality: 4.0, cats: ['pwr', 'elc'], town: 'Port Klang', isImport: true },
  { id: 's12', code: 'SUP-LTS', name: 'Lotus Hardware Imports', contact: 'Chen Hao', currency: 'CNY', terms: 60, lead: 28, onTime: 74, quality: 3.8, cats: ['hnd', 'hse'], town: 'Port Klang', isImport: true },
  { id: 's13', code: 'SUP-CBT', name: 'Cobalt Power Tool Distribution', contact: 'Iskandar Zul', currency: 'MYR', terms: 45, lead: 3, onTime: 90, quality: 4.4, cats: ['pwr'], town: 'Cyberjaya' },
  { id: 's14', code: 'SUP-JAD', name: 'Jade Storage Solutions', contact: 'Tan Mei Ling', currency: 'MYR', terms: 30, lead: 6, onTime: 85, quality: 4.1, cats: ['hse'], town: 'Semenyih' },
  { id: 's15', code: 'SUP-SUM', name: 'Summit Roofing Supply', contact: 'Kelvin Lau', currency: 'MYR', terms: 30, lead: 4, onTime: 90, quality: 4.3, cats: ['bld'], town: 'Shah Alam' },
  { id: 's16', code: 'SUP-DGS', name: 'Delta Geo-Synthetics', contact: 'Farah Aziz', currency: 'MYR', terms: 45, lead: 6, onTime: 88, quality: 4.4, cats: ['bld'], town: 'Klang' },
];

export interface ProductDef {
  sku: string; cat: string; fam?: string; name: string; v?: string; brand: string; uom: UomCode; uoms?: string; cost: number; art: ArtKey;
  vol: 'l' | 'm' | 'h'; lead: number; roq: number; kg: number; sup: string; alt?: string[]; specs?: string;
}

// sku | cat | family | name | variant | brand | base uom | uoms | cost RM | art | vol | lead | roq | kg | supplier | alt suppliers | specs
type Row = [string, string, string, string, string, string, UomCode, string, number, ArtKey, 'l' | 'm' | 'h', number, number, number, string, string, string];

const ROWS: Row[] = [
  // ── Plumbing
  ['PVP-D-015', 'plb', 'PVP', 'PVC pressure pipe Class D, 6 m', '1/2" (15 mm)', 'bina', 'LEN', '', 6.8, 'pipe', 'm', 3, 300, 1.2, 's2', 's10', 'Diameter=1/2" (15 mm)|Class=D|Length=6 m|Material=uPVC'],
  ['PVP-D-020', 'plb', 'PVP', 'PVC pressure pipe Class D, 6 m', '3/4" (20 mm)', 'bina', 'LEN', '', 8.9, 'pipe', 'm', 3, 300, 1.6, 's2', 's10', 'Diameter=3/4" (20 mm)|Class=D|Length=6 m|Material=uPVC'],
  ['PVP-D-025', 'plb', 'PVP', 'PVC pressure pipe Class D, 6 m', '1" (25 mm)', 'bina', 'LEN', '', 12.4, 'pipe', 'm', 3, 240, 2.2, 's2', 's10', 'Diameter=1" (25 mm)|Class=D|Length=6 m|Material=uPVC'],
  ['PVP-D-040', 'plb', 'PVP', 'PVC pressure pipe Class D, 6 m', '1-1/2" (40 mm)', 'bina', 'LEN', '', 21.5, 'pipe', 'm', 3, 160, 3.8, 's2', 's10', 'Diameter=1-1/2" (40 mm)|Class=D|Length=6 m|Material=uPVC'],
  ['PVP-D-050', 'plb', 'PVP', 'PVC pressure pipe Class D, 6 m', '2" (50 mm)', 'bina', 'LEN', '', 28.6, 'pipe', 'm', 3, 200, 5.1, 's2', 's10', 'Diameter=2" (50 mm)|Class=D|Length=6 m|Material=uPVC'],
  ['PVP-D-080', 'plb', 'PVP', 'PVC pressure pipe Class D, 6 m', '3" (80 mm)', 'bina', 'LEN', '', 52, 'pipe', 'm', 3, 100, 9.5, 's2', 's10', 'Diameter=3" (80 mm)|Class=D|Length=6 m|Material=uPVC'],
  ['PVP-D-100', 'plb', 'PVP', 'PVC pressure pipe Class D, 6 m', '4" (100 mm)', 'bina', 'LEN', '', 78, 'pipe', 'm', 3, 80, 14, 's2', 's10', 'Diameter=4" (100 mm)|Class=D|Length=6 m|Material=uPVC'],
  ['PVE-015', 'plb', 'PVE', 'PVC elbow 90°', '1/2"', 'bina', 'PCS', 'BOX:100', 0.55, 'elbow', 'l', 4, 1000, 0.02, 's10', 's2', 'Diameter=1/2"|Angle=90°|Joint=Solvent'],
  ['PVE-020', 'plb', 'PVE', 'PVC elbow 90°', '3/4"', 'bina', 'PCS', 'BOX:100', 0.75, 'elbow', 'l', 4, 1000, 0.03, 's10', 's2', 'Diameter=3/4"|Angle=90°|Joint=Solvent'],
  ['PVE-025', 'plb', 'PVE', 'PVC elbow 90°', '1"', 'bina', 'PCS', 'BOX:50', 1.1, 'elbow', 'l', 4, 600, 0.05, 's10', 's2', 'Diameter=1"|Angle=90°|Joint=Solvent'],
  ['PVE-050', 'plb', 'PVE', 'PVC elbow 90°', '2"', 'bina', 'PCS', 'BOX:25', 3.2, 'elbow', 'l', 4, 200, 0.15, 's10', 's2', 'Diameter=2"|Angle=90°|Joint=Solvent'],
  ['PVE-100', 'plb', 'PVE', 'PVC elbow 90°', '4"', 'bina', 'PCS', 'BOX:10', 9.8, 'elbow', 'l', 4, 100, 0.5, 's10', 's2', 'Diameter=4"|Angle=90°|Joint=Solvent'],
  ['PVT-015', 'plb', 'PVT', 'PVC equal tee', '1/2"', 'bina', 'PCS', 'BOX:100', 0.7, 'tee', 'l', 4, 800, 0.03, 's10', 's2', 'Diameter=1/2"|Joint=Solvent'],
  ['PVT-050', 'plb', 'PVT', 'PVC equal tee', '2"', 'bina', 'PCS', 'BOX:25', 4.1, 'tee', 'l', 4, 150, 0.2, 's10', 's2', 'Diameter=2"|Joint=Solvent'],
  ['PVS-020', 'plb', 'PVS', 'PVC socket', '3/4"', 'bina', 'PCS', 'BOX:100', 0.45, 'tee', 'l', 4, 1000, 0.02, 's10', 's2', 'Diameter=3/4"'],
  ['PVS-050', 'plb', 'PVS', 'PVC socket', '2"', 'bina', 'PCS', 'BOX:25', 2.4, 'tee', 'l', 4, 200, 0.1, 's10', 's2', 'Diameter=2"'],
  ['UPD-110', 'plb', '', 'uPVC drainage pipe 110 mm, 5.8 m', '', 'bina', 'LEN', '', 46, 'pipe', 'm', 3, 80, 9, 's2', 's10', 'Diameter=110 mm|Length=5.8 m|Use=Drainage'],
  ['BV-015', 'plb', 'BV', 'Brass ball valve, full bore', '1/2"', 'gen', 'PCS', 'BOX:10', 12.5, 'valve', 'l', 5, 120, 0.25, 's2', 's10', 'Size=1/2"|Body=Brass|Rating=PN16 (illustrative)'],
  ['BV-025', 'plb', 'BV', 'Brass ball valve, full bore', '1"', 'gen', 'PCS', 'BOX:10', 24, 'valve', 'l', 5, 80, 0.5, 's2', 's10', 'Size=1"|Body=Brass|Rating=PN16 (illustrative)'],
  ['BT-015', 'plb', '', 'Brass bib tap 1/2"', '', 'gen', 'PCS', 'BOX:10', 9.2, 'valve', 'l', 5, 100, 0.2, 's2', 's10', 'Size=1/2"|Body=Brass'],
  ['PTF-12', 'plb', '', 'PTFE thread seal tape 12 mm x 10 m', '', 'gen', 'PCS', 'BOX:10,CTN:200', 0.65, 'tape', 'l', 4, 1000, 0.01, 's10', 's2', 'Width=12 mm|Length=10 m'],
  ['PSC-500', 'plb', '', 'PVC solvent cement 500 g', '', 'bina', 'PCS', 'CTN:24', 9.4, 'sealant', 'l', 4, 120, 0.55, 's10', 's2', 'Net weight=500 g'],
  ['WT-1000', 'plb', '', 'Polyethylene water tank 1,000 L', '', 'gen', 'PCS', '', 420, 'tank', 'l', 7, 6, 40, 's10', 's2', 'Capacity=1,000 L|Material=LLDPE'],
  ['SGW-150', 'plb', '', 'Salt-glazed ware pipe 150 mm x 1 m', '', 'gen', 'LEN', '', 38, 'pipe', 'l', 6, 60, 25, 's8', 's2', 'Diameter=150 mm|Length=1 m'],
  // ── Building materials
  ['CPV-60', 'bld', 'CPV', 'Interlocking concrete paver, grey', '60 mm', 'gen', 'PCS', 'PALLET:500', 0.95, 'paver', 'l', 3, 4000, 3.8, 's8', 's1', 'Thickness=60 mm|Colour=Grey|Pieces per m²=≈39'],
  ['CPV-80', 'bld', 'CPV', 'Interlocking concrete paver, grey', '80 mm', 'gen', 'PCS', 'PALLET:400', 1.3, 'paver', 'l', 3, 3000, 5, 's8', 's1', 'Thickness=80 mm|Colour=Grey|Pieces per m²=≈39'],
  ['HVB-DIA', 'bld', 'HVB', 'Hand-made ventilation block 8"x8"', 'Diamond pattern', 'gen', 'PCS', 'PALLET:300', 2.9, 'block', 'l', 5, 600, 3.2, 's8', 's1', 'Size=200 x 200 mm|Pattern=Diamond'],
  ['HVB-SQR', 'bld', 'HVB', 'Hand-made ventilation block 8"x8"', 'Square grille', 'gen', 'PCS', 'PALLET:300', 2.7, 'block', 'l', 5, 600, 3.2, 's8', 's1', 'Size=200 x 200 mm|Pattern=Square'],
  ['RBP-3025', 'bld', 'RBP', 'Rubber bearing pad', '300 x 300 x 25 mm', 'gen', 'PCS', '', 48, 'pad', 'l', 7, 60, 3, 's16', 's3', 'Size=300 x 300 mm|Thickness=25 mm|Hardness=60 IRHD (illustrative)'],
  ['RBP-4025', 'bld', 'RBP', 'Rubber bearing pad', '400 x 400 x 25 mm', 'gen', 'PCS', '', 82, 'pad', 'l', 7, 40, 5.3, 's16', 's3', 'Size=400 x 400 mm|Thickness=25 mm|Hardness=60 IRHD (illustrative)'],
  ['GTX-150', 'bld', 'GTX', 'Non-woven geotextile, 4 m wide', '150 gsm', 'gen', 'M', 'ROLL:100', 3.1, 'geotextile', 'm', 6, 2000, 0.6, 's16', 's8', 'Weight=150 g/m²|Roll=4 m x 100 m'],
  ['GTX-200', 'bld', 'GTX', 'Non-woven geotextile, 4 m wide', '200 gsm', 'gen', 'M', 'ROLL:100', 3.95, 'geotextile', 'm', 6, 1500, 0.8, 's16', 's8', 'Weight=200 g/m²|Roll=4 m x 100 m'],
  ['BRC-A7', 'bld', 'BRC', 'Welded wire mesh, 2.4 x 4.8 m', 'A7 (7 mm)', 'gen', 'SHEET', '', 62, 'mesh', 'h', 4, 80, 26, 's1', 's8', 'Wire=7 mm|Sheet=2.4 x 4.8 m'],
  ['BRC-A10', 'bld', 'BRC', 'Welded wire mesh, 2.4 x 4.8 m', 'A10 (10 mm)', 'gen', 'SHEET', '', 118, 'mesh', 'h', 4, 50, 52, 's1', 's8', 'Wire=10 mm|Sheet=2.4 x 4.8 m'],
  ['CEM-50', 'bld', '', 'Ordinary Portland cement 50 kg', '', 'gen', 'BAG', 'PALLET:40', 19.2, 'bag', 'm', 2, 400, 50, 's8', 's1', 'Net=50 kg|Type=OPC'],
  ['XPS-25', 'bld', 'XPS', 'Extruded polystyrene board 1200 x 600', '25 mm', 'gen', 'SHEET', '', 9.8, 'board', 'l', 5, 200, 0.9, 's8', 's16', 'Thickness=25 mm|Size=1200 x 600 mm'],
  ['XPS-50', 'bld', 'XPS', 'Extruded polystyrene board 1200 x 600', '50 mm', 'gen', 'SHEET', '', 18.5, 'board', 'l', 5, 120, 1.8, 's8', 's16', 'Thickness=50 mm|Size=1200 x 600 mm'],
  ['MDR-040', 'bld', '', 'Metal deck roofing 0.40 mm (per metre)', '', 'gen', 'M', '', 14.2, 'roof', 'h', 4, 600, 3.5, 's15', 's1', 'Thickness=0.40 mm|Cover width=760 mm (illustrative)'],
  ['RFF-20', 'bld', '', 'Roofing felt underlay 1 m x 20 m', '', 'gen', 'ROLL', '', 44, 'roof', 'l', 4, 60, 6, 's15', 's8', 'Roll=1 x 20 m'],
  ['PCR-06', 'bld', '', 'Polycarbonate roof sheet 6 mm', '', 'gen', 'SHEET', '', 96, 'roof', 'm', 5, 40, 4, 's15', 's8', 'Thickness=6 mm|Size=1.22 x 2.44 m'],
  ['RSW-50', 'bld', '', 'Roofing screw with washer 12G x 50 mm', '', 'gen', 'PCS', 'BOX:500', 0.12, 'bolt', 'l', 3, 10000, 0.01, 's15', 's9', 'Size=12G x 50 mm|Finish=Class 3'],
  ['CRB-1000', 'bld', '', 'Concrete road barrier 1 m', '', 'gen', 'PCS', '', 165, 'barrier', 'l', 7, 20, 500, 's8', 's1', 'Length=1 m'],
  ['PRB-1500', 'bld', '', 'PE road barrier, water-fillable 1.5 m', '', 'gen', 'PCS', '', 128, 'barrier', 'l', 6, 30, 12, 's8', 's3', 'Length=1.5 m|Material=HDPE'],
  // ── Industrial & steel
  ['ANG-2525', 'ind', 'ANG', 'Mild steel equal angle bar, 6 m', '25 x 25 x 3 mm', 'gen', 'LEN', '', 24.5, 'angle', 'h', 5, 150, 6.7, 's1', 's3,s9', 'Section=25 x 25 x 3 mm|Length=6 m|Grade=S275 (illustrative)'],
  ['ANG-4040', 'ind', 'ANG', 'Mild steel equal angle bar, 6 m', '40 x 40 x 4 mm', 'gen', 'LEN', '', 42, 'angle', 'h', 5, 120, 14.5, 's1', 's3,s9', 'Section=40 x 40 x 4 mm|Length=6 m|Grade=S275 (illustrative)'],
  ['ANG-5050', 'ind', 'ANG', 'Mild steel equal angle bar, 6 m', '50 x 50 x 5 mm', 'gen', 'LEN', '', 64, 'angle', 'h', 5, 100, 22.6, 's1', 's3,s9', 'Section=50 x 50 x 5 mm|Length=6 m|Grade=S275 (illustrative)'],
  ['HBM-150', 'ind', 'HBM', 'Steel H-beam, 6 m', '150 x 75 mm', 'gen', 'LEN', '', 268, 'beam', 'h', 6, 30, 84, 's1', 's3', 'Section=150 x 75 mm|Length=6 m'],
  ['HBM-200', 'ind', 'HBM', 'Steel H-beam, 6 m', '200 x 100 mm', 'gen', 'LEN', '', 418, 'beam', 'h', 6, 20, 128, 's1', 's3', 'Section=200 x 100 mm|Length=6 m'],
  ['CCH-100', 'ind', '', 'Steel C-channel 100 x 50 mm, 6 m', '', 'gen', 'LEN', '', 158, 'channel', 'h', 5, 40, 56, 's1', 's3', 'Section=100 x 50 mm|Length=6 m'],
  ['SHS-5050', 'ind', '', 'Square hollow section 50 x 50 x 2 mm, 6 m', '', 'gen', 'LEN', '', 72, 'channel', 'h', 5, 80, 18, 's1', 's3', 'Section=50 x 50 x 2 mm|Length=6 m'],
  ['FLB-506', 'ind', '', 'Mild steel flat bar 50 x 6 mm, 6 m', '', 'gen', 'LEN', '', 38, 'angle', 'h', 5, 80, 14, 's1', 's3', 'Section=50 x 6 mm|Length=6 m'],
  ['THR-M12', 'ind', '', 'Threaded rod M12 x 1 m, zinc', '', 'gen', 'PCS', 'BOX:10', 4.2, 'bolt', 'm', 3, 300, 0.7, 's9', 's3,s1', 'Thread=M12|Length=1 m|Finish=Zinc'],
  ['UBL-M10-2', 'ind', 'UBL', 'U-bolt with nuts, galvanised', 'M10 for 2" pipe', 'gen', 'PCS', 'BOX:50', 1.85, 'ubolt', 'm', 3, 400, 0.12, 's9', 's3,s1', 'Thread=M10|Pipe size=2"|Finish=HDG'],
  ['UBL-M12-4', 'ind', 'UBL', 'U-bolt with nuts, galvanised', 'M12 for 4" pipe', 'gen', 'PCS', 'BOX:50', 3.4, 'ubolt', 'm', 3, 300, 0.25, 's9', 's3,s1', 'Thread=M12|Pipe size=4"|Finish=HDG'],
  ['HXB-M12', 'ind', 'HXB', 'Hex bolt & nut set, HDG', 'M12 x 50 mm', 'gen', 'PCS', 'BOX:100', 0.95, 'bolt', 'm', 3, 1000, 0.08, 's9', 's3', 'Thread=M12|Length=50 mm|Grade=4.6 (illustrative)'],
  ['HXB-M16', 'ind', 'HXB', 'Hex bolt & nut set, HDG', 'M16 x 75 mm', 'gen', 'PCS', 'BOX:100', 1.95, 'bolt', 'm', 3, 600, 0.18, 's9', 's3', 'Thread=M16|Length=75 mm|Grade=4.6 (illustrative)'],
  ['CAN-500', 'ind', '', 'Injectable epoxy chemical anchor 500 ml', '', 'hilti', 'PCS', 'CTN:12', 92, 'anchor', 'm', 5, 48, 0.9, 's9', 's3', 'Type=Epoxy injection mortar|Volume=500 ml|Note=Refer to manufacturer datasheet'],
  ['CAC-M12', 'ind', 'CAC', 'Chemical anchor capsule', 'M12', 'wurth', 'PCS', 'BOX:10', 6.5, 'anchor', 'm', 4, 200, 0.05, 's9', 's3', 'Anchor size=M12|Type=Glass capsule'],
  ['CAC-M16', 'ind', 'CAC', 'Chemical anchor capsule', 'M16', 'wurth', 'PCS', 'BOX:10', 9.8, 'anchor', 'm', 4, 120, 0.08, 's9', 's3', 'Anchor size=M16|Type=Glass capsule'],
  ['IBC-1000', 'ind', '', 'IBC tank 1,000 L, reconditioned', '', 'gen', 'PCS', '', 380, 'tank', 'l', 7, 8, 60, 's3', 's10', 'Capacity=1,000 L|Frame=Galvanised cage'],
  ['WRP-10', 'ind', '', 'Steel wire rope 10 mm (per metre)', '', 'gen', 'M', 'ROLL:100', 4.8, 'cable', 'h', 5, 500, 0.4, 's3', 's1', 'Diameter=10 mm|Construction=6x19 (illustrative)'],
  // ── Power tools
  ['PWR-BHD13', 'pwr', '', 'Impact drill 13 mm, 750 W', '', 'bosch', 'PCS', '', 238, 'drill', 'l', 4, 12, 2.2, 's5', 's13,s11', 'Power=750 W|Chuck=13 mm'],
  ['PWR-MCD18', 'pwr', '', 'Cordless drill driver 18 V kit', '', 'makita', 'PCS', '', 455, 'drill', 'l', 4, 10, 2.5, 's13', 's5,s11', 'Voltage=18 V|Kit=2 batteries + charger'],
  ['PWR-BAG4', 'pwr', 'GRD', 'Angle grinder 100 mm', 'BOSCH 720 W', 'bosch', 'PCS', '', 128, 'grinder', 'l', 4, 20, 1.8, 's5', 's13,s11', 'Disc=100 mm|Power=720 W'],
  ['PWR-MAG4', 'pwr', 'GRD', 'Angle grinder 100 mm', 'MAKITA 840 W', 'makita', 'PCS', '', 145, 'grinder', 'l', 4, 15, 1.9, 's13', 's5,s11', 'Disc=100 mm|Power=840 W'],
  ['PWR-DAG4', 'pwr', 'GRD', 'Angle grinder 100 mm', 'DeWALT 900 W', 'dewalt', 'PCS', '', 152, 'grinder', 'l', 4, 12, 2, 's5', 's13,s11', 'Disc=100 mm|Power=900 W'],
  ['PWR-HRH26', 'pwr', '', 'Rotary hammer SDS-plus 26 mm', '', 'hikoki', 'PCS', '', 395, 'drill', 'l', 5, 8, 3, 's13', 's5', 'Chuck=SDS-plus|Capacity=26 mm'],
  ['PWR-MCS7', 'pwr', '', 'Circular saw 185 mm', '', 'makita', 'PCS', '', 365, 'saw', 'l', 4, 6, 4, 's13', 's5', 'Blade=185 mm'],
  ['PWR-DID18', 'pwr', '', 'Impact driver 18 V (bare tool)', '', 'dewalt', 'PCS', '', 410, 'drill', 'l', 4, 6, 1.4, 's5', 's11', 'Voltage=18 V|Battery=Not included'],
  ['PWR-BJS', 'pwr', '', 'Jigsaw 650 W', '', 'bosch', 'PCS', '', 268, 'saw', 'l', 4, 6, 2.3, 's5', 's13', 'Power=650 W'],
  ['PWR-HCO14', 'pwr', '', 'Cut-off machine 355 mm', '', 'hikoki', 'PCS', '', 520, 'saw', 'l', 5, 5, 17, 's13', 's5', 'Disc=355 mm'],
  ['PWR-BDH', 'pwr', '', 'Demolition hammer 1,500 W', '', 'bosch', 'PCS', '', 1180, 'hammer', 'l', 6, 3, 16, 's5', 's11', 'Power=1,500 W|Chuck=SDS-max'],
  ['PWR-HGN', 'pwr', '', 'Heat gun 2,000 W', '', 'bosch', 'PCS', '', 145, 'drill', 'l', 4, 8, 0.7, 's5', 's11', 'Power=2,000 W'],
  ['PWR-CD4', 'pwr', '', 'Metal cutting disc 105 mm', '', 'bosch', 'PCS', 'BOX:25', 1.1, 'disc', 'l', 3, 1000, 0.03, 's5', 's13', 'Diameter=105 mm|Bore=16 mm'],
  ['PWR-DB4', 'pwr', '', 'Diamond blade 105 mm', '', 'gen', 'PCS', 'BOX:10', 12.5, 'disc', 'l', 4, 100, 0.1, 's5', 's12', 'Diameter=105 mm|Type=Segmented'],
  ['PWR-SDS10', 'pwr', '', 'SDS-plus drill bit 10 x 160 mm', '', 'bosch', 'PCS', 'BOX:10', 9.8, 'bits', 'l', 3, 150, 0.08, 's5', 's13', 'Diameter=10 mm|Length=160 mm'],
  // ── Hand tools
  ['HND-BCS12', 'hnd', '', 'Combination spanner set 8–24 mm (12 pc)', '', 'bahco', 'SET', '', 168, 'spanner', 'l', 5, 10, 2, 's5', 's12', 'Pieces=12|Sizes=8–24 mm'],
  ['HND-BAW10', 'hnd', '', 'Adjustable wrench 10"', '', 'bahco', 'PCS', '', 58, 'spanner', 'l', 5, 20, 0.4, 's5', 's12', 'Length=10"'],
  ['HND-PW18', 'hnd', '', 'Pipe wrench 18"', '', 'gen', 'PCS', '', 42, 'spanner', 'l', 6, 20, 1.6, 's12', 's5', 'Length=18"'],
  ['HND-CH16', 'hnd', '', 'Claw hammer 16 oz', '', 'gen', 'PCS', '', 18.5, 'hammer', 'l', 6, 40, 0.7, 's12', 's5', 'Head=16 oz|Handle=Fibreglass'],
  ['HND-MT5', 'hnd', 'MT', 'Measuring tape', '5 m', 'gen', 'PCS', 'BOX:12', 9.5, 'tape', 'l', 6, 120, 0.25, 's12', 's5', 'Length=5 m|Blade=19 mm'],
  ['HND-MT8', 'hnd', 'MT', 'Measuring tape', '8 m', 'gen', 'PCS', 'BOX:12', 14.8, 'tape', 'l', 6, 80, 0.35, 's12', 's5', 'Length=8 m|Blade=25 mm'],
  ['HND-SL60', 'hnd', '', 'Spirit level 600 mm', '', 'gen', 'PCS', '', 26, 'level', 'l', 6, 30, 0.5, 's12', 's5', 'Length=600 mm|Vials=3'],
  ['HND-SDS6', 'hnd', '', 'Screwdriver set (6 pc)', '', 'bahco', 'SET', '', 46, 'screwdriver', 'l', 5, 20, 0.6, 's5', 's12', 'Pieces=6'],
  ['HND-CP8', 'hnd', '', 'Combination pliers 8"', '', 'bahco', 'PCS', '', 32, 'pliers', 'l', 5, 30, 0.3, 's5', 's12', 'Length=8"'],
  ['HND-HS12', 'hnd', '', 'Hacksaw frame 12"', '', 'gen', 'PCS', '', 16, 'saw', 'l', 6, 30, 0.5, 's12', 's5', 'Blade=12"'],
  ['HND-BC24', 'hnd', '', 'Bolt cutter 24"', '', 'gen', 'PCS', '', 58, 'pliers', 'l', 6, 10, 2.6, 's12', 's5', 'Length=24"'],
  ['HND-TR11', 'hnd', '', 'Brick trowel 11"', '', 'gen', 'PCS', '', 11.5, 'level', 'l', 6, 40, 0.4, 's12', 's5', 'Blade=11"'],
  ['HND-WB65', 'hnd', '', 'Wheelbarrow 65 L', '', 'gen', 'PCS', '', 118, 'wheelbarrow', 'l', 6, 10, 16, 's12', 's14', 'Capacity=65 L|Tyre=Pneumatic'],
  // ── Safety
  ['SHM-WHT', 'saf', 'SHM', 'Safety helmet with ratchet harness', 'White', 'pye', 'PCS', 'BOX:20', 9.8, 'helmet', 'l', 3, 200, 0.4, 's4', 's3', 'Colour=White|Harness=Ratchet'],
  ['SHM-YLW', 'saf', 'SHM', 'Safety helmet with ratchet harness', 'Yellow', 'pye', 'PCS', 'BOX:20', 9.8, 'helmet', 'l', 3, 200, 0.4, 's4', 's3', 'Colour=Yellow|Harness=Ratchet'],
  ['SHM-RED', 'saf', 'SHM', 'Safety helmet with ratchet harness', 'Red', 'pye', 'PCS', 'BOX:20', 9.8, 'helmet', 'l', 3, 100, 0.4, 's4', 's3', 'Colour=Red|Harness=Ratchet'],
  ['SHM-BLU', 'saf', 'SHM', 'Safety helmet with ratchet harness', 'Blue', 'pye', 'PCS', 'BOX:20', 9.8, 'helmet', 'l', 3, 100, 0.4, 's4', 's3', 'Colour=Blue|Harness=Ratchet'],
  ['GLV-COT', 'saf', 'GLV', 'Work gloves', 'Cotton knitted', 'gen', 'PAIR', 'BOX:12', 0.85, 'gloves', 'l', 3, 2000, 0.05, 's4', 's3', 'Material=Cotton|Size=Free'],
  ['GLV-NIT', 'saf', 'GLV', 'Work gloves', 'Nitrile-coated', 'gen', 'PAIR', 'BOX:12', 1.9, 'gloves', 'l', 3, 1200, 0.06, 's4', 's3', 'Coating=Nitrile|Size=L'],
  ['GLV-WLD', 'saf', 'GLV', 'Work gloves', 'Leather welding', 'gen', 'PAIR', 'BOX:12', 9.5, 'gloves', 'l', 4, 120, 0.3, 's4', 's3', 'Material=Split leather|Length=14"'],
  ['SFV-REF', 'saf', '', 'Reflective safety vest', '', 'gen', 'PCS', 'BOX:50', 4.5, 'vest', 'l', 3, 300, 0.15, 's4', 's3', 'Colour=Lime|Tape=50 mm reflective'],
  ['SFC-28', 'saf', '', 'PVC safety cone 28"', '', 'gen', 'PCS', '', 11.5, 'cone', 'l', 4, 100, 1.2, 's4', 's3', 'Height=28"|Band=Reflective'],
  ['FAN-36', 'saf', '', 'Fall arrest netting 3 x 6 m', '', 'gen', 'PCS', '', 85, 'netting', 'l', 6, 20, 4, 's4', 's3', 'Size=3 x 6 m'],
  ['ABN-50', 'saf', '', 'Anti-bird netting 4 x 50 m', '', 'gen', 'ROLL', '', 98, 'netting', 'l', 6, 15, 5, 's4', 's3', 'Size=4 x 50 m'],
  ['FBH-01', 'saf', '', 'Full body harness, double lanyard', '', '3m', 'PCS', '', 168, 'harness', 'l', 5, 15, 1.8, 's4', 's3', 'Lanyard=Double, shock absorbing'],
  ['EPL-200', 'saf', '', 'Disposable ear plugs (box of 200 pairs)', '', '3m', 'BOX', '', 68, 'mask', 'l', 4, 20, 0.6, 's4', 's3', 'Pairs per box=200'],
  ['N95-20', 'saf', '', 'N95 particulate respirator (box of 20)', '', '3m', 'BOX', '', 42, 'mask', 'l', 4, 40, 0.3, 's4', 's3', 'Masks per box=20'],
  ['SGG-01', 'saf', '', 'Safety goggles, anti-fog', '', '3m', 'PCS', '', 8.9, 'mask', 'l', 4, 120, 0.1, 's4', 's3', 'Lens=Polycarbonate, anti-fog'],
  ['AWP-20', 'saf', '', 'Aluminium work platform 2 m', '', 'gen', 'PCS', '', 680, 'platform', 'l', 8, 4, 28, 's3', 's4', 'Platform height=2 m (illustrative)'],
  // ── Electrical
  ['ELC-LT4', 'elc', '', 'LED T8 tube 4 ft, 18 W', '', 'gen', 'PCS', 'CTN:25', 5.2, 'lamp', 'l', 4, 300, 0.2, 's7', 's11', 'Length=4 ft|Power=18 W'],
  ['ELC-FL50', 'elc', 'FL', 'LED floodlight IP65', '50 W', 'gen', 'PCS', '', 38, 'lamp', 'l', 4, 40, 1.2, 's7', 's11', 'Power=50 W|IP=65'],
  ['ELC-FL100', 'elc', 'FL', 'LED floodlight IP65', '100 W', 'gen', 'PCS', '', 68, 'lamp', 'l', 4, 30, 2, 's7', 's11', 'Power=100 W|IP=65'],
  ['ELC-EXT4', 'elc', '', 'Extension socket 4-gang, 5 m', '', 'gen', 'PCS', '', 26, 'socket', 'l', 4, 60, 0.8, 's7', 's11', 'Outlets=4|Cable=5 m'],
  ['ELC-CBL25', 'elc', '', 'PVC insulated cable 2.5 mm² (per metre)', '', 'gen', 'M', 'ROLL:100', 1.15, 'cable', 'm', 4, 3000, 0.03, 's7', 's11', 'Conductor=Copper|Size=2.5 mm²'],
  ['ELC-MCB20', 'elc', '', 'Miniature circuit breaker (MCB) 20 A, 1P', '', 'gen', 'PCS', 'BOX:12', 9.8, 'socket', 'l', 4, 120, 0.1, 's7', 's11', 'Rating=20 A|Poles=1'],
  ['ELC-WF24', 'elc', '', 'Industrial wall fan 24"', '', 'gen', 'PCS', '', 168, 'fan', 'l', 5, 10, 8, 's7', 's11', 'Sweep=24"'],
  ['ELC-SF16', 'elc', '', 'Stand fan 16"', '', 'gen', 'PCS', '', 72, 'fan', 'l', 5, 15, 5, 's7', 's11', 'Sweep=16"'],
  ['ELC-EF10', 'elc', '', 'Exhaust fan 10"', '', 'gen', 'PCS', '', 58, 'fan', 'l', 5, 20, 2.2, 's7', 's11', 'Size=10"'],
  ['ELC-WL20', 'elc', '', 'Rechargeable LED work lamp 20 W', '', 'gen', 'PCS', '', 46, 'lamp', 'l', 5, 20, 0.9, 's7', 's11', 'Power=20 W|Battery=Li-ion'],
  ['ELC-CND20', 'elc', '', 'PVC conduit 20 mm x 2.9 m', '', 'gen', 'LEN', '', 2.4, 'pipe', 'l', 4, 400, 0.5, 's7', 's10', 'Diameter=20 mm|Length=2.9 m'],
  ['ELC-CT300', 'elc', '', 'Cable ties 300 mm (pack of 100)', '', 'gen', 'BOX', '', 7.5, 'box', 'l', 4, 100, 0.2, 's7', 's11', 'Length=300 mm|Pack=100'],
  ['ELC-MM', 'elc', '', 'Digital multimeter', '', 'gen', 'PCS', '', 48, 'socket', 'l', 5, 10, 0.4, 's7', 's11', 'Display=LCD'],
  // ── Chemicals
  ['CHM-SSC', 'chm', 'SSL', 'Silicone sealant 300 ml', 'Clear', 'sika', 'PCS', 'CTN:24', 9.5, 'sealant', 'm', 5, 480, 0.35, 's6', 's3', 'Volume=300 ml|Colour=Clear'],
  ['CHM-SSW', 'chm', 'SSL', 'Silicone sealant 300 ml', 'White', 'sika', 'PCS', 'CTN:24', 9.5, 'sealant', 'm', 5, 480, 0.35, 's6', 's3', 'Volume=300 ml|Colour=White'],
  ['CHM-PUS', 'chm', '', 'PU construction sealant 600 ml', '', 'sika', 'PCS', 'CTN:20', 19.8, 'sealant', 'm', 5, 200, 0.75, 's6', 's3', 'Volume=600 ml|Type=Polyurethane'],
  ['CHM-WPM', 'chm', '', 'Cementitious waterproofing kit 20 kg', '', 'sika', 'PCS', '', 128, 'pail', 'm', 5, 30, 20, 's6', 's3', 'Kit=20 kg'],
  ['CHM-NSG', 'chm', '', 'Non-shrink cementitious grout 25 kg', '', 'fosroc', 'BAG', 'PALLET:40', 42, 'bag', 'm', 5, 120, 25, 's6', 's3', 'Net=25 kg'],
  ['CHM-TAD', 'chm', '', 'Cement-based tile adhesive 25 kg', '', 'mapei', 'BAG', 'PALLET:40', 26, 'bag', 'm', 5, 160, 25, 's6', 's8', 'Net=25 kg'],
  ['CHM-EPX', 'chm', '', 'Epoxy floor coating kit 5 L', '', 'gen', 'PCS', '', 185, 'pail', 'm', 6, 15, 6, 's6', 's3', 'Volume=5 L|Parts=2'],
  ['CHM-MRO', 'chm', '', 'Mould release oil (per litre)', '', 'gen', 'L', 'DRUM:200', 4.6, 'drum', 'h', 5, 1200, 0.9, 's6', 's3', 'Packing=200 L drum|Use=Formwork'],
  ['CHM-MPS', 'chm', '', 'Multi-purpose lubricant spray 400 ml', '', 'wurth', 'PCS', 'CTN:24', 14.5, 'spray', 'l', 4, 120, 0.4, 's6', 's3', 'Volume=400 ml'],
  ['CHM-CCC', 'chm', '', 'Concrete curing compound 20 L', '', 'fosroc', 'PCS', '', 145, 'pail', 'm', 6, 20, 20, 's6', 's3', 'Volume=20 L'],
  ['CHM-BAG', 'chm', '', 'Bonding agent 5 L', '', 'sika', 'PCS', '', 78, 'pail', 'm', 5, 30, 5.2, 's6', 's3', 'Volume=5 L'],
  ['CHM-ARP', 'chm', '', 'Anti-rust primer 5 L', '', 'gen', 'PCS', '', 64, 'pail', 'm', 5, 30, 6, 's6', 's3', 'Volume=5 L'],
  ['CHM-CAD', 'chm', '', 'Construction adhesive 300 ml', '', 'sika', 'PCS', 'CTN:24', 12.8, 'sealant', 'l', 5, 240, 0.4, 's6', 's3', 'Volume=300 ml'],
  // ── Household & storage
  ['HSE-SB60', 'hse', '', 'Storage box 60 L with lid', '', 'gen', 'PCS', '', 22.5, 'box', 'l', 6, 60, 2, 's14', 's10', 'Capacity=60 L'],
  ['HSE-CRT', 'hse', '', 'Stackable crate 600 x 400 mm', '', 'gen', 'PCS', '', 16.8, 'box', 'l', 6, 80, 1.8, 's14', 's10', 'Size=600 x 400 mm'],
  ['HSE-SR5', 'hse', '', 'Steel shelving rack, 5-tier', '', 'gen', 'SET', '', 158, 'shelf', 'l', 7, 10, 22, 's14', 's12', 'Tiers=5|Load=150 kg per shelf (illustrative)'],
  ['HSE-TB20', 'hse', '', 'Tool box 20"', '', 'gen', 'PCS', '', 34, 'box', 'l', 6, 20, 1.5, 's12', 's14', 'Length=20"'],
  ['HSE-GB120', 'hse', '', 'Wheeled garbage bin 120 L', '', 'gen', 'PCS', '', 98, 'box', 'l', 6, 15, 8, 's14', 's10', 'Capacity=120 L'],
  ['HSE-PL20', 'hse', '', 'Heavy-duty pail 20 L', '', 'gen', 'PCS', '', 7.8, 'pail', 'l', 5, 120, 0.8, 's10', 's14', 'Capacity=20 L'],
  ['HSE-LD6', 'hse', '', 'Aluminium step ladder, 6-step', '', 'gen', 'PCS', '', 135, 'ladder', 'l', 6, 10, 7, 's14', 's12', 'Steps=6'],
  ['HSE-HR30', 'hse', '', 'Garden hose reel 30 m', '', 'gen', 'PCS', '', 68, 'hose', 'l', 6, 15, 4, 's10', 's14', 'Length=30 m'],
  ['HSE-PDL50', 'hse', '', 'Brass padlock 50 mm', '', 'gen', 'PCS', 'BOX:12', 14.5, 'lock', 'l', 6, 60, 0.4, 's12', 's14', 'Width=50 mm'],
  ['HSE-BRM', 'hse', '', 'Heavy-duty broom', '', 'gen', 'PCS', '', 8.5, 'pail', 'l', 5, 60, 0.6, 's14', 's10', 'Head=Stiff bristle'],
  ['HSE-PLT', 'hse', '', 'Plastic pallet 1200 x 1000 mm', '', 'gen', 'PCS', '', 88, 'shelf', 'l', 7, 20, 15, 's14', 's10', 'Size=1200 x 1000 mm'],
  ['HSE-SBN', 'hse', '', 'Stackable parts bin set (12 pc)', '', 'gen', 'SET', '', 46, 'box', 'l', 6, 20, 2.4, 's14', 's12', 'Pieces=12'],
];

export const PRODUCT_DEFS: ProductDef[] = ROWS.map((r) => ({
  sku: r[0], cat: r[1], fam: r[2] || undefined, name: r[3], v: r[4] || undefined, brand: B[r[5]], uom: r[6], uoms: r[7] || undefined,
  cost: r[8], art: r[9], vol: r[10], lead: r[11], roq: r[12], kg: r[13], sup: r[14], alt: r[15] ? r[15].split(',') : [], specs: r[16],
}));

export interface CustomerDef {
  id: string; name: string; type: CustomerType; tier: CustomerTier; limit: number; terms: number; town: string; contact: string; role: string;
  payer: 'good' | 'slow' | 'late'; weight: number; project?: string; tags?: string[];
}

export const CUSTOMERS: CustomerDef[] = [
  { id: 'c_walkin', name: 'Walk-in customer (cash)', type: 'walkin', tier: 'walkin', limit: 0, terms: 0, town: 'Puchong', contact: 'Counter', role: '—', payer: 'good', weight: 0 },
  { id: 'c_trade', name: 'Trade counter account (cash)', type: 'trade', tier: 'trade', limit: 0, terms: 0, town: 'Puchong', contact: 'Counter', role: '—', payer: 'good', weight: 0 },
  { id: 'c01', name: 'Teratai Build Works', type: 'contractor', tier: 'contractor', limit: 80000, terms: 30, town: 'Puchong', contact: 'Ahmad Faizal', role: 'Project manager', payer: 'good', weight: 5, tags: ['repeat'] },
  { id: 'c02', name: 'Puncak Renovation Studio', type: 'renovation', tier: 'trade', limit: 25000, terms: 30, town: 'Subang Jaya', contact: 'Priya Nair', role: 'Owner', payer: 'good', weight: 3 },
  { id: 'c03', name: 'Granite Line Construction', type: 'contractor', tier: 'key', limit: 250000, terms: 60, town: 'Shah Alam', contact: 'Tan Wei Ming', role: 'Procurement lead', payer: 'good', weight: 6, project: 'Warehouse block C (fictional)', tags: ['key account', 'contract pricing'] },
  { id: 'c04', name: 'Halia Interiors', type: 'renovation', tier: 'trade', limit: 15000, terms: 30, town: 'Petaling Jaya', contact: 'Lim Siew Ling', role: 'Designer', payer: 'good', weight: 2 },
  { id: 'c05', name: 'Kristal M&E Services', type: 'industrial', tier: 'contractor', limit: 60000, terms: 45, town: 'Cyberjaya', contact: 'Muthu Raj', role: 'M&E engineer', payer: 'slow', weight: 4 },
  { id: 'c06', name: 'Delima Industrial Fabrication', type: 'industrial', tier: 'key', limit: 180000, terms: 60, town: 'Klang', contact: 'Wong Kah Hoe', role: 'Purchasing', payer: 'good', weight: 5, tags: ['steel'] },
  { id: 'c07', name: 'Seroja Project Builders', type: 'project', tier: 'project', limit: 300000, terms: 60, town: 'Cyberjaya', contact: 'Nurul Aina', role: 'Site QS', payer: 'slow', weight: 5, project: 'Seroja Residences Phase 2 (fictional)' },
  { id: 'c08', name: 'Angsana Landscape Works', type: 'contractor', tier: 'contractor', limit: 40000, terms: 30, town: 'Putrajaya', contact: 'Kumar Selvam', role: 'Supervisor', payer: 'good', weight: 3 },
  { id: 'c09', name: 'Cempaka Facility Services', type: 'industrial', tier: 'trade', limit: 30000, terms: 30, town: 'Seri Kembangan', contact: 'Chong Mei Yee', role: 'Facilities exec', payer: 'good', weight: 3 },
  { id: 'c10', name: 'Orkid Precast Products', type: 'industrial', tier: 'key', limit: 150000, terms: 60, town: 'Semenyih', contact: 'Hafizah Omar', role: 'Plant manager', payer: 'good', weight: 4 },
  { id: 'c11', name: 'Merbau Steel Fabricators', type: 'industrial', tier: 'contractor', limit: 90000, terms: 45, town: 'Klang', contact: 'Lee Kok Wai', role: 'Director', payer: 'slow', weight: 4, tags: ['steel'] },
  { id: 'c12', name: 'Tembusu Renovations', type: 'renovation', tier: 'trade', limit: 20000, terms: 30, town: 'Kajang', contact: 'Siti Hajar', role: 'Owner', payer: 'good', weight: 2 },
  { id: 'c13', name: 'Bayu Plumbing & Piping Works', type: 'contractor', tier: 'contractor', limit: 45000, terms: 30, town: 'Puchong', contact: 'Rizal Hakim', role: 'Contractor', payer: 'good', weight: 4, tags: ['plumbing', 'WhatsApp'] },
  { id: 'c14', name: 'Riverstone Developments', type: 'project', tier: 'project', limit: 400000, terms: 60, town: 'Bangi', contact: 'Daniel Ho', role: 'Contracts manager', payer: 'good', weight: 4, project: 'Riverstone Park (fictional)' },
  { id: 'c15', name: 'Kayu Manis Builders', type: 'contractor', tier: 'contractor', limit: 50000, terms: 30, town: 'Seri Kembangan', contact: 'Ng Chee Keong', role: 'Site manager', payer: 'good', weight: 3 },
  { id: 'c16', name: 'Lestari Roofing Services', type: 'contractor', tier: 'contractor', limit: 30000, terms: 30, town: 'Shah Alam', contact: 'Zulkifli Hassan', role: 'Owner', payer: 'slow', weight: 3, tags: ['roofing'] },
  { id: 'c17', name: 'Arjuna Electrical Contractors', type: 'contractor', tier: 'contractor', limit: 45000, terms: 30, town: 'Petaling Jaya', contact: 'Arun Prakash', role: 'Electrical contractor', payer: 'good', weight: 3 },
  { id: 'c18', name: 'Mutiara Kitchen & Bath', type: 'renovation', tier: 'trade', limit: 18000, terms: 30, town: 'Puchong', contact: 'Jessica Lau', role: 'Showroom manager', payer: 'good', weight: 2 },
  { id: 'c19', name: 'Perdana Civil Engineering', type: 'contractor', tier: 'key', limit: 220000, terms: 60, town: 'Kajang', contact: 'Ismail Kassim', role: 'Project director', payer: 'good', weight: 5, project: 'Drainage upgrade package (fictional)' },
  { id: 'c20', name: 'Sinar Logistics Warehouse', type: 'industrial', tier: 'trade', limit: 25000, terms: 30, town: 'Klang', contact: 'Vincent Chua', role: 'Admin', payer: 'good', weight: 2 },
  { id: 'c21', name: 'Selasih Interior Fit-out', type: 'renovation', tier: 'trade', limit: 22000, terms: 30, town: 'Subang Jaya', contact: 'Amirah Yusof', role: 'Project coordinator', payer: 'good', weight: 2 },
  { id: 'c22', name: 'Bukit Raya Maintenance Services', type: 'industrial', tier: 'trade', limit: 28000, terms: 30, town: 'Puchong', contact: 'Gopal Krishnan', role: 'Maintenance head', payer: 'slow', weight: 2 },
  { id: 'c23', name: 'Embun Aqua Systems', type: 'contractor', tier: 'contractor', limit: 32000, terms: 30, town: 'Cyberjaya', contact: 'Hanis Rahman', role: 'Engineer', payer: 'good', weight: 2, tags: ['plumbing'] },
  { id: 'c24', name: 'Gemilang Shopfit', type: 'renovation', tier: 'trade', limit: 15000, terms: 30, town: 'Petaling Jaya', contact: 'Eric Teoh', role: 'Owner', payer: 'good', weight: 1 },
  { id: 'c25', name: 'Harmoni Facilities Management', type: 'industrial', tier: 'key', limit: 120000, terms: 45, town: 'Putrajaya', contact: 'Rosnah Ibrahim', role: 'Procurement', payer: 'good', weight: 3 },
  { id: 'c26', name: 'Zamrud Home Improvement', type: 'renovation', tier: 'trade', limit: 12000, terms: 30, town: 'Puchong', contact: 'Hakim Salleh', role: 'Owner', payer: 'late', weight: 3, tags: ['credit watch'] },
];

export const VEHICLES = [
  { id: 'v1', plate: 'DEMO 1 (3-ton lorry)', type: '3-ton lorry', capacityKg: 3000 },
  { id: 'v2', plate: 'DEMO 2 (1-ton van)', type: '1-ton van', capacityKg: 1000 },
  { id: 'v3', plate: 'DEMO 3 (5-ton crane lorry)', type: '5-ton lorry with crane', capacityKg: 5000 },
  { id: 'v4', plate: 'DEMO 4 (pickup)', type: 'Pickup truck', capacityKg: 700 },
];

export const DRIVERS = [
  { id: 'd1', name: 'Muthu Samy', phone: '+60 12-000 0411', vehicleId: 'v1' },
  { id: 'd2', name: 'Azlan Hamid', phone: '+60 12-000 0412', vehicleId: 'v2' },
  { id: 'd3', name: 'Lim Boon Keat', phone: '+60 12-000 0413', vehicleId: 'v3' },
  { id: 'd4', name: 'Faizal Rahim', phone: '+60 12-000 0414', vehicleId: 'v4' },
];

export const STAFF = {
  owner: 'Daniel Lim',
  sales_manager: 'Aisyah Rahman',
  sales_exec: 'Kevin Tan',
  procurement: 'Ravi Kumar',
  wh_supervisor: 'Hafiz Ismail',
  picker: 'Jason Wong',
  dispatcher: 'Muthu Samy',
  finance: 'Grace Chong',
  cashier: 'Nur Izzati',
} as const;

/** Public company facts shown on documents (from the official website). */
export const COMPANY = {
  legalName: 'Man Kian Hardware & Trading Sdn Bhd',
  shortName: 'MK Hardware',
  registration: '201401023990 (1100078-X)',
  address: '26, Jalan BP 5/2, Bandar Bukit Puchong, 47100 Puchong, Selangor, Malaysia',
  website: 'www.mkhardware.com.my',
};
