// Tests van de Worker voor bladmuziek. Alles is nagebootst: Resend, Turnstile, de R2-bucket en de limieten.
// Er gaat geen echte mail weg en er is geen sleutel nodig. Alle namen en adressen zijn verzonnen.
// Draaien: pnpm test:worker
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { behandel, geconfigureerd, hostToegestaan, TOEGESTANE_HOSTS } from './bladmuziek.mjs'
import { mailBezoeker, veiligeNaam } from './teksten.mjs'

const SITE = 'https://mariellemadern.nl'
const HOSTNAME = 'mariellemadern.nl'
const ACTIE = 'bladmuziek'
const LIJST = { 'hart-van-glas': { titel: 'Hart van glas' } }
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10]) // "%PDF-1.4"
const GOED = {
  naam: 'Proefpersoon Verzonnen',
  email: 'test@example.org',
  nummer: 'hart-van-glas',
  token: 'proef',
  nieuwsbrief: false,
}

let gesprekken
let logregels
let origineel

// Een stukje nagebouwde omgeving met alles aan; een test zet er iets van uit
function maakOmgeving({ bestand = true, limiet = true, ipLimiet = true } = {}) {
  const limiter = (zet) => ({
    keys: [],
    async limit({ key }) {
      this.keys.push(key)
      return { success: zet }
    },
  })
  return {
    RESEND_API_KEY: 'proef-sleutel',
    TURNSTILE_SECRET: 'proef-geheim',
    BLADMUZIEK: {
      sleutels: [],
      async get(sleutel) {
        this.sleutels.push(sleutel)
        return bestand && sleutel === 'bladmuziek/hart-van-glas.pdf'
          ? { size: PDF.length, arrayBuffer: async () => PDF.buffer }
          : null
      },
    },
    LIMIET_IP: limiter(ipLimiet),
    LIMIET_ADRES: limiter(limiet),
    LIMIET_ALGEMEEN: limiter(true),
  }
}

// Nagebootste fetch: Turnstile en Resend, met instelbare uitkomsten
function maakFetch({
  turnstile = { success: true, hostname: HOSTNAME, action: ACTIE },
  resend = [200, 200],
} = {}) {
  let nummer = 0
  return async (url, init) => {
    gesprekken.push({ url: String(url), init })
    if (String(url).includes('turnstile')) return new Response(JSON.stringify(turnstile))
    const status = resend[nummer++] ?? 200
    return new Response(JSON.stringify({ id: 'proef' }), { status })
  }
}

