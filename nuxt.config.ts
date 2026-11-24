import { kanalen } from './app/data/kanalen'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/content', '@nuxtjs/seo', '@nuxt/image', '@nuxt/eslint'],

  css: ['~/assets/css/tokens.css', '~/assets/css/basis.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'nl' },
      // Adobe Fonts-kit (besluit 2026-11-05). Preconnect scheelt tijd bij het laden van het lettertype.
      // Het stylesheet van Adobe zelf staat in app/app.vue: het laadt niet-blokkerend en moet door Nuxt bijgehouden
      // worden (zie daar). Zonder JavaScript laadt het gewoon via <noscript>.
      link: [
        { rel: 'preconnect', href: 'https://use.typekit.net', crossorigin: 'anonymous' },
        { rel: 'preconnect', href: 'https://p.typekit.net', crossorigin: 'anonymous' },
        { rel: 'icon', type: 'image/webp', href: '/favicon.webp' },
      ],
      noscript: [
        { innerHTML: '<link rel="stylesheet" href="https://use.typekit.net/bxn6xtn.css">' },
      ],
    },
  },

  // Gegevens voor @nuxtjs/seo: canonieke URL's, sitemap, schema.org
  site: {
    url: 'https://mariellemadern.nl',
    name: 'Mariëlle Madern',
    description:
      'Nederlandstalige christelijke aanbiddingsmuziek van Mariëlle Madern, door oprechte en authentieke aanbidding.',
    // Met regio, zodat ook og:locale (nl_NL) wordt gezet
    defaultLocale: 'nl-NL',
    // De huidige URL's eindigen op een slash en dat blijft zo (besluit 2026-11-05)
    trailingSlash: true,
  },

  // Schema.org: wie er achter de site zit. Alleen naam, adres van de site en de kanalen; geen persoonlijke
  // gegevens (leeftijd, gezin) en geen foto zolang de eigenaar die niet heeft gekozen.
  schemaOrg: {
    identity: {
      type: 'Person',
      name: 'Mariëlle Madern',
      sameAs: kanalen.map((k) => k.link),
    },
  },

  content: {
    // Tijdens het bouwen gebruikt Content SQLite. De ingebouwde node:sqlite (Node 22.5 of nieuwer)
    // scheelt een extra pakket met een native onderdeel.
    experimental: { sqliteConnector: 'native' },
  },

  // Deelafbeeldingen maken we later (fase 6), eerst zonder
  ogImage: { enabled: false },

  image: {
    // Eigen provider: verwijst naar vooraf gemaakte bestanden (scripts/afbeeldingen.mjs).
    provider: 'statisch',
    providers: {
      statisch: { provider: '~/providers/statisch' },
    },
  },

  hooks: {
    // Het bladmuziekformulier en het contactformulier zijn aparte stukjes code (Lazy-componenten) die alleen op een
    // pagina mét formulier worden geladen. Zonder dit zet Nuxt er op elke nummerpagina (of vaste pagina) een prefetch
    // voor, en dan downloadt de browser ze toch op pagina's zonder formulier.
    'build:manifest': (manifest) => {
      for (const [sleutel, bestand] of Object.entries(manifest)) {
        if (sleutel.includes('BladmuziekFormulier') || sleutel.includes('ContactFormulier')) {
          bestand.prefetch = false
          bestand.preload = false
        }
      }
    },
  },

  runtimeConfig: {
    public: {
      // Sitesleutel van de Turnstile-widget van de eigenaar (publiek, geen geheim; de geheime sleutel staat alleen
      // als secret TURNSTILE_SECRET in Cloudflare). Voor een proefbouw: NUXT_PUBLIC_TURNSTILE_SITEKEY.
      turnstileSitekey: '0x4AAAAAAGJIAhDl4maVZzwv',
    },
  },

  // Niet gevraagd: llms.txt en Markdown-kopieën van elke pagina. Staat uit, kan later aan.
  aiReady: false,

  // Bewaart oude bestanden van eerdere versies voor bezoekers met een oude pagina. Bij statische
  // bestanden op Cloudflare is dat niet nodig, en het nam bestanden van testbouwen mee.
  skewProtection: false,

  // Alles wordt bij het bouwen vooraf gemaakt (`pnpm generate`) en als statische bestanden
  // uitgerold op Cloudflare. Er draait geen server en geen database (besluit fase 4).
  nitro: {
    // Altijd statisch, ook in de bouwomgeving van Cloudflare (Workers Builds). Zonder dit kiest Nitro
    // daar zelf het preset `cloudflare-module`, met een servermap, een D1-database, een doorverwijzing
    // naar een andere wrangler-config (`.wrangler/deploy/config.json`) en een aangepast `_headers`.
    preset: 'static',
    // 404.html is de pagina die Cloudflare toont bij een onbekend adres. Nuxt maakt die als leeg schil (de foutpagina
    // verschijnt pas na het laden van de scripts), zonder titel en zonder kop in de HTML. Hier komen een titel en een
    // korte tekst met kop in het schil; Nuxt vervangt ze bij het laden door de echte foutpagina (app/error.vue). De kale
    // versie krijgt wat ruimte (2rem boven, 1,25rem opzij, hoogstens 37,5rem breed) voor wie de scripts niet laadt.
    hooks: {
      'prerender:generate'(route) {
        if (route.route !== '/404.html' || typeof route.contents !== 'string') return
        route.contents = route.contents
          .replace('<head>', '<head><title>Pagina niet gevonden - Mariëlle Madern</title>')
          .replace(
            '<div id="__nuxt"></div>',
            '<div id="__nuxt"><main id="inhoud" style="max-inline-size:37.5rem;margin-inline:auto;padding:2rem 1.25rem 0"><h1>Pagina niet gevonden</h1><p>Deze pagina bestaat niet (meer). Misschien is het adres veranderd of is er een typfout gemaakt.</p><p><a href="/">Naar de homepage</a></p></main></div>',
          )
      },
    },
    prerender: {
      crawlLinks: true,
      // /bestel-de-ep/ staat nergens in het menu en wordt dus niet vanzelf gevonden
      routes: ['/', '/bestel-de-ep/'],
    },
  },
})
