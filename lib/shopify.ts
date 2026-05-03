const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || 'gcitires.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || '';
const SHOPIFY_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

const BASE_URL = `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_VERSION}`;

async function shopifyFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Shopify API error ${response.status} on ${endpoint}: ${text.slice(0, 200)}`
    );
  }

  return response.json() as Promise<T>;
}

// --- Order types ---

export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  variant_title: string | null;
  sku: string | null;
}

export interface ShopifyFulfillment {
  id: number;
  status: string;
  tracking_company: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  created_at: string;
}

export interface ShopifyOrder {
  id: number;
  name: string; // e.g. "#1234"
  email: string;
  created_at: string;
  updated_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
  line_items: ShopifyLineItem[];
  fulfillments: ShopifyFulfillment[];
  shipping_address?: {
    name: string;
    address1: string;
    city: string;
    province: string;
    zip: string;
    country: string;
  };
  note?: string;
  tags?: string;
}

export interface OrderLookupResult {
  found: boolean;
  order?: {
    orderNumber: string;
    status: string;
    financialStatus: string;
    fulfillmentStatus: string;
    totalPrice: string;
    currency: string;
    createdAt: string;
    items: Array<{
      title: string;
      quantity: number;
      price: string;
      variant: string | null;
    }>;
    tracking: Array<{
      company: string | null;
      number: string | null;
      url: string | null;
    }>;
    shippingAddress?: string;
  };
  error?: string;
}

export async function lookupOrder(
  orderNumber: string,
  email: string
): Promise<OrderLookupResult> {
  // Normalize order number: strip leading # and whitespace
  const normalized = orderNumber.replace(/^#/, '').trim();

  try {
    // Shopify Admin API — search by name (order number)
    const data = await shopifyFetch<{ orders: ShopifyOrder[] }>(
      `/orders.json?name=%23${encodeURIComponent(normalized)}&status=any&fields=id,name,email,created_at,updated_at,financial_status,fulfillment_status,total_price,currency,line_items,fulfillments,shipping_address`
    );

    const orders = data.orders || [];

    // Verify email matches (case-insensitive)
    const matchedOrder = orders.find(
      (o) => o.email.toLowerCase() === email.toLowerCase().trim()
    );

    if (!matchedOrder) {
      return {
        found: false,
        error:
          'No order found with that order number and email combination. Please double-check both and try again.',
      };
    }

    const tracking = matchedOrder.fulfillments.map((f) => ({
      company: f.tracking_company,
      number: f.tracking_number,
      url: f.tracking_url,
    }));

    const shippingAddr = matchedOrder.shipping_address
      ? [
          matchedOrder.shipping_address.address1,
          matchedOrder.shipping_address.city,
          matchedOrder.shipping_address.province,
          matchedOrder.shipping_address.zip,
          matchedOrder.shipping_address.country,
        ]
          .filter(Boolean)
          .join(', ')
      : undefined;

    return {
      found: true,
      order: {
        orderNumber: matchedOrder.name,
        status: matchedOrder.fulfillment_status || 'unfulfilled',
        financialStatus: matchedOrder.financial_status,
        fulfillmentStatus: matchedOrder.fulfillment_status || 'unfulfilled',
        totalPrice: `${matchedOrder.total_price} ${matchedOrder.currency}`,
        currency: matchedOrder.currency,
        createdAt: matchedOrder.created_at,
        items: matchedOrder.line_items.map((item) => ({
          title: item.title,
          quantity: item.quantity,
          price: item.price,
          variant: item.variant_title,
        })),
        tracking,
        shippingAddress: shippingAddr,
      },
    };
  } catch (err) {
    console.error('[Shopify] lookupOrder error:', err);
    return {
      found: false,
      error: 'Unable to look up order at this time. Please try again later.',
    };
  }
}

// --- Product catalog types ---

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  product_type: string;
  tags: string;
  variants: Array<{
    id: number;
    title: string;
    price: string;
    sku: string | null;
    available: boolean;
  }>;
  images: Array<{ src: string }>;
}

export interface CatalogSearchResult {
  found: boolean;
  products: Array<{
    title: string;
    url: string;
    type: string;
    priceFrom: string;
    variants: string[];
    imageUrl: string | null;
    tags: string[];
  }>;
  totalFound: number;
}

export async function searchCatalog(params: {
  tire_size?: string;
  vehicle?: string;
  season?: string;
  limit?: number;
}): Promise<CatalogSearchResult> {
  const { tire_size, vehicle, season, limit = 5 } = params;

  try {
    // Build search query — Shopify Admin API product search
    const queryParts: string[] = ['product_type:Tires OR product_type:Pneus'];

    // Map season to common tag patterns
    if (season) {
      const seasonMap: Record<string, string> = {
        winter: 'winter hiver',
        summer: 'summer été',
        'all-season': 'all-season toutes-saisons',
        'all-weather': 'all-weather toutes-conditions',
      };
      const seasonTags = seasonMap[season] || season;
      queryParts.push(seasonTags);
    }

    if (tire_size) {
      queryParts.push(tire_size);
    }

    if (vehicle) {
      // Extract year/make from vehicle string
      const parts = vehicle.trim().split(' ');
      if (parts.length >= 2) {
        queryParts.push(parts.slice(0, 2).join(' '));
      }
    }

    // Use the built query to actually filter on the API side
    const queryEncoded = encodeURIComponent(queryParts.join(' '));
    // Fetch a larger pool (50) so client-side size/season filter has enough to work with
    const data = await shopifyFetch<{ products: ShopifyProduct[] }>(
      `/products.json?limit=50&fields=id,title,handle,product_type,tags,variants,images&title=${queryEncoded}`
    );

    // Client-side filter since Shopify Admin REST has limited search
    let products = data.products || [];

    if (tire_size) {
      const sizePattern = tire_size.replace(/[^0-9/R]/gi, '').toLowerCase();
      products = products.filter(
        (p) =>
          p.title.toLowerCase().includes(sizePattern) ||
          p.tags.toLowerCase().includes(sizePattern) ||
          p.variants.some((v) =>
            v.title.toLowerCase().includes(sizePattern)
          )
      );
    }

    if (season) {
      const seasonLower = season.toLowerCase();
      products = products.filter(
        (p) =>
          p.title.toLowerCase().includes(seasonLower) ||
          p.tags.toLowerCase().includes(seasonLower) ||
          p.product_type.toLowerCase().includes(seasonLower)
      );
    }

    const mapped = products.slice(0, limit).map((p) => ({
      title: p.title,
      url: `https://gcitires.com/products/${p.handle}`,
      type: p.product_type,
      priceFrom: p.variants[0]?.price
        ? `$${p.variants[0].price}`
        : 'See website',
      variants: p.variants.slice(0, 5).map((v) => v.title),
      imageUrl: p.images[0]?.src || null,
      tags: p.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }));

    return {
      found: mapped.length > 0,
      products: mapped,
      totalFound: mapped.length,
    };
  } catch (err) {
    console.error('[Shopify] searchCatalog error:', err);
    return {
      found: false,
      products: [],
      totalFound: 0,
    };
  }
}