const verzoek = (
  body,
  { methode = 'POST', pad = '/api/bladmuziek', origin = SITE, type = 'application/json' } = {},
) =>
  new Request(SITE + pad, {
    method: methode,
    headers: { origin, 'content-type': type },
    ...(methode === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  })

const run = (request, env = maakOmgeving(), fetchFn = maakFetch()) =>
  behandel(request, env, { lijst: LIJST, fetch: fetchFn })
const resendAanroepen = () => gesprekken.filter((g) => g.url.includes('resend'))
const json = async (res) => res.json()

beforeEach(() => {
  gesprekken = []
  logregels = []
  origineel = { log: console.log, error: console.error, warn: console.warn }
  for (const k of ['log', 'error', 'warn']) console[k] = (...a) => logregels.push(a.join(' '))
})
afterEach(() => Object.assign(console, origineel))

describe('routes en uitgeschakeld', () => {
  test('geen /api-verzoek: null (gaat naar de statische bestanden)', async () => {
    assert.equal(await run(verzoek(null, { methode: 'GET', pad: '/over-mij/' })), null)
  })
  test('onbekend /api-pad: 404', async () => {
    assert.equal((await run(verzoek({}, { pad: '/api/iets' }))).status, 404)
  })
  test('GET: 405', async () => {
    assert.equal((await run(verzoek(null, { methode: 'GET' }))).status, 405)
  })
  test('zonder secrets of bucket: 503 uitgeschakeld, en niets verzonden', async () => {
    for (const weg of [
      'RESEND_API_KEY',
      'TURNSTILE_SECRET',
      'BLADMUZIEK',
      'LIMIET_IP',
      'LIMIET_ADRES',
      'LIMIET_ALGEMEEN',
    ]) {
      const env = maakOmgeving()
      delete env[weg]
      assert.equal(geconfigureerd(env), false)
      const res = await run(verzoek(GOED), env)
      assert.equal(res.status, 503)
      assert.deepEqual(await json(res), { fout: 'uitgeschakeld' })
    }
    assert.equal(gesprekken.length, 0)
  })
  test('lege omgeving (zoals nu op Cloudflare): 503', async () => {
    assert.equal((await run(verzoek(GOED), {})).status, 503)
  })
})

describe('verzoek controleren', () => {
  test('andere herkomst of geen herkomst: 403', async () => {
    assert.equal((await run(verzoek(GOED, { origin: 'https://kwaad.example' }))).status, 403)
    const zonder = new Request(SITE + '/api/bladmuziek', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(GOED),
    })
    assert.equal((await run(zonder)).status, 403)
  })
  test('een body zonder content-length wordt gestreamd gelezen en stopt bij 4 KB: 413', async () => {
    let gelezen = 0
    const stroom = new ReadableStream({
      pull(controller) {
        gelezen++
        controller.enqueue(new TextEncoder().encode('x'.repeat(1024)))
      },
    })
    const request = new Request(SITE + '/api/bladmuziek', {
      method: 'POST',
      headers: { origin: SITE, 'content-type': 'application/json' },
      body: stroom,
      duplex: 'half',
    })
    assert.equal(request.headers.get('content-length'), null)
    const res = await run(request)
    assert.equal(res.status, 413)
    assert.ok(gelezen <= 8, `er is ${gelezen} keer gelezen uit een oneindige stroom`)
    assert.equal(gesprekken.length, 0)
  })
  test('geen JSON: 415', async () => {
    assert.equal((await run(verzoek('naam=x', { type: 'text/plain' }))).status, 415)
  })
  test('ongeldige JSON of te groot: 400 of 413', async () => {
    assert.equal((await run(verzoek('{kapot'))).status, 400)
    assert.equal(
      (await run(verzoek(JSON.stringify({ ...GOED, naam: 'x'.repeat(5000) })))).status,
      413,
    )
  })
  test('naam of adres leeg of ongeldig: 400 met het veld', async () => {
    const naam = await run(verzoek({ ...GOED, naam: '   ' }))
    assert.equal(naam.status, 400)
    assert.deepEqual(await json(naam), { fout: 'ongeldig', veld: 'naam' })
    for (const email of ['', 'geen-adres', 'a@b', 'a b@c.nl', 'a@b.nl,c@d.nl', '<x>@b.nl']) {
      const res = await run(verzoek({ ...GOED, email }))
      assert.equal(res.status, 400, email)
      assert.equal((await json(res)).veld, 'email')
    }
    assert.equal(gesprekken.length, 0)
  })
  test('onbekend nummer of een bestandsnaam van de bezoeker: 404, geen bucket-aanroep', async () => {
    const env = maakOmgeving()
    for (const nummer of [
      'bestaat-niet',
      '../geheim',
      'hart-van-glas.pdf',
      '__proto__',
      'constructor',
    ]) {
      const res = await run(verzoek({ ...GOED, nummer }), env)
      assert.equal(res.status, 404, nummer)
    }
    assert.deepEqual(env.BLADMUZIEK.sleutels, [])
    assert.equal(gesprekken.length, 0)
  })
})

