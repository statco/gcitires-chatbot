# GCI Tires — TireBot Bilingual Chatbot

Production-ready bilingual (English/French) AI customer service chatbot for [gcitires.com](https://gcitires.com), powered by Claude claude-sonnet-4-6, deployed on Vercel, embedded in Shopify.

---

## Complete File Tree

```
gcitires-chatbot/
├── widget/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWidget.tsx        # Main floating widget shell + FAB
│   │   │   ├── ChatWindow.tsx        # Expandable chat panel
│   │   │   ├── MessageBubble.tsx     # Individual message display (markdown)
│   │   │   ├── TypingIndicator.tsx   # Animated "TireBot is typing..."
│   │   │   └── QuickReplies.tsx      # Suggested action chips
│   │   ├── hooks/
│   │   │   ├── useChat.ts            # Chat state + streaming + sessionStorage
│   │   │   ├── useCustomer.ts        # Shopify customer session detection
│   │   │   └── useLanguage.ts        # Language detection + switching
│   │   ├── lib/
│   │   │   └── api.ts                # SSE streaming client + API helpers
│   │   ├── styles/
│   │   │   └── widget.css            # Scoped CSS (no Tailwind, dark mode ready)
│   │   ├── main.tsx                  # Widget mount entry point (IIFE)
│   │   └── types.ts                  # Shared TypeScript interfaces + i18n strings
│   ├── vite.config.ts                # IIFE build config (single self-contained bundle)
│   ├── tsconfig.json
│   └── package.json
├── api/
│   ├── chat.ts                       # Main chat endpoint — Claude streaming + tools
│   ├── order.ts                      # Shopify order lookup
│   ├── memory.ts                     # Airtable customer memory CRUD
│   └── detect-language.ts            # Language detection (franc-min + heuristic)
├── lib/
│   ├── anthropic.ts                  # Claude client + streaming loop with tool calls
│   ├── shopify.ts                    # Shopify Admin API: orders + catalog search
│   ├── airtable.ts                   # Airtable client with TTL cache + rate-limit handling
│   └── prompts.ts                    # TireBot system prompts (EN + FR) + Claude tools
├── shopify/
│   └── tirebot-snippet.liquid        # Copy-paste snippet for theme.liquid
├── .env.example
├── vercel.json
└── package.json
```

---

## Deployment Instructions

### 1. Prerequisites

- Node.js 18+
- A [Vercel](https://vercel.com) account
- An [Airtable](https://airtable.com) account
- Shopify store admin access

---

### 2. Airtable Setup

1. Create a new Airtable base named **GCI Tires Chatbot**
2. Create table: **Customers**

   | Field name | Field type |
   |---|---|
   | `customer_id` | Single line text (primary) |
   | `email` | Email |
   | `name` | Single line text |
   | `language_preference` | Single select: `EN`, `FR` |
   | `vehicle_info` | Long text |
   | `tire_preferences` | Long text |
   | `last_seen` | Date |
   | `total_sessions` | Number |

3. Create table: **Conversations**

   | Field name | Field type |
   |---|---|
   | `session_id` | Single line text (primary) |
   | `customer_id` | Single line text |
   | `messages` | Long text |
   | `language` | Single select: `EN`, `FR` |
   | `resolved` | Checkbox |
   | `created_at` | Date |
   | `updated_at` | Date |

4. Create a Personal Access Token at https://airtable.com/create/tokens with scopes:
   - `data.records:read`
   - `data.records:write`
5. Copy your **Base ID** from the Airtable URL: `https://airtable.com/appXXXXXXXXX/...`

---

### 3. Vercel Backend Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Install root dependencies
cd gcitires-chatbot
npm install

# Link to Vercel project
vercel link

# Set all environment variables
vercel env add ANTHROPIC_API_KEY
vercel env add SHOPIFY_STORE_DOMAIN        # gcitires.myshopify.com
vercel env add SHOPIFY_ADMIN_API_TOKEN     # shpat_...
vercel env add SHOPIFY_API_VERSION         # 2024-01
vercel env add AIRTABLE_API_KEY            # pat...
vercel env add AIRTABLE_BASE_ID            # appXXXXXXXX
vercel env add AIRTABLE_CUSTOMERS_TABLE    # Customers
vercel env add AIRTABLE_CONVERSATIONS_TABLE # Conversations
vercel env add WIDGET_ALLOWED_ORIGINS      # https://gcitires.com

# Deploy to production
vercel --prod
```

Your API will be at: `https://gcitires-chatbot.vercel.app`

---

### 4. Widget Build

```bash
cd widget
npm install
npm run build
```

Output: `widget/dist/tirebot-widget.iife.js` — self-contained, single-file bundle.

**Deploy the bundle:** Place `tirebot-widget.iife.js` in a `public/` directory at the repo root. Vercel will serve it at `https://your-vercel-url.vercel.app/tirebot-widget.iife.js`.

---

### 5. Shopify Theme Injection

**Option A — Liquid snippet (recommended):**

1. Shopify Admin → Online Store → Themes → **Edit code**
2. Under **Snippets** → **Add a new snippet** → name it `tirebot-snippet`
3. Paste the contents of `shopify/tirebot-snippet.liquid`
4. Replace `YOUR_VERCEL_DEPLOYMENT_URL` with your actual Vercel URL
5. Open `layout/theme.liquid`
6. Add just before `</body>`:
   ```liquid
   {% render 'tirebot-snippet' %}
   ```
7. **Save**

**Option B — Direct inline script tag:**

Add this block just before `</body>` in `layout/theme.liquid`:

```html
<script>
  window.GCICustomer = {
    id: "{{ customer.id | escape }}",
    email: "{{ customer.email | escape }}",
    name: "{{ customer.first_name | escape }}",
    isLoggedIn: {{ customer != blank }}
  };
</script>
<script
  src="https://YOUR_VERCEL_DEPLOYMENT_URL/tirebot-widget.iife.js"
  defer
  crossorigin="anonymous"
  data-api-endpoint="https://YOUR_VERCEL_DEPLOYMENT_URL"
  data-store-domain="{{ shop.permanent_domain | escape }}"
></script>
```

---

## Test Checklist

### Backend API Tests

- [ ] `POST /api/detect-language` `{"text":"bonjour"}` → `{"language":"FR"}`
- [ ] `POST /api/detect-language` `{"text":"hello"}` → `{"language":"EN"}`
- [ ] `POST /api/chat` with a test message → streams SSE `{"type":"text","content":"..."}`
- [ ] `POST /api/chat` "track order #1234" → Claude calls `lookup_order` tool
- [ ] `POST /api/order` with valid order number + email → returns order data
- [ ] `POST /api/memory` `{"action":"upsert_customer",...}` → creates Airtable record
- [ ] `GET /api/memory?action=customer&customerId=xxx` → returns customer data
- [ ] CORS: requests from non-gcitires.com origin → rejected

### Widget UI Tests

- [ ] FAB button appears bottom-right in GCI red (#C0392B)
- [ ] Click FAB → chat window opens with smooth animation (380×580px desktop)
- [ ] Welcome message appears in English by default
- [ ] Click "FR" button → all UI strings switch to French
- [ ] Type in French ("Bonjour") → language auto-detected, Claude responds in French
- [ ] Type a message → 3-dot typing indicator appears while Claude responds
- [ ] Claude's response streams word-by-word in real time
- [ ] Quick reply chips appear below TireBot messages; clicking one sends the message
- [ ] Ask "track my order" → Claude asks for order number and email
- [ ] Minimize button → chat window closes, FAB reappears
- [ ] Navigate between Shopify pages → chat history persists (sessionStorage)
- [ ] Mobile (<480px) → widget expands full-screen

### Integration Tests

- [ ] Logged-in customer → `window.GCICustomer.isLoggedIn === true`
- [ ] Guest user → UUID generated and stored in localStorage
- [ ] New conversation → Airtable Customers + Conversations records created
- [ ] Returning customer → previous session summary injected into Claude's context
- [ ] Bundle size: `gzip -c tirebot-widget.iife.js | wc -c` < 153600 (150KB)

---

## Environment Variables Reference

| Variable | Description | Example |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key | `sk-ant-...` |
| `SHOPIFY_STORE_DOMAIN` | Shopify myshopify domain | `gcitires.myshopify.com` |
| `SHOPIFY_ADMIN_API_TOKEN` | Shopify Admin API token | `shpat_...` |
| `SHOPIFY_API_VERSION` | Shopify API version | `2024-01` |
| `AIRTABLE_API_KEY` | Airtable Personal Access Token | `pat...` |
| `AIRTABLE_BASE_ID` | Airtable base identifier | `appXXXXXXXX` |
| `AIRTABLE_CUSTOMERS_TABLE` | Customers table name | `Customers` |
| `AIRTABLE_CONVERSATIONS_TABLE` | Conversations table name | `Conversations` |
| `WIDGET_ALLOWED_ORIGINS` | Comma-separated allowed origins | `https://gcitires.com` |
