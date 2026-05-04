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

// All brands stocked at GCI Tires — used to normalise brand search queries
const GCI_BRANDS = [
  'Cooper', 'Falken', 'GT Radial', 'Kelly', 'Kenda', 'Maxtrek',
  'Michelin', 'Minerva', 'Nexen', 'Nitto', 'Ovation', 'Pirelli',
  'Starfire', 'Toyo', 'Transeagle', 'Vredestein',
];

/** Normalise a user-supplied brand string to a known GCI brand, or return as-is */
function normaliseBrand(raw: string): string {
  const cleaned = raw.trim();
  const found = GCI_BRANDS.find(
    (b) => b.toLowerCase() === cleaned.toLowerCase()
  );
  return found ?? cleaned;
}

export async function searchCatalog(params: {
  tire_size?: string;
  vehicle?: string;
  brand?: string;
  season?: string;
  limit?: number;
}): Promise<CatalogSearchResult> {
  const { tire_size, vehicle, brand, season, limit = 6 } = params;

  // ── Storefront GraphQL ────────────────────────────────────────────────────
  const STOREFRONT_URL = `https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`;

  // Fetch up to 250 per page and paginate so we never miss products
  const STOREFRONT_QUERY = `
    query SearchTires($q: String!, $after: String) {
      products(first: 250, query: $q, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id title handle tags
            images(first: 1) { edges { node { url } } }
            variants(first: 1) {
              edges {
                node {
                  id
                  priceV2 { amount }
                  availableForSale
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    // ── Build Storefront search query ────────────────────────────────────────
    // Priority: tire_size > brand > vehicle
    // Brand searches use Shopify's `vendor:` prefix for exact matching.
    // Size searches use full-text (most accurate for SKU-style strings).
    // Combined brand+size: run both and intersect client-side.
    let primaryQuery = '';
    let brandFilter: string | null = null;

    if (tire_size && brand) {
      // Both supplied — search by size, filter by vendor client-side
      primaryQuery = tire_size.trim();
      brandFilter = normaliseBrand(brand);
    } else if (tire_size) {
      primaryQuery = tire_size.trim();
    } else if (brand) {
      // Brand-only search — use Shopify vendor: operator for precision
      brandFilter = normaliseBrand(brand);
      primaryQuery = `vendor:"${brandFilter}"`;
    } else if (vehicle) {
      // Vehicle-only: strip to first 3 tokens (year make model)
      primaryQuery = vehicle.trim().split(' ').slice(0, 3).join(' ');
    }

    if (!primaryQuery) {
      return { found: false, products: [], totalFound: 0 };
    }

    // ── Paginated fetch ──────────────────────────────────────────────────────
    type GQLEdge = {
      node: {
        id: string;
        title: string;
        handle: string;
        tags: string[];
        images: { edges: Array<{ node: { url: string } }> };
        variants: { edges: Array<{ node: { id: string; priceV2: { amount: string }; availableForSale: boolean } }> };
      };
    };

    let allEdges: GQLEdge[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    let pageNum = 0;

    while (hasNextPage) {
      pageNum++;
      const resp = await fetch(STOREFRONT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: STOREFRONT_QUERY,
          variables: { q: primaryQuery, after: cursor },
        }),
      });

      if (!resp.ok) {
        console.error('[searchCatalog] Storefront error', resp.status);
        break;
      }

      const json = (await resp.json()) as {
        data?: { products?: { pageInfo: { hasNextPage: boolean; endCursor: string }; edges: GQLEdge[] } };
        errors?: unknown[];
      };

      if (json.errors) {
        console.error('[searchCatalog] GraphQL errors:', json.errors);
        break;
      }

      const pageData = json.data?.products;
      if (!pageData) break;

      allEdges = allEdges.concat(pageData.edges);
      hasNextPage = pageData.pageInfo.hasNextPage;
      cursor = pageData.pageInfo.endCursor ?? null;

      console.log(`[searchCatalog] page ${pageNum}: ${pageData.edges.length} products (total: ${allEdges.length})`);

      // Safety cap — avoid runaway pagination on very broad queries
      if (allEdges.length >= 1000) break;
    }

    // ── Map to product format ────────────────────────────────────────────────
    let products = allEdges.map(({ node: p }) => {
      const variant  = p.variants.edges[0]?.node;
      const imageUrl = p.images.edges[0]?.node.url || null;
      const tagArr   = Array.isArray(p.tags) ? p.tags : [];
      const price    = variant?.priceV2.amount
        ? `$${parseFloat(variant.priceV2.amount).toFixed(2)}`
        : 'See website';

      return {
        title:    p.title,
        url:      `https://gcitires.com/products/${p.handle}`,
        type:     'Tires',
        priceFrom: price,
        inStock:  variant?.availableForSale ?? false,
        variants: [] as string[],
        imageUrl,
        tags:     tagArr,
      };
    });

    // ── Client-side vendor filter (when size+brand both supplied) ────────────
    if (brandFilter && tire_size) {
      const bl = brandFilter.toLowerCase();
      const brandFiltered = products.filter((p) =>
        p.title.toLowerCase().includes(bl)
      );
      if (brandFiltered.length > 0) products = brandFiltered;
    }

    // ── Season filter (client-side from tags) ────────────────────────────────
    if (season) {
      const seasonKeywords: Record<string, string[]> = {
        winter:       ['winter', 'hiver', 'wintrac', 'blizzak', 'hakkapeliitta', 'icepro', 'winguard', 'frostrack', '3pmsf'],
        summer:       ['summer', 'été', 'cobra-instinct', 'summer-tire', 'performance'],
        'all-season': ['all-season', 'toutes-saisons', 'all-weather', 'toutes-conditions', 'as', '4-season', 'quatrac', 'hypertrac'],
        'all-weather':['all-weather', 'toutes-conditions', '4-season', 'quatrac', 'hypertrac', 'all-season'],
      };
      const kws = seasonKeywords[season.toLowerCase()] ?? [season.toLowerCase()];

      const seasonFiltered = products.filter((p) => {
        const haystack = (p.title + ' ' + p.tags.join(' ')).toLowerCase();
        return kws.some((k) => haystack.includes(k));
      });

      // Only apply if it still returns results — else keep all
      if (seasonFiltered.length > 0) products = seasonFiltered;
    }

    // ── Deduplicate: keep best-priced entry per model name ───────────────────
    const seen = new Map<string, typeof products[0]>();
    for (const p of products) {
      const modelKey = p.title.replace(/\s+\d{3}\/\d{2}R\d{2}.*$/, '').trim();
      const existing = seen.get(modelKey);
      if (!existing || (p.inStock && !existing.inStock)) {
        seen.set(modelKey, p);
      }
    }
    const deduped = [...seen.values()].slice(0, limit);

    console.log(
      `[searchCatalog] q="${primaryQuery}" brand=${brandFilter ?? 'none'} season=${season ?? 'none'} → ${allEdges.length} raw, ${deduped.length} deduped`
    );

    return {
      found:      deduped.length > 0,
      products:   deduped,
      totalFound: deduped.length,
    };

  } catch (err) {
    console.error('[searchCatalog] unexpected error:', err);
    return { found: false, products: [], totalFound: 0 };
  }
}
