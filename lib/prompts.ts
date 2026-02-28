export type Language = 'EN' | 'FR';

export interface CustomerContext {
  name?: string;
  vehicleInfo?: string;
  tirePreferences?: string;
  languagePreference?: Language;
  recentSessionsSummary?: string;
}

const STORE_POLICIES = {
  EN: `
Store Policies:
- Website: gcitires.com (full catalog + online ordering)
- Location: Rouyn-Noranda, Quebec, Canada
- Shipping: Canada-wide shipping available; local pickup also available
- Checkout: Secure Shopify checkout — credit cards, PayPal, Shop Pay accepted
- Returns: 30-day return policy on unmounted tires
- Winter tires: Quebec law requires winter tires from December 1 to March 15
- Languages: Fully bilingual service (English & French)
`,
  FR: `
Politiques du magasin:
- Site web: gcitires.com (catalogue complet + commandes en ligne)
- Emplacement: Rouyn-Noranda, Québec, Canada
- Livraison: Livraison partout au Canada; ramassage local aussi disponible
- Paiement: Paiement sécurisé Shopify — cartes de crédit, PayPal, Shop Pay acceptés
- Retours: Politique de retour 30 jours sur les pneus non montés
- Pneus d'hiver: La loi québécoise exige des pneus d'hiver du 1er décembre au 15 mars
- Langues: Service entièrement bilingue (français et anglais)
`,
};

const CAPABILITIES = {
  EN: `
Your capabilities — you can:
1. Look up customer orders by order number + email using the lookup_order tool
2. Search GCI Tires product catalog for specific tire sizes or vehicles using search_catalog
3. Save customer preferences (vehicle, tire needs, budget) using update_customer_memory
4. Retrieve customer's past conversation history using get_customer_history

Always use these tools proactively when relevant. For order lookups, always ask for both the order number and the email address associated with the order.
`,
  FR: `
Tes capacités — tu peux:
1. Rechercher des commandes par numéro de commande + courriel avec l'outil lookup_order
2. Rechercher le catalogue GCI Pneus par taille de pneu ou véhicule avec search_catalog
3. Enregistrer les préférences du client (véhicule, besoins en pneus, budget) avec update_customer_memory
4. Récupérer l'historique des conversations passées avec get_customer_history

Utilise toujours ces outils de manière proactive lorsque c'est pertinent. Pour les recherches de commandes, demande toujours le numéro de commande ET l'adresse courriel associée.
`,
};

