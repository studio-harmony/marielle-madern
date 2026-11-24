// Controleert de gebouwde HTML in .output/public (draait aan het eind van pnpm generate).
// Eerst de gegevens in content/ (scripts/controle.mjs), nu wat er echt in de pagina's staat.
// Een fout stopt de bouw, dus ook de bouw van Cloudflare Workers Builds.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { parse } from 'yaml'

const SITE = 'https://mariellemadern.nl'
const wortel = fileURLToPath(new URL('..', import.meta.url))
const uitvoer = join(wortel, '.output', 'public')
const fouten = []

// Wat de bouw moet kloppen met: de kanalen, de EP en de volgorde op Over de muziek komen uit de bron
const aantalKanalen = [
  ...readFileSync(join(wortel, 'app', 'data', 'kanalen.ts'), 'utf-8').matchAll(/link:/g),
].length
const kopblok = (pad) =>
  parse(readFileSync(join(wortel, pad), 'utf-8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '') ?? {}
const home = parse(readFileSync(join(wortel, 'content', 'home.yml'), 'utf-8')) ?? {}
const ep = parse(readFileSync(join(wortel, 'content', 'uitgaven', 'u-ziet-mij.yml'), 'utf-8'))
// Over de muziek toont de nummers van de EP en alle singles
const aantalSingles = readdirSync(join(wortel, 'content', 'nummers'))
  .filter((f) => f.endsWith('.md'))
  .filter((f) => kopblok(`content/nummers/${f}`).uitgave === 'single').length
const verwachtAantalNummers = ep.nummers.length + aantalSingles
// Persoonsgegevens horen niet in de schema.org-gegevens (besluit van de eigenaar, 2026-11-16)
const VERBODEN = [
  'birthDate',
  'deathDate',
  'spouse',
  'children',
  'parent',
  'sibling',
  'relatedTo',
  'telephone',
  'address',
  'homeLocation',
  'gender',
  'email',
]

function* paginas(map) {
  for (const item of readdirSync(map, { withFileTypes: true })) {
    const pad = join(map, item.name)
    if (item.isDirectory()) {
      if (!item.name.startsWith('_') && !item.name.startsWith('__')) yield* paginas(pad)
    } else if (item.name === 'index.html') yield pad
  }
}

// Alle <meta>-tags van een pagina als lijst van { property of name, content }
function metaTags(html) {
  return [...html.matchAll(/<meta\s+([^>]*?)\/?>/g)].map(([, attrs]) => {
    const o = {}
    for (const [, k, v] of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) o[k] = v
    return o
  })
}

const meta = (tags, sleutel) =>
  tags.find((t) => t.property === sleutel || t.name === sleutel)?.content

// De toegestane lijst en het manifest van de deelafbeeldingen (scripts/og, public/afbeeldingen/og)
const toegestaan = JSON.parse(
  readFileSync(join(wortel, 'scripts', 'deelafbeeldingen-toegestaan.json'), 'utf-8'),
)
const manifest = JSON.parse(
  readFileSync(join(uitvoer, 'afbeeldingen', 'og', 'manifest.json'), 'utf-8'),
)
const paginaHtml = {}
const lijst = [...paginas(uitvoer)]
if (lijst.length < 15)
  fouten.push(`Er zijn maar ${lijst.length} pagina's gebouwd, verwacht minstens 15`)

for (const pad of lijst) {
  const route = '/' + relative(uitvoer, pad).replace(/index\.html$/, '')
  const fout = (tekst) => fouten.push(`${route}: ${tekst}`)
  const html = readFileSync(pad, 'utf-8')
  const tags = metaTags(html)

  // Canonical: absoluut, op het echte domein, met slash aan het eind
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1]
  if (canonical !== `${SITE}${route}`) fout(`canonical is ${canonical}, verwacht ${SITE}${route}`)
  if (meta(tags, 'og:url') !== `${SITE}${route}`) fout(`og:url is ${meta(tags, 'og:url')}`)

  // Deelafbeelding: JPEG van 1200 x 630 op het echte domein, met alt, en dezelfde voor Twitter
  const ogImage = meta(tags, 'og:image')
  if (!ogImage?.startsWith(`${SITE}/afbeeldingen/og/`) || !ogImage.endsWith('.jpg')) {
    fout(`og:image is ${ogImage}, verwacht ${SITE}/afbeeldingen/og/<naam>.jpg`)
  } else {
    const bestandPad = join(uitvoer, ogImage.slice(SITE.length))
    if (!existsSync(bestandPad)) fout(`og:image bestaat niet in de bouw: ${ogImage}`)
    else if (statSync(bestandPad).size > 150_000) fout(`${ogImage} is groter dan 150 KB`)
  }
  // De afbeelding staat in het manifest, en de alt bevat de tekst die op de afbeelding staat
  const naam = ogImage?.match(/\/afbeeldingen\/og\/([^/]+)\.jpg$/)?.[1]
  if (naam) {
    const regel = manifest[naam]
    if (!regel) fout(`${naam}.jpg staat niet in het manifest (pnpm og)`)
    else if (!meta(tags, 'og:image:alt')?.toLowerCase().includes(regel.titel.toLowerCase()))
      fout(`og:image:alt bevat de tekst op de afbeelding niet: "${regel.titel}"`)
  }
  if (meta(tags, 'twitter:image') !== ogImage) fout('twitter:image is niet gelijk aan og:image')
  if (!meta(tags, 'og:image:alt')?.trim()) fout('og:image:alt ontbreekt')
  if (!meta(tags, 'twitter:image:alt')?.trim()) fout('twitter:image:alt ontbreekt')
  if (meta(tags, 'og:image:width') !== '1200' || meta(tags, 'og:image:height') !== '630')
    fout('og:image:width/height moeten 1200 en 630 zijn')
  if (meta(tags, 'twitter:card') !== 'summary_large_image')
    fout(`twitter:card is ${meta(tags, 'twitter:card')}, verwacht summary_large_image`)
  if (meta(tags, 'og:locale') !== 'nl_NL')
    fout(`og:locale is ${meta(tags, 'og:locale')}, verwacht nl_NL`)

  // Koppen en links, en de pagina bewaren voor de controle van vorig en volgend nummer
  controleerKoppenEnLinks(route, html, fout)
  paginaHtml[route] = html

  // De homepage heeft zijn eigen afbeelding (home.jpg: logo en de regel van de home)
  if (route === '/') {
    if (!ogImage?.endsWith('/afbeeldingen/og/home.jpg'))
      fout(`de deelafbeelding van de homepage moet home.jpg zijn, niet ${ogImage}`)
    controleerHero(html, fout)
  }
  controleerLettertype(html, fout)
  controleerJsonLd(route, html, fout)
}

function controleerJsonLd(route, html, fout) {
  const blokken = [
    ...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ].map((m) => m[1])
  if (!blokken.length) return fout('geen JSON-LD')
  const nodes = []
  for (const tekst of blokken) {
    try {
      const d = JSON.parse(tekst)
      nodes.push(...(d['@graph'] ?? [d]))
    } catch (e) {
      return fout(`JSON-LD is geen geldige JSON (${e.message})`)
    }
  }
  const typen = (n) => [].concat(n['@type'])
  const van = (t) => nodes.filter((n) => typen(n).includes(t))
  const ids = nodes.map((n) => n['@id']).filter(Boolean)
  if (new Set(ids).size !== ids.length) fout("JSON-LD heeft dubbele @id's")
  if (van('WebSite').length !== 1) fout('JSON-LD moet precies één WebSite hebben')
  if (van('WebPage').length !== 1) fout('JSON-LD moet precies één WebPage hebben')
  if (van('VideoObject').length)
    fout('VideoObject hoort er niet in (uploadDate is nog niet bevestigd)')
  const personen = van('Person')
  if (personen.length !== 1 || personen[0].name !== 'Mariëlle Madern')
    fout('JSON-LD moet één Person "Mariëlle Madern" hebben')
  else if ((personen[0].sameAs ?? []).length !== aantalKanalen)
    fout(
      `Person.sameAs heeft ${(personen[0].sameAs ?? []).length} kanalen, verwacht ${aantalKanalen}`,
    )
  const sleutels = (o) =>
    o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => [k, ...sleutels(v)]) : []
  for (const k of sleutels(nodes))
    if (VERBODEN.includes(k)) fout(`JSON-LD bevat ${k}, dat hoort er niet in`)

  const nummer = route.match(/^\/over-de-muziek\/([^/]+)\/$/)?.[1]
  if (nummer) {
    const [n] = van('MusicRecording')
    if (!n) return fout('nummerpagina heeft geen MusicRecording')
    if (n.url !== `${SITE}${route}`) fout(`MusicRecording.url is ${n.url}`)
    if (!/^PT\d+M\d{1,2}S$/.test(n.duration ?? '')) fout(`MusicRecording.duration is ${n.duration}`)
    if (n.byArtist?.['@id'] !== `${SITE}/#identity`)
      fout('MusicRecording.byArtist verwijst niet naar de Person')
    if (!!n.inAlbum !== ep.nummers.includes(nummer))
      fout('MusicRecording.inAlbum klopt niet met de EP in content/uitgaven')
    const [b] = van('BreadcrumbList')
    if (b?.itemListElement?.length !== 3) fout('nummerpagina heeft geen kruimelpad van 3 stappen')
    if ('lyrics' in n || 'datePublished' in n || 'recordingOf' in n)
      fout('lyrics, datePublished en recordingOf horen er niet in (nog niet bevestigd)')
  }
  if (route === '/bestel-de-ep/') {
    const [a] = van('MusicAlbum')
    if (!a) fout('geen MusicAlbum')
    else if (a.numTracks !== ep.nummers.length || a.track?.length !== ep.nummers.length)
      fout(
        `MusicAlbum: numTracks ${a.numTracks}, ${a.track?.length} tracks, maar de EP in content/uitgaven heeft er ${ep.nummers.length}`,
      )
    if (van('Product').length || van('Offer').length)
      fout('Product en Offer horen er niet in (geen webshop)')
  }
  if (route === '/over-de-muziek/') {
    const [l] = van('ItemList')
    if (l?.itemListElement?.length !== verwachtAantalNummers)
      fout(
        `ItemList heeft ${l?.itemListElement?.length} nummers, EP en singles samen hebben er ${verwachtAantalNummers}`,
      )
  }
  if (route === '/contact/' && !van('ContactPage').length) fout('geen ContactPage')
  if (route === '/over-mij/' && !van('AboutPage').length) fout('geen AboutPage')
  // [home-json-ld] De homepage toont het uitgelichte nummer en de lijst met nummers; de JSON-LD volgt dat
  if (route === '/') {
    const lijst = van('ItemList')[0]
    const verwacht = (home.videolijst ?? []).length
    if (lijst?.itemListElement?.length !== verwacht)
      fout(
        `ItemList heeft ${lijst?.itemListElement?.length} nummers, de videolijst in content/home.yml heeft er ${verwacht}`,
      )
    if (
      home.uitgelicht &&
      !van('MusicRecording').some((n) => n.url === `${SITE}/over-de-muziek/${home.uitgelicht}/`)
    )
      fout(`het uitgelichte nummer ${home.uitgelicht} ontbreekt als MusicRecording`)
  }
}

