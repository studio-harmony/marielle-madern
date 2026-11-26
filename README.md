# Website Mariëlle Madern

Broncode van [mariellemadern.nl](https://mariellemadern.nl). Gebouwd met Nuxt (Vue), Nuxt Content, Nuxt SEO en Nuxt Image. De site wordt bij het bouwen helemaal vooraf gemaakt en als statische bestanden uitgerold op Cloudflare Workers. Er draait geen server en geen database.

Het plan, de besluiten en de huisstijl staan in de map `documenten/` naast deze map, niet in deze repository.

## Aan de slag

Je hebt Node 22.5 of nieuwer nodig (Node 24 wordt gebruikt) en pnpm.

```bash
pnpm install
```

| Opdracht          | Wat het doet                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev`        | Ontwikkelserver op http://localhost:3000                                                          |
| `pnpm generate`   | Bouwt de hele site naar `.output/public`                                                          |
| `pnpm preview`    | Draait het resultaat van `pnpm generate` lokaal in de Cloudflare-omgeving (http://localhost:8787) |
| `pnpm run deploy` | Bouwt en rolt uit naar Cloudflare (eerst `pnpm exec wrangler login`)                              |
| `pnpm controle`   | Controleert `content/`, ook op een open TE BEVESTIGEN (draait ook bij `pnpm generate`)            |
| `pnpm lettertype` | Maakt de WOFF2-subset van Atlantis opnieuw (vraagt het bron-TTF als argument)                     |
| `pnpm lint`       | Controleert de code, inclusief toegankelijkheidsregels voor templates                             |
| `pnpm format`     | Zet de code in de afgesproken opmaak                                                              |
| `pnpm typecheck`  | Controleert de types                                                                              |

Let op: gebruik `pnpm run deploy`. Zonder `run` start pnpm zijn eigen, ingebouwde commando `deploy` (voor workspaces) en niet ons script.

## Indeling

```
app/                  pagina's, componenten en stijl
  assets/css/         tokens.css (huisstijl) en basis.css
  bronafbeeldingen/   originele afbeeldingen (worden niet uitgerold)
  providers/          eigen afbeeldingsprovider voor Nuxt Image
content/              alle inhoud als Markdown
  nummers/            een bestand per nummer: /over-de-muziek/{bestandsnaam}/
  paginas/            vaste pagina's: over-mij, contact, bestel-de-ep, privacy
public/               bestanden die ongewijzigd worden uitgerold
  _headers            beveiligings- en cacheheaders voor Cloudflare. /video/ wordt een week gecachet: een nieuwe of bijgewerkte
                      video krijgt daarom altijd een nieuwe bestandsnaam. Logo's, icoon, favicon en illustraties: een dag.
  _redirects          redirects van de oude WordPress-site
  afbeeldingen/       wordt gemaakt door pnpm afbeeldingen (niet in git)
worker/                     de kleine Worker voor /api/* (bladmuziek per e-mail en het contactformulier), met tests (pnpm test:worker)
scripts/bladmuziek-lijst.mjs  maakt worker/bladmuziek.json: de nummers met `bladmuziek: true`
scripts/afbeeldingen.mjs   maakt de WebP-formaten van app/bronafbeeldingen
scripts/og/  maakt (pnpm og) en controleert (pnpm og:check) de deelafbeeldingen (og:image, 1200 x 630) in public/afbeeldingen/og; welke hoezen erop mogen staat in scripts/deelafbeeldingen-toegestaan.json
scripts/controle-uitvoer.mjs  controleert de gebouwde pagina's (canonical, og- en twitter-tags, deelafbeeldingen, hero-poster), draait aan het eind van pnpm generate
content.config.ts     de velden van nummers en pagina's
wrangler.jsonc        Cloudflare-instellingen
```

## Lokaal bekijken zoals op Cloudflare

```bash
pnpm generate && pnpm preview
```

De site staat dan op http://localhost:8787 (bij `wrangler dev --port 8799` op 8799). Het handschrift boven de kop bekijk je met `?handschrift=boven` achter het adres.

## Werken met branches en uitrollen

Vanaf 2026-11-16 gaat elke wijziging via een branch en een pull request (PR) op GitHub. Zodra de repository in Cloudflare is gekoppeld (Workers Builds), bouwt en rolt Cloudflare automatisch uit:

- Een branch of PR krijgt een eigen preview (`wrangler preview`, vernoemd naar de branch). Het adres staat bij de check "Workers Builds" op de PR en in Cloudflare onder Previews. Dit adres is publiek.
- Cloudflare bouwt alleen branches die in deze repository staan. Een PR vanaf de fork van het bot-account (`studio-harmony`) krijgt daarom een preview via de workflow `.github/workflows/preview-bot-pr.yml`: die zet de PR, samengevoegd met de laatste `main`, als `preview/pr-<nummer>` in deze repository en plaatst het adres in een reactie op de PR. De branch verdwijnt als de PR sluit. Opnieuw zetten kan met de hand onder Actions, _Preview bot-PR_.
- Een samenvoeging in `main` rolt uit naar https://mariellemadern.mmadern.workers.dev, en na de livegang naar mariellemadern.nl.
- Handmatig uitrollen kan nog steeds met `pnpm run deploy`.

Instellingen in Cloudflare: branch `main`, bouwcommando `pnpm run build`, deploycommando `npx wrangler deploy`. De pnpm-versie staat vast in `package.json` (`packageManager`) en de Node-versie in `.node-version`, zodat Cloudflare hetzelfde gebruikt als wij.

## Een nummer toevoegen

1. Zet de cover (vierkant, bij voorkeur 1280 px) in `app/bronafbeeldingen/covers/` en het voorbeeldbeeld van de video (16:9, 1280 px breed) in `app/bronafbeeldingen/videos/`, beide als `.webp`, `.jpg` of `.png` met de bestandsnaam van het nummer.
2. Kopieer een bestaand bestand in `content/nummers/` en pas de velden aan. De velden staan in `content.config.ts`.
3. Zet titel en description **altijd tussen dubbele aanhalingstekens**. Een dubbele punt zonder aanhalingstekens breekt het kopblok.
4. Draai `pnpm controle` en controleer met `pnpm dev`. Voeg het nummer toe aan `videolijst` in `content/home.yml` als het op de homepage moet staan.
5. Geef elk nummer een `kaartregel`: één korte regel voor de kaart op de homepage. Is er een Apple Music-link naar het nummer zelf, zet die dan in `appleMusic` (volledige link). Zonder dat veld gaat de knop naar de artiestpagina. Het nummer in de grote speler bij het laden staat in `uitgelicht` in `content/home.yml` (moet in `videolijst` staan).

## Deelafbeeldingen

Elke pagina en elk nummer heeft een eigen afbeelding voor het delen van een link (`og:image` en `twitter:image`, 1200 x 630, JPG). Ze staan in git in `public/afbeeldingen/og/`, samen met `manifest.json`, en worden **niet** bij de bouw gemaakt: de bouw controleert alleen (`pnpm og:check`, zonder netwerk) of ze nog kloppen met de titel, de kleur, de hoes, het logo, het blaadje, de takken, het lettertype en het sjabloon.

- **Veranderd of nieuw?** Een nieuwe pagina in `content/paginas/`, een nieuw nummer, een andere titel of kleur: draai `pnpm og` (alles) of `pnpm og -- over-mij` (één afbeelding, naam van de pagina of het nummer) en commit `public/afbeeldingen/og/`. Zonder dat faalt de bouw met de naam van de afbeelding die niet meer klopt.
- **Sjabloon:** `scripts/og/maak.mjs` (opmaak van de Designer in `design/deelafbeeldingen.md`), techniek satori en sharp, lettertype Mukta 400 (SIL Open Font License 1.1, `@fontsource/mukta`). Verander je de opmaak, verhoog dan `SJABLOON_VERSIE` in `scripts/og/data.mjs`.
- **Hoezen:** alleen nummers op de lijst in `scripts/deelafbeeldingen-toegestaan.json` krijgen hun hoes op de afbeelding; een nieuw nummer krijgt het logo, tot de eigenaar akkoord geeft. De bouw faalt als een afbeelding een hoes gebruikt die niet op de lijst staat. Een titel die op meer dan twee regels komt laat `pnpm og` falen.

## Bladmuziek per e-mail (staat uit)

Een nummer met `bladmuziek: true` in zijn bestand in `content/nummers/` krijgt (vanaf deel 2) een formulier om de bladmuziek per e-mail te vragen; `POST /api/bladmuziek` (`worker/`) stuurt de pdf via Resend. De pdf's staan **niet in deze repo** maar privé in Cloudflare R2, als `bladmuziek/<bestandsnaam van het nummer>.pdf` (bijvoorbeeld `bladmuziek/hart-van-glas.pdf`). Naam en adres worden niet gelogd; als back-up staan ze 30 dagen in een database en daarna zijn ze anoniem (zie "Opslag van berichten (D1)").

De feature werkt pas als de eigenaar dit in Cloudflare heeft ingesteld (het team doet dat niet en zet nooit een sleutel in de repo, een PR of een chat); zolang een van deze ontbreekt, geeft `/api/bladmuziek` `503` en doet niets:

- **Klaar:**
  - **R2-bucket `marielle-madern`** met een map `bladmuziek` (door de eigenaar aangemaakt) en de binding `BLADMUZIEK` in `wrangler.jsonc`. De pdf's staan als `bladmuziek/<bestandsnaam van het nummer>.pdf` (bijvoorbeeld `bladmuziek/hart-van-glas.pdf`); de Worker leest alleen en schrijft nooit. Preview-bouwen binden dezelfde bucket (alleen lezen), maar de Worker doet alleen iets op `mariellemadern.nl` en `www.mariellemadern.nl` (zie "Welke adressen" hieronder): op een preview-adres of het gewone workers.dev-adres geeft `/api/bladmuziek` `403`.
  - De limieten (zie hieronder).
- **Nog open (de eigenaar, in Cloudflare en Resend; het team doet dat niet en zet nooit een sleutel in de repo, een PR of een chat):**
  - **Resend:** een account, het domein mariellemadern.nl toevoegen met SPF en DKIM in orde, en een API-sleutel met alleen verzendrechten.
  - **Turnstile-widget** (Cloudflare, Turnstile): actie `bladmuziek` (`data-action`), toegestane adressen: alleen `mariellemadern.nl` en `www.mariellemadern.nl`. **Zet de preview-adressen (`*.mmadern.workers.dev`) niet in de widget.** De sitesleutel is publiek en komt in de repo (deel 2); de geheime sleutel nooit.
  - **Twee secrets** (Cloudflare, Worker `mariellemadern`, Instellingen, Variabelen en secrets): `RESEND_API_KEY` en `TURNSTILE_SECRET`. Zolang een van beide ontbreekt, geeft `/api/bladmuziek` `503` en doet niets.
  - **Een pdf per nummer** in de map `bladmuziek` en `bladmuziek: true` bij dat nummer in `content/nummers/` (pas daarna verschijnt het formulier).
- **Limieten:** de bindingen `LIMIET_IP` (3 per minuut per IP-adres), `LIMIET_ADRES` (1 per minuut per e-mailadres) en `LIMIET_ALGEMEEN` (10 per minuut voor de hele site) staan al in `wrangler.jsonc`; er is niets voor in te stellen. De sleutel van de limiet is een HMAC van het IP-adres of e-mailadres; de binding houdt alleen een teller in het geheugen bij, er wordt niets bewaard of gelogd.
- **Turnstile-widget:** moet de actie `bladmuziek` meegeven (`data-action`); de Worker weigert een token dat niet voor de eigen hostname en die actie is uitgegeven. Zet in de widget alleen het echte domein en `www`, geen preview-adressen.
- **Welke adressen:** de Worker accepteert alleen verzoeken voor de hostnamen in `TOEGESTANE_HOSTS` in `worker/bladmuziek.mjs` (standaard `mariellemadern.nl` en `www.mariellemadern.nl`, een code-constante); elke andere hostname, ook een preview en het gewone workers.dev-adres, krijgt `403` `adres_niet_toegestaan`, ook als de Turnstile-widget dat adres toestaat. De controle komt vóór de controle op de secrets. Zo kan een preview-bouw, die dezelfde bucket bindt, geen echte bladmuziek versturen, wat de eigenaar ook in Cloudflare instelt. Het formulier werkt dus pas op het echte domein: de eerste echte test kan pas als `mariellemadern.nl` naar deze site wijst (nu draait dat domein nog op WordPress).
- **Het hoofdadres van de Worker (besluit van de eigenaar, 2026-11-19):** het formulier moet ook werken op https://mariellemadern.mmadern.workers.dev, dus op dat ene adres en niet op de preview-adressen per PR. Daarvoor staat in `wrangler.jsonc` een gewone, niet-geheime variabele: `"vars": { "TOEGESTANE_HOSTS": "mariellemadern.mmadern.workers.dev" }` (de hostnaam zonder `https://`). Hij staat **in `wrangler.jsonc` en niet in het Cloudflare-dashboard**: de Worker wordt vanuit dat bestand beheerd (Workers Builds), en Cloudflare staat variabelen die in het dashboard worden toegevoegd dan niet toe. De eigenaar hoeft hier dus in Cloudflare niets voor in te stellen, behalve (nog steeds) die exacte hostnaam toevoegen aan de Turnstile-widget (dat Turnstile een workers.dev-hostnaam accepteert is niet geverifieerd). **De variabele kent geen wildcard:** er wordt met de exacte hostnaam vergeleken (geen `*`, geen achtervoegsel), zodat een preview zoals `preview-pr-35-mariellemadern.mmadern.workers.dev` geweigerd blijft (`403`), ook al lijkt de naam erop (previews erven de variabele wel, maar hebben een andere hostnaam); meerdere hostnamen kunnen, gescheiden door komma's. **De secrets (`RESEND_API_KEY`, `TURNSTILE_SECRET`) staan niet in `wrangler.jsonc`** maar alleen in het dashboard; een uitrol met `vars` raakt secrets niet aan (secrets zijn losstaande waarden bij de Worker; alleen gewone variabelen volgen het configuratiebestand). Een test op een ander adres kan door dat adres tijdelijk aan de variabele in `wrangler.jsonc` toe te voegen (in een PR, en daarna weer weg te halen).
- **Wat beschermt:** de lijst met toegestane hostnamen, Turnstile (met controle van hostname en actie) en de limieten. De controle van de `Origin`-kop is alleen een eenvoudig filter tegen gebruik vanaf andere pagina's in een browser, geen verificatie: elk script kan die kop zelf zetten.

Testen zonder sleutels en zonder echte mail: `pnpm test:worker` (alles nagebootst, met verzonnen gegevens; draait ook in `pnpm build`).

### Het formulier op de nummerpagina

`app/components/BladmuziekFormulier.vue` (teksten in `app/bladmuziek-teksten.ts`) staat onderaan de nummerpagina, na de liedtekst, met een koppeling 'Bladmuziek van dit nummer' bij de luisterbalk. Het verschijnt **alleen** bij een nummer met `bladmuziek: true` (nu de acht nummers waarvoor een pdf in R2 staat: In het licht, Kijk eens waar je nu staat, Noem mijn naam, Spiegel, U geeft leven, U ziet mij, Voor nu en voor altijd en Wat een liefde; 'Hart van glas' volgt zodra zijn pdf er staat). Het Turnstile-script van Cloudflare laadt pas als iemand het formulier gebruikt (focus in een veld of een klik op de koppeling). De **Site key** van de Turnstile-widget staat als vaste waarde `runtimeConfig.public.turnstileSitekey` in `nuxt.config.ts`: hij is publiek en hoort bij de widget van de eigenaar (maakt de eigenaar een andere widget, dan moet die waarde mee veranderen); de geheime sleutel staat alleen als secret `TURNSTILE_SECRET` in Cloudflare. Een proefbouw met de testsleutel van Cloudflare, waarmee Turnstile altijd slaagt: `NUXT_PUBLIC_TURNSTILE_SITEKEY=1x00000000000000000000AA pnpm generate`.

## Contactformulier (staat aan)

`POST /api/contact` (`worker/contact.mjs`) is het eindpunt voor een contactformulier (algemene vragen en boekingen), op dezelfde manier gebouwd als de bladmuziek: dezelfde Worker, Turnstile (actie `contact`, het formulier moet `data-action="contact"` meegeven), Resend, niets opgeslagen en niets gelogd. De stappen die beide eindpunten delen staan in `worker/gedeeld.mjs`; `worker/api.mjs` verdeelt de verzoeken. Het formulier staat op de contactpagina (`app/components/ContactFormulier.vue`, teksten in `app/contact-teksten.ts`, de inleiding in `content/paginas/contact.md`) en gebruikt dezelfde bouwstenen als het formulier voor de bladmuziek.

- **Aan of uit met `CONTACT_AAN`:** een gewone variabele in `wrangler.jsonc` (`"vars"`, naast `TOEGESTANE_HOSTS`). Staat hij op `aan`, dan werkt het eindpunt (het contactformulier op `/contact/` gebruikt het). Staat hij op iets anders, of ontbreekt hij, dan geeft het eindpunt `503` en toont het formulier een melding met het e-mailadres. Uitzetten is dus één regel veranderen (en uitrollen).
- **Zelfde secrets en hostcontrole als de bladmuziek:** `RESEND_API_KEY` en `TURNSTILE_SECRET` (al gezet) en `TOEGESTANE_HOSTS`; een andere hostnaam krijgt `403`. Er is geen R2-bucket voor nodig.
- **Eigen limieten per minuut**, los van de bladmuziek (`LIMIET_CONTACT_IP` 3, `LIMIET_CONTACT_ADRES` 1, `LIMIET_CONTACT_ALGEMEEN` 5): het ene formulier blokkeert het andere niet.
- **Twee mails per bericht:** eerst de mail aan Mariëlle (met het adres van de bezoeker als `reply_to`), dan een bevestiging aan de bezoeker met **alleen vaste tekst** (geen naam, bericht, samenvatting of link van de bezoeker, zodat het formulier niet kan worden gebruikt om met onze afzender een eigen tekst naar iemand anders te sturen; besluit van 2026-11-24). Het Resend-plafond is op het gratis plan 100 mails per dag en 3.000 per maand, gedeeld met de bladmuziek: een contactbericht kost er twee, dus hooguit 50 berichten per dag. Lukt de bevestiging niet, dan is het bericht toch aangekomen.
- **Invoer:** naam, e-mailadres, onderwerp (`vraag` of `boeking`), bericht tot 5.000 tekens; bij `boeking` zes extra gewone tekstvelden die allemaal optioneel zijn (`datumtijd`, `plaats`, `gelegenheid`, `aantal`, `speeltijden`, `budget`; elk tot 100 tekens, `speeltijden` tot 200). Het maximum van een verzoek is 24 KB.

## Nieuwsbrief via Brevo

Wie bij een bladmuziekaanvraag het vakje voor de nieuwsbrief aanvinkt, wordt door de Worker op de lijst 'Nieuwsbrief' in Brevo gezet (`worker/brevo.mjs`, `meldAan`). **Er gaat geen mail meer naar Mariëlle:** Brevo is de enige plek. Uitschrijven gaat via de link in elke nieuwsbrief (door Brevo). Het voorstel staat in `nieuwsbrief-techniek.md` in de gedeelde map.

- **Wat er naar Brevo gaat:** het e-mailadres en het lijstnummer, twee eigen attributen als bewijs van de toestemming: `BRON` (`bladmuziek:<nummer>`) en `AANGEMELD_OP` (de dag, JJJJ-MM-DD, Europe/Amsterdam), en de ingevulde naam. **Bij het vakje bij de bladmuziek gaat de hele ingevulde naam in `FIRSTNAME` en blijft `LASTNAME` leeg** (het formulier heeft één veld 'Naam'; een vrij veld is niet betrouwbaar in voor- en achternaam te splitsen en wij raden nooit). Alleen een naam die er gewoon uitziet gaat mee (`veiligeNaam`: alleen letters met accenten, spaties, koppelteken en apostrof, maximaal 80 tekens; Marie-Louise D'Hondt en Jan de Vries mogen, een punt, cijfers, haakjes en links niet): **een andere naam wordt weggelaten en blokkeert de aanmelding nooit.** Gevolg voor een latere nieuwsbrief: een aanhef met `FIRSTNAME` geeft bij wie via de bladmuziek kwam 'Dag Anna Jansen'; dat is een besluit van de eigenaar. Bij het losse aanmeldformulier (zie hieronder) zijn voornaam en achternaam aparte, optionele velden. Eerst `POST https://api.brevo.com/v3/contacts`; bestaat het adres al (Brevo antwoordt 400 `duplicate_parameter`), dan een `PUT` met alleen de lijst, zodat bron en datum van de eerste aanmelding blijven staan. De bezoeker ziet nooit of een adres al bestond. `emailBlacklisted` wordt nooit aangeraakt: wie zich heeft uitgeschreven, wordt door het formulier niet stilletjes opnieuw ingeschreven.
- **Instellen:** het lijstnummer staat als gewone variabele in `wrangler.jsonc` (`"vars"`, `BREVO_LIJST_ID`, nu `4`: de lijst 'Nieuwsbrief'; geen geheim). De sleutel is het secret `BREVO_API_KEY` (alleen in het Cloudflare-dashboard, Worker `mariellemadern`, Variabelen en secrets): hij staat nergens in de code, de tests of een PR. Zonder sleutel of met een ongeldig nummer meldt de Worker niemand aan; de bladmuziek gaat gewoon. **Uitzetten:** `BREVO_LIJST_ID` weghalen en uitrollen (de aanmeldingen stoppen, de bladmuziek niet).
- **Eenmalig in Brevo (door de eigenaar):** (1) twee contactattributen aanmaken met precies deze namen: `BRON` (tekst) en `AANGEMELD_OP` (datum); ontbreken ze, dan komt het adres er wel op, maar zonder bron en datum (de Worker probeert het dan zonder attributen). (2) Bij Beveiliging, Geautoriseerde IP-adressen, **'Block unknown IP addresses' uit laten staan**: een Cloudflare Worker heeft geen vast IP-adres, dus elke aanmelding zou worden geweigerd.
- **Als Brevo niet bereikbaar is** (geen verbinding, langer dan 5 seconden, 429, 5xx, of 401 en 403 door een verkeerde sleutel): de bladmuziek is al verstuurd, de aanmelding blijft in de database op `wacht` (kolom `status_tweede`) en de Cron (elke 5 minuten) probeert het opnieuw tot 24 uur; daarna `mislukt`. De bezoeker merkt niets. Een voorgoed afgekeurd adres (andere 400) wordt direct `mislukt`. Het adres en de naam staan bij een bladmuziekaanvraag 30 dagen in de rij van de aanvraag, zoals beschreven bij 'Opslag van berichten'. Zonder database gaat een mislukte aanmelding verloren (de bezoeker kan het opnieuw doen).
- **Zien hoe het gaat (D1-console):** `SELECT status_tweede, count(*) FROM berichten WHERE soort = 'bladmuziek' AND status_tweede <> 'nvt' GROUP BY status_tweede;` toont hoeveel aanmeldingen `verzonden`, `wacht` of `mislukt` zijn. Een lege lijst in Brevo bij `verzonden` rijen betekent: controleer de attributen en de sleutel.
- **Testen** (zonder echte aanroepen): `pnpm test:worker` bootst Brevo na. De eigenaar test zo: bij een bladmuziekaanvraag met een eigen adres het vakje aanvinken; binnen enkele minuten staat het adres in lijst 4 (met `BRON` en `AANGEMELD_OP`, en de ingevulde naam in `FIRSTNAME`; `LASTNAME` blijft leeg), en er komt geen mail bij hallo@. Hetzelfde adres nog eens, met een andere naam: nog steeds één contact, met de bron, datum en naam van de eerste keer. Een naam met een link of cijfers (verzonnen): het adres komt er wel op, zonder naam.

### Het losse aanmeldformulier in de voet (eindpunt `/api/nieuwsbrief`, staat aan)

`POST /api/nieuwsbrief` (`worker/nieuwsbrief.mjs`) is het eindpunt voor het aanmeldformulier voor de nieuwsbrief. Het formulier zelf staat in een **strook 'Nieuwsbrief' bovenin de voet, op elke pagina**: `app/components/NieuwsbriefFormulier.vue` (teksten in `app/nieuwsbrief-teksten.ts`; de kop en de regel van de strook in `app/components/SiteVoet.vue`, zodat de voet geen formuliercode meetrekt). Voornaam en achternaam zijn optioneel, met '(optioneel)' in het label (normaal gewicht, 15 px, rustig grijs: de token `--tekst-zacht` in `app/assets/css/tokens.css`), het e-mailadres is verplicht. Het formulier laadt pas als de strook in beeld komt (`hydrate-on-visible`), wordt niet vooraf geladen (zie de hook `build:manifest` in `nuxt.config.ts`) en laadt Turnstile (actie `nieuwsbrief`) pas bij gebruik. Zonder JavaScript staan de velden uit en staat er een regel met `hallo@mariellemadern.nl`. Het ontwerp staat in `design/nieuwsbrief-aanmelden.md` in de gedeelde map.

**Aan en uit:** het eindpunt staat aan zolang `NIEUWSBRIEF_AAN` op `aan` staat in `wrangler.jsonc` (`"vars"`, naast `CONTACT_AAN`; in het bestand en niet in het dashboard, want een uitrol overschrijft variabelen uit het dashboard). Uitzetten: die regel weghalen en uitrollen (het formulier blijft dan zichtbaar en toont bij het versturen de melding met het e-mailadres); het formulier helemaal weg: de wijziging van de voet terugdraaien.

- **Wat het doet:** zet het adres op lijst 4 (`meldAan`, zoals bij het vakje bij de bladmuziek) met `BRON` = `formulier`. Er komt geen mail aan Mariëlle en geen bevestigingsmail; de bezoeker krijgt in alle gevallen hetzelfde antwoord (`200 {"ok":true}`), ook als het adres al bestond.
- **Invoer:** `email` is verplicht; `voornaam` en `achternaam` zijn optioneel en gaan als `FIRSTNAME` en `LASTNAME` naar Brevo. Een naam komt alleen mee als hij 'gewoon' is (`veiligeNaam`: alleen letters met accenten, spaties, koppelteken en apostrof, maximaal 60 tekens; Marie-Louise en D'Hondt mogen, een punt, cijfers, haakjes en links niet). **Een ongeldige naam blokkeert de aanmelding nooit:** hij wordt weggelaten. Bij een bestaand adres blijft de naam van de eerste aanmelding staan.
- **Bescherming:** zelfde stappen als de andere eindpunten: hostcontrole, Origin, JSON-maximum (2 KB), honeypot (`website`), Turnstile met de eigen actie `nieuwsbrief` (het formulier moet `data-action="nieuwsbrief"` meegeven), eigen limieten (`LIMIET_NIEUWSBRIEF_IP` 3, `LIMIET_NIEUWSBRIEF_ADRES` 1 en `LIMIET_NIEUWSBRIEF_ALGEMEEN` 10 per minuut; nieuwe bindingen in `wrangler.jsonc`, geen instelling nodig).
- **Opslag in D1, alleen voor een nieuwe poging:** de aanmelding krijgt een rij met `soort = 'nieuwsbrief'` en `onderwerp = 'formulier'`; de voornaam staat in `naam` en de achternaam in `extra`. **Zodra de aanmelding klaar is (gelukt, afgekeurd of na 24 uur) worden het adres en de namen meteen gewist** (`naam`, `email`, `extra` naar `NULL`); de rij houdt alleen de dag, de soort, de bron en de status (de statistiek). Mislukt Brevo tijdelijk, dan antwoordt de Worker `200` met `later: true` en probeert de Cron (elke 5 minuten) het opnieuw tot 24 uur; zonder database antwoordt hij dan `503` (de bezoeker kan het zelf opnieuw doen). Een vangnet in de Cron wist elke klaar-rij van deze soort die nog gegevens heeft.
- **Zien hoe het gaat (D1-console):** `SELECT dag, status_hoofd, count(*) FROM berichten WHERE soort = 'nieuwsbrief' GROUP BY dag, status_hoofd ORDER BY dag DESC;`
- **Wat de eigenaar eenmalig in Brevo doet:** `FIRSTNAME` en `LASTNAME` bestaan standaard (controleer dat ze in het account staan, categorie 'normal', type 'text'); verder niets extra.

## Opslag van berichten (D1)

De ingevulde formulieren (het contactformulier en de bladmuziekaanvragen) worden in een Cloudflare **D1**-database bewaard, als back-up voor als Resend even niet bereikbaar is. **De database `marielle-madern`** (binding `BERICHTEN` in `wrangler.jsonc`, `database_id` `74756d1e-94a8-4909-9165-14e6190d95d4`: een ID is geen geheim) is door de eigenaar aangemaakt met **jurisdictie EU** (volgens het dashboard 'The European Union', regio Eastern Europe binnen die jurisdictie). Dat betekent dat de database zelf alleen in de EU draait en opslaat; de Worker draait wel bij het dichtstbijzijnde datacenter van de bezoeker, dus de gegevens van een verzoek gaan daar kortstondig langs (bron: developers.cloudflare.com/d1/configuration/data-location).

- **Wat gebeurt er:** `POST /api/contact` en `POST /api/bladmuziek` valideren, controleren Turnstile en de limieten, slaan het bericht **eerst** op (status `wacht`), sturen dan de mail(s) en werken de status bij (`verzonden` of `mislukt`). Lukt het opslaan niet, dan wordt de mail toch verstuurd. Lukt een mail tijdelijk niet, dan hoort de bezoeker dat het bericht is aangekomen en probeert de Worker het later opnieuw. Zonder de binding werkt alles als zonder opslag.
- **Herhalen:** een Cron Trigger (elke 5 minuten, `worker/onderhoud.mjs`) probeert mails die niet zijn gelukt opnieuw, tot 24 uur; daarna wordt de status `mislukt`. Elke mail heeft een Idempotency-Key (`<id>-hoofd`, `<id>-tweede`), zodat Resend nooit twee keer dezelfde mail verstuurt. De pdf van de bladmuziek wordt bij een herhaling opnieuw uit R2 gelezen (nooit in de database bewaard).
- **Anonimiseren:** na 30 dagen worden naam, e-mailadres, bericht en extra gegevens (de boekingsvelden, de nieuwsbriefvlag) leeggemaakt. **Blijft:** `id`, `soort` (`contact`, `bladmuziek` of `nieuwsbrief`), de `dag` (in Europe/Amsterdam), `onderwerp` (`vraag`, `boeking` of het nummer) en de statussen: dat zijn de statistieken. De aanmelding voor de nieuwsbrief gaat naar Brevo (zie 'Nieuwsbrief via Brevo'): het adres staat bij een bladmuziekaanvraag in de rij van die aanvraag en wordt na 30 dagen mee geanonimiseerd; bij Brevo blijft het staan tot de uitschrijving.
- **Time Travel:** D1 maakt automatisch herstelpunten, op het gratis plan van de laatste 7 dagen (30 dagen op het betaalde plan; bron: developers.cloudflare.com/d1/reference/time-travel). Verwijderde of geanonimiseerde gegevens kunnen dus nog tot 7 dagen in zo'n herstelkopie van Cloudflare staan.
- **Beveiliging:** er is geen openbaar leesadres en geen beheerpagina: alleen de Worker bereikt de database, met vaste SQL en parameters. Er wordt niets gelogd (Workers Logs staan uit).

### Eenmalig: de tabel aanmaken (door de eigenaar, **vóór** deze binding wordt uitgerold)

Cloudflare-dashboard, Storage en databases, D1 SQL database, `marielle-madern`, tabblad Console: plak en voer uit (drie opdrachten; neemt de console er maar één tegelijk, voer ze dan een voor een uit):

```sql
CREATE TABLE berichten (
  id TEXT PRIMARY KEY,
  soort TEXT NOT NULL,
  aangemaakt TEXT NOT NULL,
  dag TEXT NOT NULL,
  onderwerp TEXT NOT NULL,
  naam TEXT,
  email TEXT,
  bericht TEXT,
  extra TEXT,
  status_hoofd TEXT NOT NULL DEFAULT 'wacht',
  status_tweede TEXT NOT NULL DEFAULT 'nvt',
  pogingen INTEGER,
  laatste_poging TEXT,
  geanonimiseerd_op TEXT
);
CREATE INDEX berichten_dag ON berichten (dag);
CREATE INDEX berichten_open ON berichten (status_hoofd, status_tweede);
```

Zonder deze tabel mislukt het opslaan stil (de mails gaan wel gewoon uit). Controle daarna: `SELECT count(*) FROM berichten;` geeft `0`.

### De cijfers en berichten bekijken (D1-console)

`status_hoofd` is bij contact de mail aan Mariëlle en bij de bladmuziek de mail met de pdf aan de bezoeker; `status_tweede` is bij contact de bevestiging aan de bezoeker en bij de bladmuziek de aanmelding voor de nieuwsbrief bij Brevo (`nvt` als het vakje niet is aangevinkt).

```sql
-- De laatste 20 berichten
SELECT soort, dag, onderwerp, naam, email, status_hoofd, status_tweede FROM berichten ORDER BY aangemaakt DESC LIMIT 20;

-- Wat nog niet (goed) is verstuurd
SELECT id, soort, dag, onderwerp, status_hoofd, status_tweede, pogingen FROM berichten
WHERE status_hoofd <> 'verzonden' OR status_tweede NOT IN ('verzonden', 'nvt');

-- Per maand en soort
SELECT substr(dag, 1, 7) AS maand, soort, count(*) AS aantal FROM berichten GROUP BY maand, soort ORDER BY maand;

-- Per nummer (bladmuziek)
SELECT onderwerp AS nummer, count(*) AS aantal FROM berichten WHERE soort = 'bladmuziek' GROUP BY onderwerp ORDER BY aantal DESC;

-- Een bericht handmatig anonimiseren
UPDATE berichten SET naam = NULL, email = NULL, bericht = NULL, extra = NULL, aangemaakt = dag,
  pogingen = NULL, laatste_poging = NULL, geanonimiseerd_op = dag WHERE id = '...';

-- Alles van één e-mailadres verwijderen (verzoek van een betrokkene)
DELETE FROM berichten WHERE lower(email) = lower('naam@voorbeeld.nl');

-- Een bericht verwijderen
DELETE FROM berichten WHERE id = '...';
```

## Let op

- `public/afbeeldingen/` wordt gegenereerd uit `app/bronafbeeldingen/`. Pas daar niets handmatig aan.
- Het bestand `app/assets/css/tokens.css` is een kopie van `documenten/huisstijl/tokens.css`. Vanaf nu is de kopie in deze map leidend.
- Wachtwoorden en tokens komen nooit in deze repository. Cloudflare-toegang loopt via `wrangler login`.
