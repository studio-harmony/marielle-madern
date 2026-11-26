// Tests van het losse aanmeldformulier voor de nieuwsbrief (worker/nieuwsbrief.mjs). De database is echte SQLite
// (node:sqlite, zoals D1); Brevo, Turnstile en de limieten zijn nagebootst: er gaat geen echte aanroep weg en er is geen
// echte sleutel nodig. Alle namen, adressen en sleutels zijn verzonnen.
// Draaien: pnpm test:worker
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { behandel } from './api.mjs'
import { SCHEMA } from './opslag.mjs'

const HOSTNAME = 'mariellemadern.nl'
const ACTIE = 'nieuwsbrief'
const NU = new Date('2026-11-24T10:00:00Z')
const GOED = { email: 'test@example.org', token: 'proef' }

let gesprekken
let logregels
let origineel

function maakD1({ fout = null } = {}) {
  const db = new DatabaseSync(':memory:')
  db.exec(SCHEMA)
  return {
    db,
    prepare(sql) {
      if (fout === 'prepare') throw new Error('database kapot')
      const opdracht = db.prepare(sql)
      return {
        bind: (...args) => ({
          run: async () => {
            if (fout === 'run') throw new Error('database kapot')
            return opdracht.run(...args)
          },
        }),
      }
    },
  }
}
const rijen = (d1) =>
  d1.db
    .prepare('SELECT * FROM berichten ORDER BY aangemaakt')
    .all()
    .map((r) => ({ ...r }))

function maakOmgeving({ d1 = maakD1(), aan = true, zonder = [] } = {}) {
  const limiter = (zet = true) => ({
    keys: [],
    async limit({ key }) {
      this.keys.push(key)
      return { success: zet }
    },
  })
  const env = {
    ...(aan ? { NIEUWSBRIEF_AAN: 'aan' } : {}),
    BREVO_API_KEY: 'proef-brevo-sleutel',
    BREVO_LIJST_ID: '4',
    TURNSTILE_SECRET: 'proef-geheim',
    RESEND_API_KEY: 'proef-resend',
    LIMIET_NIEUWSBRIEF_IP: limiter(),
    LIMIET_NIEUWSBRIEF_ADRES: limiter(),
    LIMIET_NIEUWSBRIEF_ALGEMEEN: limiter(),
    // de limieten van de andere formulieren: die mogen hier niet worden gebruikt
    LIMIET_IP: limiter(),
    LIMIET_ADRES: limiter(),
    LIMIET_ALGEMEEN: limiter(),
    ...(d1 ? { BERICHTEN: d1 } : {}),
  }
  for (const k of zonder) delete env[k]
  return env
}

// Nagebootste fetch: Turnstile (met de actie van het eindpunt) en Brevo (een uitkomst per aanroep)
function maakFetch({ actie = ACTIE, turnstile, brevo = [201] } = {}) {
  let n = 0
  return async (url, init) => {
    gesprekken.push({ url: String(url), init })
    if (String(url).includes('turnstile'))
      return new Response(
        JSON.stringify(turnstile ?? { success: true, hostname: HOSTNAME, action: actie }),
      )
    if (String(url).includes('brevo')) {
      const uit = brevo[n++] ?? 201
      if (uit === 'netwerk') throw new Error('geen verbinding')
      const [status, body] = Array.isArray(uit) ? uit : [uit, {}]
      return new Response(status === 204 ? null : JSON.stringify(body), { status })
    }
    throw new Error(`onverwachte aanroep: ${url}`)
  }
}