// Snelheid: het stylesheet van Adobe Fonts blokkeert de eerste weergave niet
function controleerLettertype(html, fout) {
  // Eerst de <noscript>-blokken weghalen: daar staat de gewone (blokkerende) link bewust, voor wie geen JavaScript heeft
  const zonderNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
  const kit = [...zonderNoscript.matchAll(/<link[^>]*bxn6xtn\.css[^>]*>/g)].map((m) => m[0])
  if (!kit.length) return fout('het stylesheet van Adobe Fonts ontbreekt')
  if (kit.some((t) => !/\smedia="print"/.test(t)))
    fout('het stylesheet van Adobe Fonts blokkeert nog (media="print" ontbreekt)')
  if (
    !html.includes(
      '<noscript><link rel="stylesheet" href="https://use.typekit.net/bxn6xtn.css"></noscript>',
    )
  )
    fout('de <noscript>-terugval voor het lettertype ontbreekt')
}

// [hero-poster] De hero heeft een poster die direct in de pagina staat (stilstaand beeld uit de video)
function controleerHero(html, fout) {
  const poster = html.match(/<img[^>]*hero__poster[^>]*>/)?.[0]
  if (!poster) return fout('de hero heeft geen poster (<img class="hero__poster">)')
  if (!/fetchpriority="high"/.test(poster) || /loading="lazy"/.test(poster))
    fout('de poster moet fetchpriority=high hebben en niet lazy zijn')
  if (!/width="\d+"/.test(poster) || !/height="\d+"/.test(poster))
    fout('de poster heeft width en height nodig (geen verspringing)')
  const src = poster.match(/\ssrc="([^"]+)"/)?.[1]
  if (!src || !existsSync(join(uitvoer, src)))
    fout(`het poster-bestand bestaat niet in de bouw: ${src}`)
}

