export function entityLink(type: string, id: string): string | undefined {
  switch (type) {
    case 'quote':
      return `/quotes/${id}`;
    case 'order':
      return `/orders?id=${id}`;
    case 'po':
      return `/procurement?tab=pos&id=${id}`;
    case 'grn':
      return `/warehouse?grn=${id}`;
    case 'product':
      return `/pricing?sku=${id}`;
    case 'invoice':
      return `/finance?tab=invoices&id=${id}`;
    case 'payment':
      return `/finance?tab=payments`;
    case 'delivery':
      return `/delivery?id=${id}`;
    case 'picklist':
      return `/inventory?tab=picking`;
    case 'enquiry':
      return `/enquiries?id=${id}`;
    case 'rfq':
      return `/enquiries`;
    case 'customer':
      return `/customers?id=${id}`;
    case 'requisition':
      return `/procurement?tab=requisitions`;
    case 'price_batch':
      return `/pricing?tab=batch`;
    case 'price_rule':
      return `/pricing?tab=rules`;
    case 'pos':
      return `/pos`;
    case 'return':
      return `/inventory?tab=ledger`;
    default:
      return undefined;
  }
}