const verzoek = (
  body,
  { host = HOSTNAME, methode = 'POST', type = 'application/json', pad = '/api/nieuwsbrief' } = {},
) =>
  new Request(`https://${host}${pad}`, {
    method: methode,
    headers: { origin: `https://${host}`, 'content-type': type, 'cf-connecting-ip': '192.0.2.7' },
    ...(methode === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  })
const run = (body = GOED, env = maakOmgeving(), opties = {}, extra = {}, vopties = {}) =>
  behandel(verzoek(body, vopties), env, {
    lijst: {},
    fetch: maakFetch(opties),
    nu: () => NU,
    ...extra,
  })
const brevoGesprekken = () => gesprekken.filter((g) => g.url.includes('brevo'))
const json = (res) => res.json()

beforeEach(() => {
  gesprekken = []
  logregels = []
  origineel = { log: console.log, error: console.error, warn: console.warn }
  for (const k of ['log', 'error', 'warn']) console[k] = (...a) => logregels.push(a.join(' '))
})
afterEach(() => Object.assign(console, origineel))

describe('routes, uit en de hostcontrole', () => {
  test('GET: 405', async () => {
    assert.equal((await run(null, maakOmgeving(), {}, {}, { methode: 'GET' })).status, 405)
  })
  test('staat standaard UIT: zonder NIEUWSBRIEF_AAN geeft het eindpunt 503 en doet niets', async () => {
    const res = await run(GOED, maakOmgeving({ aan: false }))
    assert.equal(res.status, 503)
    assert.equal((await json(res)).fout, 'uitgeschakeld')
    assert.equal(gesprekken.length, 0)
  })
  test('NIEUWSBRIEF_AAN moet precies "aan" zijn', async () => {
    for (const waarde of ['ja', '', 'AAN', 'true']) {
      const env = { ...maakOmgeving(), NIEUWSBRIEF_AAN: waarde }
      assert.equal((await run(GOED, env)).status, 503, waarde)
    }
  })
  test('zonder sleutel, lijstnummer, secret of limieten: 503 en niets verzonden', async () => {
    for (const weg of [
      'BREVO_API_KEY',
      'BREVO_LIJST_ID',
      'TURNSTILE_SECRET',
      'LIMIET_NIEUWSBRIEF_IP',
      'LIMIET_NIEUWSBRIEF_ADRES',
      'LIMIET_NIEUWSBRIEF_ALGEMEEN',
    ]) {
      gesprekken = []
      const res = await run(GOED, maakOmgeving({ zonder: [weg] }))
      assert.equal(res.status, 503, weg)
      assert.equal(gesprekken.length, 0, weg)
    }
    assert.equal((await run(GOED, { ...maakOmgeving(), BREVO_LIJST_ID: 'vier' })).status, 503)
  })
  test('een andere hostname: 403, vóór de 503 (ook als het eindpunt uit staat)', async () => {
    assert.equal(
      (
        await run(
          GOED,
          maakOmgeving(),
          {},
          {},
          { host: 'preview-pr-1-mariellemadern.mmadern.workers.dev' },
        )
      ).status,
      403,
    )
    assert.equal(
      (await run(GOED, maakOmgeving({ aan: false }), {}, {}, { host: 'voorbeeld.example' })).status,
      403,
    )
  })
  test('te groot of geen JSON: geweigerd, en niets verzonden', async () => {
    const groot = await run({ ...GOED, voornaam: 'x'.repeat(3000) })
    assert.equal(groot.status, 413)
    const geenJson = await run('<b>', maakOmgeving(), {}, {}, { type: 'text/plain' })
    assert.ok(geenJson.status >= 400 && geenJson.status < 500)
    assert.equal(gesprekken.length, 0)
  })
})

describe('invoer en misbruik', () => {
  test('geen of ongeldig adres: 400 bij het veld email, niets verzonden', async () => {
    for (const email of [
      undefined,
      '',
      'kapot',
      'a@b',
      'x'.repeat(250) + '@example.org',
      12,
      null,
      ['a@example.org'],
    ]) {
      gesprekken = []
      const res = await run({ ...GOED, email })
      assert.equal(res.status, 400, String(email))
      assert.deepEqual(await json(res), { fout: 'ongeldig', veld: 'email' })
      assert.equal(gesprekken.length, 0)
    }
  })
  test('zonder token: 400 controle_mislukt', async () => {
    const res = await run({ email: GOED.email })
    assert.equal(res.status, 400)
    assert.equal((await json(res)).fout, 'controle_mislukt')
  })
  test('honeypot gevuld: 200 en niets gedaan (ook niet opgeslagen)', async () => {
    const env = maakOmgeving()
    const res = await run({ ...GOED, website: 'http://spam.example' }, env)
    assert.deepEqual(await json(res), { ok: true })
    assert.equal(gesprekken.length, 0)
    assert.equal(rijen(env.BERICHTEN).length, 0)
  })
  test('Turnstile: een token voor een andere actie of hostname wordt geweigerd', async () => {
    for (const turnstile of [
      { success: true, hostname: HOSTNAME, action: 'bladmuziek' },
      { success: true, hostname: HOSTNAME, action: 'contact' },
      { success: true, hostname: 'anders.example', action: ACTIE },
      { success: false },
    ]) {
      gesprekken = []
      const res = await run(GOED, maakOmgeving(), { turnstile })
      assert.equal(res.status, 400, JSON.stringify(turnstile))
      assert.equal((await json(res)).fout, 'controle_mislukt')
      assert.equal(brevoGesprekken().length, 0)
    }
  })
  test('Turnstile krijgt alleen het geheim en het token, niet het adres', async () => {
    await run(GOED)
    const t = gesprekken.find((g) => g.url.includes('turnstile'))
    assert.deepEqual(Object.keys(Object.fromEntries(t.init.body)).sort(), ['response', 'secret'])
  })
  test('limieten: eigen bindingen (de andere formulieren tellen niet mee), 429 met retry-after, adres in kleine letters', async () => {
    const env = maakOmgeving()
    await run({ ...GOED, email: 'Test@Example.org' }, env)
    await run({ ...GOED, email: 'test@example.org' }, env)
    assert.equal(env.LIMIET_NIEUWSBRIEF_ADRES.keys[0], env.LIMIET_NIEUWSBRIEF_ADRES.keys[1])
    assert.equal(env.LIMIET_NIEUWSBRIEF_IP.keys.length, 2)
    assert.equal(env.LIMIET_NIEUWSBRIEF_ALGEMEEN.keys.length, 2)
    for (const andere of ['LIMIET_IP', 'LIMIET_ADRES', 'LIMIET_ALGEMEEN'])
      assert.deepEqual(env[andere].keys, [])
    // het IP-adres en het e-mailadres staan niet leesbaar in een sleutel
    for (const k of [...env.LIMIET_NIEUWSBRIEF_IP.keys, ...env.LIMIET_NIEUWSBRIEF_ADRES.keys])
      assert.ok(!k.includes('192.0.2.7') && !k.includes('example.org'), k)
    for (const welke of [
      'LIMIET_NIEUWSBRIEF_IP',
      'LIMIET_NIEUWSBRIEF_ADRES',
      'LIMIET_NIEUWSBRIEF_ALGEMEEN',
    ]) {
      gesprekken = []
      const e = maakOmgeving()
      e[welke] = {
        async limit() {
          return { success: false }
        },
      }
      const res = await run(GOED, e)
      assert.equal(res.status, 429, welke)
      assert.equal(res.headers.get('retry-after'), '60')
      assert.equal(brevoGesprekken().length, 0, welke)
    }
  })
})

describe('aanmelden bij Brevo', () => {
  test('alleen het adres: één aanroep met adres, lijst 4, bron en dag; geen mail aan iemand', async () => {
    const res = await run()
    assert.equal(res.status, 200)
    assert.deepEqual(await json(res), { ok: true })
    assert.equal(brevoGesprekken().length, 1)
    const [b] = brevoGesprekken()
    assert.equal(b.url, 'https://api.brevo.com/v3/contacts')
    assert.equal(b.init.headers['api-key'], 'proef-brevo-sleutel')
    assert.deepEqual(JSON.parse(b.init.body), {
      email: 'test@example.org',
      listIds: [4],
      attributes: { BRON: 'formulier', AANGEMELD_OP: '2026-11-24' },
    })
    // geen mail via Resend (geen bevestiging, geen mail aan Mariëlle)
    assert.equal(gesprekken.filter((g) => g.url.includes('resend')).length, 0)
  })
  test('met voornaam en achternaam: FIRSTNAME en LASTNAME gaan mee, zoals getypt (hoofdletters blijven)', async () => {
    await run({ ...GOED, voornaam: 'Marie-Louise', achternaam: "D'Hondt" })
    assert.deepEqual(JSON.parse(brevoGesprekken()[0].init.body).attributes, {
      FIRSTNAME: 'Marie-Louise',
      LASTNAME: "D'Hondt",
      BRON: 'formulier',
      AANGEMELD_OP: '2026-11-24',
    })
  })
  test('gewone namen blijven: accenten, tussenvoegsels, een typografische apostrof, dubbele spaties en spaties eromheen', async () => {
    const gevallen = [
      ['Zoë', 'van der Berg', 'Zoë', 'van der Berg'],
      ['Şebnem', 'Çelik', 'Şebnem', 'Çelik'],
      ['Łukasz', 'D’Hondt', 'Łukasz', 'D’Hondt'],
      ['  Jan  ', ' de   Vries ', 'Jan', 'de Vries'],
    ]
    for (const [voornaam, achternaam, f, l] of gevallen) {
      gesprekken = []
      await run({ ...GOED, voornaam, achternaam })
      const a = JSON.parse(brevoGesprekken()[0].init.body).attributes
      assert.equal(a.FIRSTNAME, f)
      assert.equal(a.LASTNAME, l)
    }
  })
  test('ongeldige namen worden weggelaten en blokkeren de aanmelding nooit (zelfde antwoord, geen hint)', async () => {
    const slecht = [
      'anna@voorbeeld.nl',
      'http://kwaad.example',
      'www.kwaad.example',
      'Anna <b>',
      'Anna 2',
      'Anna (Jansen)',
      'J.P.',
      'Anna\r\nBcc: x@example.org',
      '-',
      '1234',
      'x'.repeat(61),
      12,
      null,
      { naam: 'Anna' },
      ['Anna'],
      '',
    ]
    const vergelijk = await json(await run())
    for (const naam of slecht) {
      gesprekken = []
      const res = await run({ ...GOED, voornaam: naam, achternaam: naam })
      assert.equal(res.status, 200, JSON.stringify(naam))
      assert.deepEqual(await json(res), vergelijk)
      const a = JSON.parse(brevoGesprekken()[0].init.body).attributes
      assert.equal(a.FIRSTNAME, undefined, JSON.stringify(naam))
      assert.equal(a.LASTNAME, undefined, JSON.stringify(naam))
      assert.equal(a.BRON, 'formulier')
    }
  })
  test('de grens: precies 60 tekens mag, 61 niet; alleen de achternaam of alleen de voornaam kan ook', async () => {
    await run({ ...GOED, voornaam: 'a'.repeat(60) })
    assert.equal(JSON.parse(brevoGesprekken()[0].init.body).attributes.FIRSTNAME.length, 60)
    gesprekken = []
    await run({ ...GOED, achternaam: 'b'.repeat(61) })
    assert.equal(JSON.parse(brevoGesprekken()[0].init.body).attributes.LASTNAME, undefined)
    gesprekken = []
    await run({ ...GOED, achternaam: 'Jansen' })
    const a = JSON.parse(brevoGesprekken()[0].init.body).attributes
    assert.equal(a.FIRSTNAME, undefined)
    assert.equal(a.LASTNAME, 'Jansen')
  })
  test('een bestaand adres geeft hetzelfde antwoord; de PUT zet alleen de lijst (de eerste naam blijft)', async () => {
    const nieuw = await json(await run({ ...GOED, voornaam: 'Anna' }))
    gesprekken = []
    const res = await run({ ...GOED, voornaam: 'Iemand' }, maakOmgeving(), {
      brevo: [[400, { code: 'duplicate_parameter' }], 204],
    })
    assert.equal(res.status, 200)
    assert.deepEqual(await json(res), nieuw)
    const [post, put] = brevoGesprekken()
    assert.equal(put.init.method, 'PUT')
    assert.equal(put.url, 'https://api.brevo.com/v3/contacts/test%40example.org')
    assert.deepEqual(JSON.parse(put.init.body), { listIds: [4] })
    assert.ok(post)
  })
  test('een attribuut dat in Brevo ontbreekt: eerst zonder BRON en AANGEMELD_OP (de namen blijven), dan zonder attributen', async () => {
    const res = await run({ ...GOED, voornaam: 'Anna', achternaam: 'Jansen' }, maakOmgeving(), {
      brevo: [[400, { code: 'invalid_parameter' }], [400, { code: 'invalid_parameter' }], 201],
    })
    assert.equal(res.status, 200)
    const body = brevoGesprekken().map((g) => JSON.parse(g.init.body))
    assert.equal(body.length, 3)
    assert.ok(body[0].attributes.BRON)
    assert.deepEqual(body[1].attributes, { FIRSTNAME: 'Anna', LASTNAME: 'Jansen' })
    assert.equal(body[2].attributes, undefined)
  })
  test('Brevo keurt het adres voorgoed af: 400 bij het veld email', async () => {
    const res = await run(GOED, maakOmgeving(), { brevo: [[400, { code: 'missing_parameter' }]] })
    assert.equal(res.status, 400)
    assert.deepEqual(await json(res), { fout: 'ongeldig', veld: 'email' })
  })
})

describe('opslag in D1 (alleen voor een nieuwe poging)', () => {
  test('gelukt: de rij bestaat (soort nieuwsbrief, bron formulier, verzonden) maar adres en namen zijn meteen gewist', async () => {
    const env = maakOmgeving()
    const res = await run({ ...GOED, voornaam: 'Anna', achternaam: 'Jansen' }, env)
    assert.deepEqual(await json(res), { ok: true })
    const [r, ...rest] = rijen(env.BERICHTEN)
    assert.equal(rest.length, 0)
    assert.deepEqual(
      {
        soort: r.soort,
        onderwerp: r.onderwerp,
        dag: r.dag,
        status_hoofd: r.status_hoofd,
        status_tweede: r.status_tweede,
      },
      {
        soort: 'nieuwsbrief',
        onderwerp: 'formulier',
        dag: '2026-11-24',
        status_hoofd: 'verzonden',
        status_tweede: 'nvt',
      },
    )
    assert.deepEqual([r.naam, r.email, r.bericht, r.extra], [null, null, null, null])
    assert.equal(r.pogingen, 1)
  })
  test('afgekeurd: mislukt en meteen gewist', async () => {
    const env = maakOmgeving()
    await run({ ...GOED, voornaam: 'Anna' }, env, { brevo: [[400, { code: 'missing_parameter' }]] })
    const [r] = rijen(env.BERICHTEN)
    assert.equal(r.status_hoofd, 'mislukt')
    assert.deepEqual([r.naam, r.email, r.extra], [null, null, null])
  })
  test('Brevo tijdelijk weg (500, 429, 401, geen verbinding): 200 met later, de rij wacht met adres, voornaam (naam) en achternaam (extra)', async () => {
    for (const uit of [500, 503, 429, 401, 403, 'netwerk']) {
      const env = maakOmgeving()
      const res = await run({ ...GOED, voornaam: 'Anna', achternaam: 'Jansen' }, env, {
        brevo: [uit],
      })
      assert.equal(res.status, 200, String(uit))
      assert.deepEqual(await json(res), { ok: true, later: true })
      const [r] = rijen(env.BERICHTEN)
      assert.equal(r.status_hoofd, 'wacht', String(uit))
      assert.equal(r.email, 'test@example.org')
      assert.equal(r.naam, 'Anna')
      assert.deepEqual(JSON.parse(r.extra), { achternaam: 'Jansen' })
      assert.equal(r.pogingen, 1)
    }
  })
  test('alleen het adres en tijdelijk weg: de namen zijn leeg, extra ook', async () => {
    const env = maakOmgeving()
    await run(GOED, env, { brevo: [500] })
    const [r] = rijen(env.BERICHTEN)
    assert.deepEqual([r.naam, r.extra], [null, null])
  })
  test('zonder database en Brevo tijdelijk weg: 503 (er is niets om later te herhalen)', async () => {
    const res = await run(GOED, maakOmgeving({ d1: null }), { brevo: [500] })
    assert.equal(res.status, 503)
    assert.equal((await json(res)).fout, 'tijdelijk_niet_beschikbaar')
  })
  test('zonder database of met een kapotte database gaat de aanmelding gewoon door', async () => {
    for (const d1 of [null, maakD1({ fout: 'prepare' }), maakD1({ fout: 'run' })]) {
      gesprekken = []
      const res = await run({ ...GOED, voornaam: 'Anna' }, maakOmgeving({ d1 }))
      assert.equal(res.status, 200)
      assert.deepEqual(await json(res), { ok: true })
      assert.equal(brevoGesprekken().length, 1)
    }
    assert.deepEqual(logregels, [])
  })
  test('een kapotte database en Brevo tijdelijk weg: 503', async () => {
    const res = await run(GOED, maakOmgeving({ d1: maakD1({ fout: 'run' }) }), { brevo: [500] })
    assert.equal(res.status, 503)
  })
})

describe('privacy en de configuratie', () => {
  test('geen adres, naam, IP-adres, token of sleutel in een antwoord of in wat de Worker logt', async () => {
    const geheimen = [
      'test@example.org',
      'Proefnaam',
      'Verzonnen',
      '192.0.2.7',
      'proef-brevo-sleutel',
      'proef-geheim',
    ]
    const antwoorden = []
    const body = { ...GOED, voornaam: 'Proefnaam', achternaam: 'Verzonnen' }
    for (const [b, opties, env] of [
      [body, {}, maakOmgeving()],
      [body, { brevo: [500] }, maakOmgeving()],
      [body, { brevo: [[400, { code: 'missing_parameter' }]] }, maakOmgeving()],
      [body, { brevo: [[400, { code: 'duplicate_parameter' }], 204] }, maakOmgeving()],
      [{ ...body, email: 'kapot' }, {}, maakOmgeving()],
      [body, { turnstile: { success: false } }, maakOmgeving()],
    ]) {
      antwoorden.push(await (await run(b, env, opties)).text())
    }
    const limiet = maakOmgeving()
    limiet.LIMIET_NIEUWSBRIEF_IP = {
      async limit() {
        return { success: false }
      },
    }
    antwoorden.push(await (await run(body, limiet)).text())
    for (const tekst of [...antwoorden, ...logregels])
      for (const g of geheimen) assert.ok(!tekst.includes(g), `${g} in ${tekst}`)
    assert.deepEqual(logregels, [])
  })
  test('antwoorden zijn niet te bewaren en niet te indexeren', async () => {
    const res = await run()
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('x-robots-tag'), 'noindex')
  })
  test('wrangler.jsonc: drie eigen limieten met eigen namespace_id; het eindpunt staat aan (NIEUWSBRIEF_AAN is aan, in het bestand); het lijstnummer is 4', () => {
    const tekst = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf-8')
    const config = JSON.parse(
      tekst
        .split('\n')
        .filter((regel) => !/^\s*\/\//.test(regel))
        .join('\n'),
    )
    const nieuw = config.ratelimits.filter((r) => r.name.startsWith('LIMIET_NIEUWSBRIEF_'))
    assert.deepEqual(nieuw.map((r) => r.name).sort(), [
      'LIMIET_NIEUWSBRIEF_ADRES',
      'LIMIET_NIEUWSBRIEF_ALGEMEEN',
      'LIMIET_NIEUWSBRIEF_IP',
    ])
    const ids = config.ratelimits.map((r) => r.namespace_id)
    assert.equal(new Set(ids).size, ids.length, 'namespace_id moet uniek zijn')
    const per = Object.fromEntries(nieuw.map((r) => [r.name, [r.simple.limit, r.simple.period]]))
    assert.deepEqual(per, {
      LIMIET_NIEUWSBRIEF_IP: [3, 60],
      LIMIET_NIEUWSBRIEF_ADRES: [1, 60],
      LIMIET_NIEUWSBRIEF_ALGEMEEN: [10, 60],
    })
    assert.equal(config.vars.NIEUWSBRIEF_AAN, 'aan')
    assert.equal(config.vars.BREVO_LIJST_ID, '4')
  })
})