// Koppen en links: één h1, geen kopniveau overslaan, en de nummerpagina's hebben links in de inhoud
function controleerKoppenEnLinks(route, html, fout) {
  const hoofd = html.match(/<main[\s\S]*<\/main>/)?.[0] ?? ''
  const koppen = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]))
  const aantalH1 = koppen.filter((k) => k === 1).length
  if (aantalH1 !== 1) fout(`${aantalH1} h1's, verwacht precies 1`)
  koppen.forEach((k, i) => {
    if (i > 0 && k > koppen[i - 1] + 1) fout(`kopniveau springt van h${koppen[i - 1]} naar h${k}`)
  })
  if (/^\/over-de-muziek\/[^/]+\/$/.test(route)) {
    if (!/<h2[^>]*>Liedtekst<\/h2>/.test(hoofd))
      fout('de kop boven de liedtekst moet "Liedtekst" zijn')
    if (!hoofd.includes('href="/over-de-muziek/"'))
      fout('geen link naar Over de muziek in de inhoud')
    if (!/rel="(prev|next)"/.test(hoofd))
      fout('geen link naar een vorig of volgend nummer in de inhoud')
  }
  if (route === '/contact/') {
    // Het contactformulier: de velden zijn er, het e-mailadres staat zichtbaar als alternatief (in de inleiding en in
    // de regel zonder JavaScript), en de groep met boekingsvelden staat er pas als 'Boeking' is gekozen
    if (!/<form[^>]*action="\/api\/contact"/.test(hoofd)) fout('het contactformulier ontbreekt')
    for (const naam of ['naam', 'email', 'bericht', 'website'])
      if (!new RegExp(`name="${naam}"`).test(hoofd))
        fout(`het contactformulier mist het veld ${naam}`)
    const vraag = hoofd.match(/<input[^>]*name="onderwerp"[^>]*value="vraag"[^>]*>/)?.[0] ?? ''
    if (!/\schecked[\s>]/.test(vraag)) fout('"Algemene vraag" moet standaard gekozen zijn')
    if (!hoofd.includes('href="mailto:hallo@mariellemadern.nl"'))
      fout('het e-mailadres staat niet als link op de contactpagina')
    if (!/<noscript[^>]*>[^<]*hallo@mariellemadern\.nl/.test(hoofd))
      fout('de regel zonder JavaScript met het e-mailadres ontbreekt')
    if (/name="datumtijd"/.test(hoofd))
      fout('de boekingsvelden horen er pas te staan als Boeking is gekozen')
  }
  if (route === '/over-de-muziek/') {
    // Elke link naar een nummer heeft een naam: linktekst, alt-tekst van de afbeelding of aria-label
    for (const [, tag, binnen] of hoofd.matchAll(
      /<a ([^>]*href="\/over-de-muziek\/[^"/]+\/"[^>]*)>([\s\S]*?)<\/a>/g,
    )) {
      const tekst = binnen.replace(/<[^>]+>/g, '').trim()
      const alt = binnen.match(/\salt="([^"]+)"/)?.[1]
      const label = tag.match(/aria-label="([^"]+)"/)?.[1]
      if (!tekst && !alt && !label)
        fout(`een link naar een nummer heeft geen naam (${tag.slice(0, 60)})`)
    }
  }
}