describe('misbruik', () => {
  test('honeypot gevuld: 200, maar niets verzonden en niets gecontroleerd', async () => {
    const env = maakOmgeving()
    const res = await run(verzoek({ ...GOED, website: 'http://spam.example' }), env)
    assert.equal(res.status, 200)
    assert.equal(gesprekken.length, 0)
    assert.deepEqual(env.BLADMUZIEK.sleutels, [])
  })
  test('Turnstile mislukt: 400, geen mail, geen bucket', async () => {
    const env = maakOmgeving()
    const res = await run(verzoek(GOED), env, maakFetch({ turnstile: { success: false } }))
    assert.equal(res.status, 400)
    assert.equal((await json(res)).fout, 'controle_mislukt')
    assert.equal(resendAanroepen().length, 0)
    assert.deepEqual(env.BLADMUZIEK.sleutels, [])
  })
  test('token van een andere hostname (andere site): 400, geen mail, geen bucket', async () => {
    const env = maakOmgeving()
    const res = await run(
      verzoek(GOED),
      env,
      maakFetch({ turnstile: { success: true, hostname: 'aanvaller.example', action: ACTIE } }),
    )
    assert.equal(res.status, 400)
    assert.equal((await json(res)).fout, 'controle_mislukt')
    assert.equal(resendAanroepen().length, 0)
    assert.deepEqual(env.BLADMUZIEK.sleutels, [])
    assert.deepEqual(env.LIMIET_IP.keys, [])
  })
  test('hostname of actie ontbreekt of klopt niet in het antwoord van Turnstile: 400, geen mail', async () => {
    for (const turnstile of [
      { success: true },
      { success: true, action: ACTIE },
      { success: true, hostname: HOSTNAME },
      { success: true, hostname: HOSTNAME, action: 'iets-anders' },
      { success: true, hostname: 'www.' + HOSTNAME, action: ACTIE },
      { success: true, hostname: HOSTNAME.toUpperCase(), action: '' },
    ]) {
      const res = await run(verzoek(GOED), maakOmgeving(), maakFetch({ turnstile }))
      assert.equal(res.status, 400, JSON.stringify(turnstile))
    }
    assert.equal(resendAanroepen().length, 0)
  })
  test('andere hostnamen (preview, workers.dev, onbekend): 403, ook als Turnstile ze zou toestaan', async () => {
    for (const host of [
      'preview-pr-1-mariellemadern.mmadern.workers.dev',
      'mariellemadern.mmadern.workers.dev',
      'mariellemadern.nl.aanvaller.example',
      'xmariellemadern.nl',
    ]) {
      const adres = `https://${host}`
      const request = new Request(adres + '/api/bladmuziek', {
        method: 'POST',
        headers: { origin: adres, 'content-type': 'application/json' },
        body: JSON.stringify(GOED),
      })
      const env = maakOmgeving()
      const res = await run(
        request,
        env,
        maakFetch({ turnstile: { success: true, hostname: host, action: ACTIE } }),
      )
      assert.equal(res.status, 403, host)
      assert.deepEqual(await json(res), { fout: 'adres_niet_toegestaan' })
      assert.equal(env.BLADMUZIEK.sleutels.length, 0)
    }
    assert.equal(gesprekken.length, 0, 'geen Turnstile, geen Resend')
  })
  test('toegestane hosts: standaard het echte domein en www; TOEGESTANE_HOSTS breidt bewust uit', async () => {
    assert.deepEqual(TOEGESTANE_HOSTS, ['mariellemadern.nl', 'www.mariellemadern.nl'])
    assert.equal(hostToegestaan({}, 'www.mariellemadern.nl'), true)
    assert.equal(hostToegestaan({}, 'mariellemadern.mmadern.workers.dev'), false)
    const env = { TOEGESTANE_HOSTS: ' Test.example , ,andere.example' }
    assert.equal(hostToegestaan(env, 'test.example'), true)
    assert.equal(hostToegestaan(env, 'andere.example'), true)
    assert.equal(hostToegestaan(env, 'mariellemadern.nl'), true)
    assert.equal(hostToegestaan(env, 'derde.example'), false)
    // Met de variabele gezet werkt een bewust toegevoegd adres wel (voor zichzelf: Origin en Turnstile-hostname)
    const adres = 'https://test.example'
    const request = new Request(adres + '/api/bladmuziek', {
      method: 'POST',
      headers: { origin: adres, 'content-type': 'application/json' },
      body: JSON.stringify(GOED),
    })
    const goed = await run(
      request,
      { ...maakOmgeving(), TOEGESTANE_HOSTS: 'test.example' },
      maakFetch({ turnstile: { success: true, hostname: 'test.example', action: ACTIE } }),
    )
    assert.equal(goed.status, 200)
  })
  test('TOEGESTANE_HOSTS is een exacte vergelijking: geen wildcard en geen suffixmatch (preview blijft geweigerd)', async () => {
    const env = { TOEGESTANE_HOSTS: 'mariellemadern.mmadern.workers.dev' }
    // Het hoofdadres van de Worker staat er bewust in (besluit eigenaar), de preview-adressen niet
    assert.equal(hostToegestaan(env, 'mariellemadern.mmadern.workers.dev'), true)
    assert.equal(hostToegestaan(env, 'preview-pr-35-mariellemadern.mmadern.workers.dev'), false)
    assert.equal(hostToegestaan(env, 'x.mariellemadern.mmadern.workers.dev'), false)
    assert.equal(hostToegestaan(env, 'mmadern.workers.dev'), false)
    assert.equal(
      hostToegestaan(
        { TOEGESTANE_HOSTS: '*.mmadern.workers.dev' },
        'preview-pr-35-mariellemadern.mmadern.workers.dev',
      ),
      false,
    )
    const preview = 'https://preview-pr-35-mariellemadern.mmadern.workers.dev'
    const request = new Request(preview + '/api/bladmuziek', {
      method: 'POST',
      headers: { origin: preview, 'content-type': 'application/json' },
      body: JSON.stringify(GOED),
    })
    const gesperd = await run(
      request,
      { ...maakOmgeving(), ...env },
      maakFetch({
        turnstile: {
          success: true,
          hostname: 'preview-pr-35-mariellemadern.mmadern.workers.dev',
          action: ACTIE,
        },
      }),
    )
    assert.equal(gesperd.status, 403)
    assert.equal(gesprekken.length, 0)
    // En het hoofdadres zelf werkt wel
    const hoofd = 'https://mariellemadern.mmadern.workers.dev'
    const goed = await run(
      new Request(hoofd + '/api/bladmuziek', {
        method: 'POST',
        headers: { origin: hoofd, 'content-type': 'application/json' },
        body: JSON.stringify(GOED),
      }),
      { ...maakOmgeving(), ...env },
      maakFetch({
        turnstile: { success: true, hostname: 'mariellemadern.mmadern.workers.dev', action: ACTIE },
      }),
    )
    assert.equal(goed.status, 200)
  })
  test('wrangler.jsonc: de variabele TOEGESTANE_HOSTS staat daar (niet in het dashboard) en is precies het hoofdadres', () => {
    // wrangler.jsonc heeft commentaarregels; haal ze weg en lees de rest als JSON
    const tekst = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf-8')
    const config = JSON.parse(
      tekst
        .split('\n')
        .filter((regel) => !/^\s*\/\//.test(regel))
        .join('\n'),
    )
    assert.equal(config.vars?.TOEGESTANE_HOSTS, 'mariellemadern.mmadern.workers.dev')
    const env = { TOEGESTANE_HOSTS: config.vars.TOEGESTANE_HOSTS }
    assert.equal(hostToegestaan(env, 'mariellemadern.mmadern.workers.dev'), true)
    assert.equal(hostToegestaan(env, 'www.mariellemadern.nl'), true)
    assert.equal(hostToegestaan(env, 'mariellemadern.nl'), true)
    assert.equal(hostToegestaan(env, 'preview-pr-35-mariellemadern.mmadern.workers.dev'), false)
    // Geen wildcard en geen geheimen in het bestand
    assert.ok(!String(config.vars.TOEGESTANE_HOSTS).includes('*'))
    // Alleen de twee gewone variabelen (het contactformulier staat aan: CONTACT_AAN is precies 'aan')
    assert.deepEqual(Object.keys(config.vars), ['TOEGESTANE_HOSTS', 'CONTACT_AAN'])
    assert.equal(config.vars.CONTACT_AAN, 'aan')
  })
  test('niet-toegestaan adres zonder secrets: 403 (de hostcontrole komt vóór de 503)', async () => {
    const adres = 'https://mariellemadern.mmadern.workers.dev'
    const request = new Request(adres + '/api/bladmuziek', {
      method: 'POST',
      headers: { origin: adres, 'content-type': 'application/json' },
      body: JSON.stringify(GOED),
    })
    assert.equal((await run(request, {})).status, 403)
  })
  test('Turnstile onbereikbaar: 503', async () => {
    const res = await run(verzoek(GOED), maakOmgeving(), async () => {
      throw new Error('netwerk')
    })
    assert.equal(res.status, 503)
  })
  test('limiet per adres bereikt: 429 met Retry-After, geen mail', async () => {
    const env = maakOmgeving({ limiet: false })
    const res = await run(verzoek(GOED), env)
    assert.equal(res.status, 429)
    assert.equal(res.headers.get('retry-after'), '60')
    assert.equal(resendAanroepen().length, 0)
  })
  test('limiet per IP-adres bereikt: 429 en de andere limieten tellen niet mee', async () => {
    const env = maakOmgeving({ ipLimiet: false })
    const res = await run(verzoek(GOED), env)
    assert.equal(res.status, 429)
    assert.deepEqual(env.LIMIET_ADRES.keys, [])
    assert.deepEqual(env.LIMIET_ALGEMEEN.keys, [])
    assert.equal(resendAanroepen().length, 0)
  })
  test('de IP-sleutel is een hash, hangt van het IP af en bevat het IP niet', async () => {
    const env = maakOmgeving()
    const metIp = (ip) =>
      new Request(SITE + '/api/bladmuziek', {
        method: 'POST',
        headers: { origin: SITE, 'content-type': 'application/json', 'cf-connecting-ip': ip },
        body: JSON.stringify(GOED),
      })
    await run(metIp('192.0.2.7'), env)
    await run(metIp('192.0.2.7'), env)
    await run(metIp('192.0.2.8'), env)
    const [a, b, c] = env.LIMIET_IP.keys
    assert.match(a, /^[0-9a-f]{64}$/)
    assert.equal(a, b)
    assert.notEqual(a, c)
    assert.ok(!a.includes('192') && !a.includes('.'))
  })
  test('de sleutel van de limiet is een hash, niet het adres', async () => {
    const env = maakOmgeving()
    await run(verzoek({ ...GOED, email: 'Test@Example.org' }), env)
    const sleutel = env.LIMIET_ADRES.keys[0]
    assert.match(sleutel, /^[0-9a-f]{64}$/)
    assert.ok(!sleutel.includes('@'))
    // hoofdletters tellen niet mee: hetzelfde adres geeft dezelfde sleutel
    await run(verzoek({ ...GOED, email: 'test@example.org' }), env)
    assert.equal(env.LIMIET_ADRES.keys[0], env.LIMIET_ADRES.keys[1])
  })
  test('geen bestand in de bucket: 404 en geen mail', async () => {
    const res = await run(verzoek(GOED), maakOmgeving({ bestand: false }))
    assert.equal(res.status, 404)
    assert.equal((await json(res)).fout, 'geen_bestand')
    assert.equal(resendAanroepen().length, 0)
  })
})

describe('versturen', () => {
  test('gelukt: één mail aan de bezoeker met de pdf als bijlage', async () => {
    const env = maakOmgeving()
    const res = await run(verzoek(GOED), env)
    assert.equal(res.status, 200)
    assert.deepEqual(await json(res), { ok: true, nieuwsbriefVerstuurd: false })
    assert.deepEqual(env.BLADMUZIEK.sleutels, ['bladmuziek/hart-van-glas.pdf'])
    const mails = resendAanroepen()
    assert.equal(mails.length, 1)
    assert.equal(mails[0].init.headers.authorization, 'Bearer proef-sleutel')
    const body = JSON.parse(mails[0].init.body)
    assert.equal(body.from, 'Mariëlle Madern <hallo@mariellemadern.nl>')
    assert.deepEqual(body.to, ['test@example.org'])
    assert.equal(body.subject, 'De bladmuziek van Hart van glas')
    assert.equal(body.attachments.length, 1)
    assert.equal(body.attachments[0].filename, 'bladmuziek-hart-van-glas.pdf')
    assert.equal(Buffer.from(body.attachments[0].content, 'base64').toString(), '%PDF-1.4\n')
    assert.match(body.text, /^Dag Proefpersoon Verzonnen,/)
    // Mariëlle sluit haar mails af met 'Liefs,' (platte tekst en HTML)
    assert.match(body.text, /\n\nLiefs,\n\nMariëlle Madern$/)
    assert.match(body.html, /<p>Liefs,<\/p>\n<p>Mariëlle Madern<\/p>$/)
    assert.doesNotMatch(body.text + body.html, /Hartelijke groet/)
  })
  test('Turnstile krijgt het geheim en het token, niet het adres van de bezoeker', async () => {
    await run(verzoek(GOED))
    const t = gesprekken.find((g) => g.url.includes('turnstile'))
    const velden = Object.fromEntries(t.init.body)
    assert.deepEqual(Object.keys(velden).sort(), ['response', 'secret'])
  })
  test('met nieuwsbrief: een tweede mail aan Mariëlle met naam en adres', async () => {
    const res = await run(verzoek({ ...GOED, nieuwsbrief: true }))
    assert.deepEqual(await json(res), { ok: true, nieuwsbriefVerstuurd: true })
    const mails = resendAanroepen().map((g) => JSON.parse(g.init.body))
    assert.equal(mails.length, 2)
    assert.deepEqual(mails[1].to, ['hallo@mariellemadern.nl'])
    assert.equal(mails[1].reply_to, 'test@example.org')
    assert.equal(mails[1].subject, 'Bladmuziek aangevraagd: Hart van glas')
    assert.match(mails[1].text, /Naam: Proefpersoon Verzonnen/)
    assert.match(mails[1].text, /Nieuwsbrief aangevinkt: ja/)
    assert.equal(mails[1].attachments, undefined)
  })
  test('nieuwsbrief aangevinkt maar de tweede mail mislukt: de bezoeker krijgt de bladmuziek wel', async () => {
    const res = await run(
      verzoek({ ...GOED, nieuwsbrief: true }),
      maakOmgeving(),
      maakFetch({ resend: [200, 500] }),
    )
    assert.deepEqual(await json(res), { ok: true, nieuwsbriefVerstuurd: false })
  })
  test('een naam met HTML of regeleinden komt niet in de mail aan de bezoeker: alleen Dag,', async () => {
    await run(verzoek({ ...GOED, naam: '<b>Proef</b>\r\nBcc: x@example.org' }))
    const body = JSON.parse(resendAanroepen()[0].init.body)
    assert.match(body.text, /^Dag,\n\n/)
    assert.match(body.html, /^<p>Dag,<\/p>/)
    assert.ok(
      !body.html.includes('<b>') && !body.html.includes('Proef') && !body.html.includes('Bcc'),
    )
    assert.ok(!body.text.includes('\r'))
  })
  test('Resend: daglimiet of maandlimiet geeft 503, een andere fout 502', async () => {
    assert.equal(
      (await run(verzoek(GOED), maakOmgeving(), maakFetch({ resend: [429] }))).status,
      503,
    )
    assert.equal(
      (await run(verzoek(GOED), maakOmgeving(), maakFetch({ resend: [500] }))).status,
      502,
    )
  })
})

describe('privacy', () => {
  test('geen naam of adres in antwoorden of in wat de Worker logt', async () => {
    const naam = 'Proefpersoon Verzonnen'
    const email = 'test@example.org'
    const ip = '192.0.2.7'
    const antwoorden = []
    for (const body of [
      GOED,
      { ...GOED, nieuwsbrief: true },
      { ...GOED, email: 'kapot' },
      { ...GOED, nummer: 'bestaat-niet' },
    ]) {
      antwoorden.push(await (await run(verzoek(body))).text())
    }
    antwoorden.push(
      await (await run(verzoek(GOED), maakOmgeving(), maakFetch({ resend: [500] }))).text(),
    )
    antwoorden.push(await (await run(verzoek(GOED), maakOmgeving({ limiet: false }))).text())
    for (const tekst of [...antwoorden, ...logregels]) {
      assert.ok(!tekst.includes(naam) && !tekst.includes(email) && !tekst.includes(ip), tekst)
    }
    assert.deepEqual(logregels, [])
  })
  test('antwoorden zijn niet te bewaren en niet te indexeren', async () => {
    const res = await run(verzoek(GOED))
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('x-robots-tag'), 'noindex')
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  })
})