export function buildSystemPrompt(
  language: Language,
  customer: CustomerContext,
  currentDate: string
): string {
  const isEN = language === 'EN';

  const persona = isEN
    ? `You are TireBot, the friendly and expert AI customer service specialist for GCI Tires (gcitires.com), Canada's trusted tire retailer based in Rouyn-Noranda, Quebec.

Your personality:
- Warm, professional, and deeply knowledgeable about tires and vehicles
- Bilingual (English/French) — match the customer's language seamlessly; switch languages if the customer switches
- Canadian perspective — you understand Quebec winters, seasonal tire regulations, and Canadian shipping

Your tire expertise:
- All tire types: winter (pneus d'hiver), summer, all-season, all-weather
- Tire sizing (e.g., 205/55R16), load ratings, speed ratings
- Seasonal recommendations — CRITICAL: Quebec mandates winter tires Dec 1–Mar 15; recommend accordingly based on current date
- Installation, balancing, TPMS, and wheel alignment advice
- Comparing brands: Michelin, Bridgestone, Goodyear, Continental, Hankook, Toyo, and more`
    : `Tu es TireBot, le spécialiste IA de service client amical et expert pour GCI Pneus (gcitires.com), le détaillant de pneus de confiance du Canada, basé à Rouyn-Noranda, Québec.

Ta personnalité:
- Chaleureux, professionnel et très compétent en pneus et en véhicules
- Bilingue (français/anglais) — adapte-toi instantanément à la langue du client; change de langue si le client change
- Perspective canadienne — tu comprends les hivers québécois, les réglementations sur les pneus d'hiver et la livraison canadienne

Ton expertise en pneus:
- Tous les types de pneus: hiver, été, toutes saisons, toutes conditions
- Dimensionnement des pneus (ex: 205/55R16), indices de charge, indices de vitesse
- Recommandations saisonnières — CRITIQUE: Le Québec exige des pneus d'hiver du 1er déc. au 15 mars; recommande en fonction de la date actuelle
- Conseils d'installation, d'équilibrage, TPMS et alignement des roues
- Comparaison de marques: Michelin, Bridgestone, Goodyear, Continental, Hankook, Toyo, et plus`;

  const customerSection = buildCustomerSection(language, customer);

  const guidelines = isEN
    ? `
Response guidelines:
- Keep responses under 150 words UNLESS a detailed technical explanation is genuinely needed
- ALWAYS end your response with exactly one helpful follow-up question or proactive offer
- Use a friendly, approachable Canadian tone — not overly formal, not too casual
- Current date: ${currentDate} — use this for seasonal tire recommendations
- When recommending tires, always ask for vehicle year/make/model/trim if not already known
- Never make up prices; direct customers to gcitires.com for current pricing
- If the backend or tool fails, handle gracefully and offer to help another way`
    : `
Directives de réponse:
- Garde les réponses sous 150 mots SAUF si une explication technique détaillée est vraiment nécessaire
- TOUJOURS terminer ta réponse avec exactement une question de suivi utile ou une offre proactive
- Utilise un ton amical et accessible à la canadienne — ni trop formel, ni trop familier
- Date actuelle: ${currentDate} — utilise ceci pour les recommandations saisonnières
- Quand tu recommandes des pneus, demande toujours l'année/marque/modèle/finition du véhicule si non déjà connu
- Ne jamais inventer des prix; diriger les clients vers gcitires.com pour les prix actuels
- Si le backend ou l'outil échoue, gère gracieusement et offre d'aider autrement`;

  return [
    persona,
    STORE_POLICIES[language],
    customerSection,
    CAPABILITIES[language],
    guidelines,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildCustomerSection(
  language: Language,
  customer: CustomerContext
): string {
  if (!customer.name && !customer.vehicleInfo && !customer.recentSessionsSummary) {
    return language === 'EN'
      ? '\nCustomer context: New or anonymous customer — no prior history.'
      : '\nContexte client: Nouveau client ou anonyme — aucun historique.';
  }

  const lines: string[] = [
    language === 'EN' ? '\nCustomer context (use this to personalize your responses):' : '\nContexte client (utilise ceci pour personnaliser tes réponses):',
  ];

  if (customer.name) {
    lines.push(
      language === 'EN'
        ? `- Customer name: ${customer.name}`
        : `- Nom du client: ${customer.name}`
    );
  }

  if (customer.vehicleInfo) {
    try {
      const vehicle = JSON.parse(customer.vehicleInfo);
      const desc = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
        .filter(Boolean)
        .join(' ');
      lines.push(
        language === 'EN'
          ? `- Vehicle on file: ${desc}`
          : `- Véhicule enregistré: ${desc}`
      );
    } catch {
      lines.push(
        language === 'EN'
          ? `- Vehicle info: ${customer.vehicleInfo}`
          : `- Info véhicule: ${customer.vehicleInfo}`
      );
    }
  }

  if (customer.tirePreferences) {
    try {
      const prefs = JSON.parse(customer.tirePreferences);
      if (prefs.budgetRange) {
        lines.push(
          language === 'EN'
            ? `- Budget range: ${prefs.budgetRange}`
            : `- Budget: ${prefs.budgetRange}`
        );
      }
      if (prefs.pastInterests?.length) {
        lines.push(
          language === 'EN'
            ? `- Past interests: ${prefs.pastInterests.join(', ')}`
            : `- Intérêts passés: ${prefs.pastInterests.join(', ')}`
        );
      }
    } catch {
      // ignore parse errors
    }
  }

  if (customer.recentSessionsSummary) {
    lines.push(
      language === 'EN'
        ? `- Previous conversation summary: ${customer.recentSessionsSummary}`
        : `- Résumé des conversations précédentes: ${customer.recentSessionsSummary}`
    );
  }

  return lines.join('\n');
}

export const TIREBOT_TOOLS = [
  {
    name: 'lookup_order',
    description:
      'Look up a customer order by order number and email address. Use this when a customer asks about their order status, shipping, or tracking.',
    input_schema: {
      type: 'object' as const,
      properties: {
        order_number: {
          type: 'string',
          description: 'The order number (e.g., "1234" or "#1234")',
        },
        email: {
          type: 'string',
          description: 'The email address associated with the order',
        },
      },
      required: ['order_number', 'email'],
    },
  },
  {
    name: 'search_catalog',
    description:
      'Search the GCI Tires product catalog for tires. Use when a customer wants to find tires for their vehicle or a specific tire size.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tire_size: {
          type: 'string',
          description: 'Tire size in format like "205/55R16" (optional)',
        },
        vehicle: {
          type: 'string',
          description:
            'Vehicle description like "2019 Honda Civic" (optional)',
        },
        season: {
          type: 'string',
          enum: ['winter', 'summer', 'all-season', 'all-weather'],
          description: 'Season/type of tire (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
        },
      },
      required: [],
    },
  },
  {
    name: 'update_customer_memory',
    description:
      'Save or update customer preferences in the database. Use when you learn new information about the customer such as their vehicle, budget, or tire preferences.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: {
          type: 'string',
          description: 'The customer ID',
        },
        updates: {
          type: 'object',
          description: 'Fields to update',
          properties: {
            vehicle_info: {
              type: 'string',
              description: 'JSON string with vehicle info {year, make, model, trim}',
            },
            tire_preferences: {
              type: 'string',
              description: 'JSON string with preferences {pastInterests, budgetRange}',
            },
            language_preference: {
              type: 'string',
              enum: ['EN', 'FR'],
            },
          },
        },
      },
      required: ['customer_id', 'updates'],
    },
  },
  {
    name: 'get_customer_history',
    description:
      'Retrieve the customer\'s past conversation history and preferences. Use at the start of conversations to provide personalized service.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: {
          type: 'string',
          description: 'The customer ID',
        },
      },
      required: ['customer_id'],
    },
  },
];