// De vorige- en volgende-links op elke nummerpagina volgen de volgorde van de covers op Over de muziek
function controleerNummerVolgorde(pagina, fout) {
  const overzicht = pagina['/over-de-muziek/']?.match(/<main[\s\S]*<\/main>/)?.[0] ?? ''
  const volgorde = [...overzicht.matchAll(/<a [^>]*href="(\/over-de-muziek\/[^"/]+\/)"/g)].map(
    (m) => m[1],
  )
  if (!volgorde.length) return fout('/over-de-muziek/: geen covers gevonden')
  volgorde.forEach((pad, i) => {
    const hoofd = pagina[pad]?.match(/<main[\s\S]*<\/main>/)?.[0] ?? ''
    const rel = (soort) =>
      [...hoofd.matchAll(/<a ([^>]*)>/g)]
        .map((m) => m[1])
        .find((a) => new RegExp(`rel="${soort}"`).test(a))
        ?.match(/href="([^"]+)"/)?.[1]
    if (rel('prev') !== volgorde[i - 1])
      fout(`${pad}: vorige is ${rel('prev')}, verwacht ${volgorde[i - 1]}`)
    if (rel('next') !== volgorde[i + 1])
      fout(`${pad}: volgende is ${rel('next')}, verwacht ${volgorde[i + 1]}`)
  })
}

