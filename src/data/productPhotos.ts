/**
 * Product photos taken from the client's own website (www.mkhardware.com.my), used with the
 * client's permission for this demo. Keyed by demo SKU; files live in public/products/.
 * Photos show the product TYPE — several sizes/variants of one family share a photo.
 * SKUs without an entry fall back to the built-in illustration.
 */
export const PRODUCT_PHOTOS: Record<string, string> = {
  // SKU: file, // source product id on mkhardware.com.my (/showproducts/productid/<id>/)
  'PVP-D-015': 'upvc-pipe.webp', // 6413356
  'PVP-D-020': 'upvc-pipe.webp', // 6413356
  'PVP-D-025': 'upvc-pipe.webp', // 6413356
  'PVP-D-040': 'upvc-pipe.webp', // 6413356
  'PVP-D-050': 'upvc-pipe.webp', // 6413356
  'PVP-D-080': 'upvc-pipe.webp', // 6413356
  'PVP-D-100': 'upvc-pipe.webp', // 6413356
  'UPD-110': 'upvc-pipe.webp', // 6413356
  'BV-015': 'brass-ball-valve.webp', // 6104389
  'BV-025': 'brass-ball-valve.webp', // 6104389
  'BT-015': 'brass-bib-tap.webp', // 6256831
  'PTF-12': 'ptfe-tape.webp', // 6144371
  'SGW-150': 'salt-glazed-pipe.webp', // 6302199
  'HVB-DIA': 'vent-block-diamond.webp', // 6176281
  'HVB-SQR': 'vent-block-square.webp', // 5786479
  'RBP-3025': 'rubber-pad.webp', // 6848984
  'RBP-4025': 'rubber-pad.webp', // 6848984
  'GTX-150': 'geotextile.webp', // 6768451
  'GTX-200': 'geotextile.webp', // 6768451
  'MDR-040': 'metal-roofing.webp', // 6382764
  'PCR-06': 'polycarbonate-sheet.webp', // 6744624
  'RSW-50': 'roofing-screw.webp', // 5465443
  'ANG-2525': 'angle-bar.webp', // 6536170
  'ANG-4040': 'angle-bar.webp', // 6536170
  'ANG-5050': 'angle-bar.webp', // 6536170
  'CCH-100': 'c-channel.webp', // 6731946
  'FLB-506': 'flat-bar.webp', // 6731978
  'THR-M12': 'threaded-rod.webp', // 6367853
  'UBL-M10-2': 'u-bolt.webp', // 6732051
  'UBL-M12-4': 'u-bolt.webp', // 6732051
  'CAC-M12': 'anchor-capsule.webp', // 6367939
  'CAC-M16': 'anchor-capsule.webp', // 6367939
  'PWR-DAG4': 'dewalt-angle-grinder.webp', // 4836855
  'PWR-DID18': 'dewalt-impact-driver.webp', // 4829984
  'HND-PW18': 'pipe-wrench.webp', // 6190767
  'HND-MT5': 'measuring-tape.webp', // 6803952
  'HND-MT8': 'measuring-tape.webp', // 6803952
  'HND-HS12': 'hacksaw.webp', // 6244929
  'HND-BC24': 'bolt-cutter.webp', // 6808455
  'HND-WB65': 'wheelbarrow.webp', // 6836804
  'SFC-28': 'safety-cone.webp', // 6179316
  'FAN-36': 'safety-net.webp', // 6655532
  'AWP-20': 'work-platform.webp', // 6879131
  'ELC-WF24': 'wall-fan.webp', // 6660213
  'ELC-SF16': 'stand-fan.webp', // 6660218
  'ELC-EF10': 'exhaust-fan.webp', // 6660439
  'CHM-EPX': 'epoxy-coating.webp', // 5111936
  'CHM-ARP': 'red-oxide-primer.webp', // 6361657
  'HSE-LD6': 'step-ladder.webp', // 6880299
  'HSE-HR30': 'hose-reel.webp', // 6245362
};

export function photoFor(sku: string): string | undefined {
  const f = PRODUCT_PHOTOS[sku];
  return f ? `/products/${f}` : undefined;
}