describe('aanhef van de mail met de bladmuziek', () => {
  test("gewone namen staan in de aanhef: 'Dag <naam>,'", () => {
    for (const naam of [
      'Anna',
      'Anna-Marie',
      'Zoë',
      "O'Neil",
      'O’Neil',
      'Jan de Vries',
      'Şebnem Çelik',
      'Łukasz',
      'José  Maria',
      '  Anna  ',
    ]) {
      const verwacht = naam.trim().replace(/ {2,}/g, ' ')
      assert.equal(veiligeNaam(naam), verwacht, naam)
      const mail = mailBezoeker({ naam, titel: 'Spiegel', nieuwsbrief: false })
      assert.match(
        mail.text,
        new RegExp(`^Dag ${verwacht.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},\n\n`),
        naam,
      )
    }
    // een naam met een los accent (e + combinerend teken) telt ook als letters
    assert.equal(veiligeNaam('Zoe\u0308'), 'Zoe\u0308')
  })

  test("al het andere geeft 'Dag,' zonder naam", () => {
    for (const naam of [
      'anna@voorbeeld.nl',
      'http://x.nl',
      'www.x.nl',
      'Anna <b>',
      '<script>alert(1)</script>',
      'Anna\nBcc: x',
      'Anna\r\nSubject: x',
      'Anna\tJansen',
      'Anna 2',
      '2Pac',
      'Anna (Jansen)',
      'Anna, Jansen',
      'Anna: Jansen',
      'x'.repeat(41),
      'Jan ' + 'x'.repeat(37),
      '',
      '   ',
      '-',
      "'",
      '- -',
      '1234',
      'Anna\u00a0Jansen',
      'Anna\u0000',
      null,
      undefined,
    ]) {
      assert.equal(veiligeNaam(naam), null, JSON.stringify(naam))
      const mail = mailBezoeker({ naam, titel: 'Spiegel', nieuwsbrief: false })
      assert.match(mail.text, /^Dag,\n\n/, JSON.stringify(naam))
      assert.match(mail.html, /^<p>Dag,<\/p>/, JSON.stringify(naam))
    }
  })

  test('de grens ligt op 40 tekens (na trimmen en dubbele spaties samenvoegen)', () => {
    assert.equal(veiligeNaam('x'.repeat(40)), 'x'.repeat(40))
    assert.equal(veiligeNaam('x'.repeat(41)), null)
    assert.equal(veiligeNaam('  ' + 'x'.repeat(40) + '  '), 'x'.repeat(40))
    assert.equal(
      veiligeNaam('x'.repeat(19) + '     ' + 'x'.repeat(20)),
      'x'.repeat(19) + ' ' + 'x'.repeat(20),
    ) // 40 na samenvoegen
    // tekens tellen, geen bytes: 40 letters met accenten en 40 emoji-letters
    assert.equal(veiligeNaam('é'.repeat(40)), 'é'.repeat(40))
    assert.equal(veiligeNaam('😀'.repeat(3)), null)
  })

  test('platte tekst en HTML hebben dezelfde aanhef; een apostrof wordt in de HTML veilig gemaakt', () => {
    const mail = mailBezoeker({ naam: "O'Neil", titel: 'Spiegel', nieuwsbrief: false })
    assert.match(mail.text, /^Dag O'Neil,\n\n/)
    assert.match(mail.html, /^<p>Dag O&#39;Neil,<\/p>/)
  })
})