// Privacy: een hoes mag alleen als deelafbeelding als het nummer op de toegestane lijst staat
for (const [naam, m] of Object.entries(manifest)) {
  const mag = naam === 'bestel-de-ep' ? toegestaan.ep === true : toegestaan.nummers.includes(naam)
  if (m.hoes && !mag)
    fouten.push(
      `${naam}.jpg gebruikt een hoes die niet op de toegestane lijst staat (scripts/deelafbeeldingen-toegestaan.json)`,
    )
}

controleerNummerVolgorde(paginaHtml, (t) => fouten.push(t))

// De afbeeldingen zelf: 1200 x 630, JPEG
for (const f of readdirSync(join(uitvoer, 'afbeeldingen', 'og')).filter((f) =>
  f.endsWith('.jpg'),
)) {
  const m = await sharp(join(uitvoer, 'afbeeldingen', 'og', f)).metadata()
  if (m.width !== 1200 || m.height !== 630 || m.format !== 'jpeg')
    fouten.push(`afbeeldingen/og/${f} is ${m.width}x${m.height} ${m.format}`)
}

// 404.html (de pagina die Cloudflare toont bij een onbekend adres): een titel en een kop in de HTML zelf
const nietGevonden = readFileSync(join(uitvoer, '404.html'), 'utf-8')
if (!/<title>[^<]+<\/title>/.test(nietGevonden)) fouten.push('404.html heeft geen <title>')
if (!/<h1[^>]*>[^<]+<\/h1>/.test(nietGevonden)) fouten.push('404.html heeft geen <h1>')

if (fouten.length) {
  console.error(`Uitvoer: ${fouten.length} fout(en)\n` + fouten.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
console.log(`Uitvoer: alles in orde (${lijst.length} pagina's).`)
