// SeefStore's shipping and exchange rules. Change a number here and the shipping page,
// product pages, cart and order messages all follow.
export const SHIPPING_FEE = 100;           // EGP, same for every governorate
export const FREE_SHIPPING_FROM = 2000;    // EGP: orders of this much or more ship free
export const EXCHANGE_DAYS = 7;            // exchange window after delivery (no refunds)

export const shippingFor = (subtotal) => (subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE);
