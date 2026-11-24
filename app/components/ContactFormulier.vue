<script setup lang="ts">
// Het contactformulier: een algemene vraag of een boeking (design/contactformulier.md). Het verstuurt naar
// POST /api/contact (worker/contact.mjs). Er wordt niets in de browser bewaard: wat de bezoeker invult staat alleen in
// de velden en in dat ene verzoek.
//
// Zelfde bouwstenen als het formulier voor de bladmuziek: Turnstile laadt pas als het formulier wordt gebruikt
// (`useTurnstile`, actie `contact`), het versturen met de toestanden (`useFormulierVerzending`), `FormulierVeld`
// en `FormulierMelding`.
import { BOEKINGSVELDEN, MAIL, TEKSTEN } from '~/contact-teksten'

const T = TEKSTEN
const F = TEKSTEN.fouten

type Fout = 'naamLeeg' | 'emailLeeg' | 'emailOngeldig' | 'berichtLeeg'

const onderwerp = ref<'vraag' | 'boeking'>('vraag')
const naam = ref('')
const email = ref('')
const bericht = ref('')
// Wat bij een boeking is ingevuld blijft bewaard als de bezoeker even terugwisselt, maar gaat alleen mee bij 'Boeking'
const boeking = reactive<Record<string, string>>(
  Object.fromEntries(BOEKINGSVELDEN.map((v) => [v.sleutel, ''])),
)
const website = ref('') // verborgen veld tegen spam: een mens vult het niet in
// Pas na het laden van de pagina (hydratatie) kan het formulier worden gebruikt; tot dan staan de velden uit.
const gereed = ref(false)
const naamFout = ref<Fout | null>(null)
const emailFout = ref<Fout | null>(null)
const berichtFout = ref<Fout | null>(null)

const naamVeld = ref<HTMLInputElement | null>(null)
const emailVeld = ref<HTMLInputElement | null>(null)
const berichtVeld = ref<HTMLTextAreaElement | null>(null)
const bevestiging = ref<HTMLElement | null>(null)
const widgetPlek = ref<HTMLElement | null>(null)
const valVeld = ref<HTMLInputElement | null>(null)

const uitlegId = 'contact-uitleg'

const { controleOpen, laad, krijgToken, nieuwToken, ruimOp } = useTurnstile({
  actie: 'contact',
  plek: widgetPlek,
})

onMounted(() => {
  gereed.value = true
})

const EMAIL_REGEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Een melding bij een veld verdwijnt zodra het veld klopt (niet bij elke toetsaanslag een nieuwe fout tonen)
watch(naam, (v) => {
  if (naamFout.value && v.trim()) naamFout.value = null
})
watch(email, (v) => {
  if (emailFout.value && EMAIL_REGEL.test(v.trim())) emailFout.value = null
})
watch(bericht, (v) => {
  if (berichtFout.value && v.trim()) berichtFout.value = null
})

function controleer(): boolean {
  const e = email.value.trim()
  naamFout.value = naam.value.trim() ? null : 'naamLeeg'
  emailFout.value = !e ? 'emailLeeg' : EMAIL_REGEL.test(e) ? null : 'emailOngeldig'
  berichtFout.value = bericht.value.trim() ? null : 'berichtLeeg'
  return !naamFout.value && !emailFout.value && !berichtFout.value
}

async function naarEersteFout() {
  await nextTick()
  if (naamFout.value) naamVeld.value?.focus()
  else if (emailFout.value) emailVeld.value?.focus()
  else if (berichtFout.value) berichtVeld.value?.focus()
}

const { bezig, klaar, later, melding, verstuur } = useFormulierVerzending({
  pad: '/api/contact',
  turnstile: { krijgToken, nieuwToken, ruimOp },
  valVeld,
  website,
  bevestiging,
  valideer: controleer,
  naarEersteFout,
  body: (token, val) => ({
    onderwerp: onderwerp.value,
    naam: naam.value,
    email: email.value,
    bericht: bericht.value,
    ...(onderwerp.value === 'boeking' ? boeking : {}),
    token,
    website: val,
  }),
  // De server keurde een veld af: de fout staat dan bij dat veld (de boekingsvelden en het onderwerp kunnen niet
  // fout gaan door wat de bezoeker kan intikken: de velden hebben dezelfde maxima als de Worker)
  serverVeldFout: (veld) => {
    if (veld === 'naam') naamFout.value = 'naamLeeg'
    else if (veld === 'email') emailFout.value = 'emailOngeldig'
    else if (veld === 'bericht') berichtFout.value = 'berichtLeeg'
    else return false
    return true
  },
})

// De boekingsvelden in paren (twee kolommen vanaf 768 px)
const paren = BOEKINGSVELDEN.map((_, i) => BOEKINGSVELDEN.slice(i * 2, i * 2 + 2)).filter(
  (p) => p.length,
)
</script>

<template>
  <section class="contact" aria-label="Contactformulier">
    <div v-if="klaar" class="kaart">
      <FormulierMelding ref="bevestiging" soort="goed" role="status" tabindex="-1">
        <p v-if="later">{{ T.bevestigingLater }}</p>
        <div v-else>
          <p class="melding__kop">{{ T.bevestigingKop }}</p>
          <p>{{ T.bevestiging }}</p>
        </div>
      </FormulierMelding>
    </div>

    <form
      v-else
      class="kaart"
      method="post"
      action="/api/contact"
      novalidate
      @submit.prevent="verstuur"
      @focusin="laad"
    >
      <!-- Alleen tekst in noscript (geen elementen): anders klopt de hydratatie niet met wat de browser ziet -->
      <noscript class="kaart__regel">{{ T.zonderScript }}</noscript>
      <!-- Laadt het script niet, dan staat er een formulier dat niets doet: na een paar seconden verschijnt dan
           dezelfde uitleg (alleen CSS, dus geen hydratatieverschil). Is de pagina geladen, dan verdwijnt deze regel. -->
      <p v-if="!gereed" class="kaart__regel zonder-script">{{ T.zonderScript }}</p>

      <fieldset class="keuze">
        <legend class="keuze__kop">{{ T.onderwerp }}</legend>
        <div class="keuze__rijen">
          <label for="contact-onderwerp-vraag" class="keuze__rij">
            <input
              id="contact-onderwerp-vraag"
              v-model="onderwerp"
              class="keuze__invoer"
              type="radio"
              name="onderwerp"
              value="vraag"
              :disabled="!gereed"
            />
            <span>{{ T.vraag }}</span>
          </label>
          <label for="contact-onderwerp-boeking" class="keuze__rij">
            <input
              id="contact-onderwerp-boeking"
              v-model="onderwerp"
              class="keuze__invoer"
              type="radio"
              name="onderwerp"
              value="boeking"
              :disabled="!gereed"
            />
            <span>{{ T.boeking }}</span>
          </label>
        </div>
      </fieldset>

      <div v-if="onderwerp === 'boeking'" class="groep">
        <fieldset class="groep__set" aria-describedby="contact-boeking-regel">
          <legend class="keuze__kop groep__kop">{{ T.boekingKop }}</legend>
          <p id="contact-boeking-regel" class="groep__regel">{{ T.boekingRegel }}</p>
          <div v-for="(paar, i) in paren" :key="i" class="paar">
            <FormulierVeld
              v-for="v in paar"
              :id="`contact-${v.sleutel}`"
              :key="v.sleutel"
              :fout-id="`contact-${v.sleutel}-fout`"
              :label="v.label"
              :hulp="v.hulp"
            >
              <input
                :id="`contact-${v.sleutel}`"
                v-model="boeking[v.sleutel]"
                class="veld__invoer"
                type="text"
                :name="v.sleutel"
                autocomplete="off"
                enterkeyhint="next"
                :maxlength="v.max"
                :disabled="!gereed"
                :aria-describedby="`contact-${v.sleutel}-hulp`"
              />
            </FormulierVeld>
          </div>
        </fieldset>
      </div>

      <FormulierVeld
        id="contact-naam"
        fout-id="contact-naam-fout"
        :label="T.naam"
        :fout="naamFout ? F[naamFout] : null"
      >
        <input
          id="contact-naam"
          ref="naamVeld"
          v-model="naam"
          class="veld__invoer"
          type="text"
          name="naam"
          autocomplete="name"
          enterkeyhint="next"
          maxlength="100"
          required
          :disabled="!gereed"
          :aria-invalid="naamFout ? 'true' : 'false'"
          :aria-describedby="naamFout ? 'contact-naam-fout' : undefined"
        />
      </FormulierVeld>

      <FormulierVeld
        id="contact-email"
        fout-id="contact-email-fout"
        :label="T.email"
        :fout="emailFout ? F[emailFout] : null"
      >
        <input
          id="contact-email"
          ref="emailVeld"
          v-model="email"
          class="veld__invoer"
          type="email"
          name="email"
          autocomplete="email"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="next"
          maxlength="254"
          required
          :disabled="!gereed"
          :aria-invalid="emailFout ? 'true' : 'false'"
          :aria-describedby="emailFout ? 'contact-email-fout' : undefined"
        />
      </FormulierVeld>

      <FormulierVeld
        id="contact-bericht"
        fout-id="contact-bericht-fout"
        :label="T.bericht"
        :fout="berichtFout ? F[berichtFout] : null"
      >
        <textarea
          id="contact-bericht"
          ref="berichtVeld"
          v-model="bericht"
          class="veld__invoer veld__invoer--tekstvak"
          name="bericht"
          maxlength="5000"
          required
          :disabled="!gereed"
          :aria-invalid="berichtFout ? 'true' : 'false'"
          :aria-describedby="berichtFout ? 'contact-bericht-fout' : undefined"
        />
      </FormulierVeld>

      <!-- Verborgen veld tegen spam: niet zichtbaar, niet in de tabvolgorde, niet voorgelezen -->
      <div class="val" aria-hidden="true">
        <label for="contact-website"
          >Website
          <input
            id="contact-website"
            ref="valVeld"
            v-model="website"
            type="text"
            name="website"
            tabindex="-1"
            autocomplete="off"
            :disabled="!gereed"
          />
        </label>
      </div>

      <!-- Hier zet Cloudflare het controlevak neer, alleen als het een controle vraagt -->
      <div ref="widgetPlek" :class="['widget', controleOpen && 'widget--open']" />

      <div role="alert" class="houder">
        <FormulierMelding v-if="melding" soort="fout">
          <p v-if="melding === 'teVaak'">{{ F.teVaak }}</p>
          <p v-else-if="melding === 'druk'">
            {{ F.druk }}<a :href="`mailto:${MAIL}`">{{ MAIL }}</a
            >{{ F.drukNa }}
          </p>
          <p v-else>
            {{ F.mis }}<a :href="`mailto:${MAIL}`">{{ MAIL }}</a
            >{{ F.misNa }}
          </p>
        </FormulierMelding>
      </div>

      <button
        type="submit"
        class="knop kaart__knop"
        :disabled="!gereed"
        :aria-disabled="bezig ? 'true' : undefined"
      >
        <template v-if="bezig">
          <span class="knop__rondje" aria-hidden="true" />{{ T.knopBezig }}
        </template>
        <template v-else>{{ T.knop }}</template>
      </button>

      <p :id="uitlegId" class="kaart__uitleg">
        {{ T.uitlegVoor }}<NuxtLink to="/privacy/">{{ T.uitlegLink }}</NuxtLink
        >{{ T.uitlegNa }}
      </p>
    </form>
  </section>
</template>

<style scoped>
/* De crème kaart: 600 px breed (de tekstkolom), binnenruimte 40 px, op mobiel 24 / 20 */
.kaart {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem 1.25rem;
  border-radius: 1rem;
  background: var(--kleur-creme);
}

@media (min-width: 48rem) {
  .kaart {
    padding: 2.5rem;
  }
}

.kaart__regel,
.kaart__uitleg {
  margin: 0;
}

.kaart__uitleg {
  font-size: var(--tekst-klein);
  line-height: 1.5;
}

.kaart__uitleg a {
  color: var(--link);
  text-underline-offset: 0.15em;
}

/* Het verborgen veld tegen spam */
.val {
  position: absolute;
  inset-inline-start: -10000px;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
}

/* De keuze: gewone keuzerondjes in een fieldset. Elke rij is 44 px hoog en aan te tikken, het rondje is 24 px.
   Op de telefoon onder elkaar, vanaf 768 px naast elkaar. */
.keuze,
.groep__set {
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.keuze__kop {
  padding: 0;
  margin-block-end: 0.5rem;
  font-weight: var(--gewicht-vet);
}

.keuze__rijen {
  display: flex;
  flex-direction: column;
}

@media (min-width: 48rem) {
  .keuze__rijen {
    flex-direction: row;
    gap: 2rem;
  }
}

.keuze__rij {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  min-block-size: var(--doel-min);
  cursor: pointer;
}

.keuze__invoer {
  flex: none;
  inline-size: 1.5rem;
  block-size: 1.5rem;
  margin: 0;
  accent-color: var(--kleur-terracotta-diep);
}

/* De boekingsvelden: een groep tussen twee dunne lijnen. Er is geen beweging van de hoogte: de groep staat er in één
   keer. Zonder 'minder beweging' komt hij zacht in beeld (alleen de doorzichtigheid, 150 ms). */
.groep {
  padding-block: 1rem 1.5rem;
  border-block: 1px solid var(--kleur-lichtgoud);
}

@media (prefers-reduced-motion: no-preference) {
  .groep {
    animation: komt-binnen 150ms ease-out;
  }
}

@keyframes komt-binnen {
  from {
    opacity: 0;
  }
}

.groep__kop {
  margin-block-end: 0.25rem;
}

.groep__regel {
  margin: 0 0 1.25rem;
  font-size: var(--tekst-klein);
  line-height: 1.5;
}

.paar {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.paar + .paar {
  margin-block-start: 1.25rem;
}

/* Vanaf 768 px twee kolommen (elk 250 px bij een kaart van 600 px); label, hulptekst en veld van een paar staan op
   één lijn, ook als de hulpteksten verschillend lang zijn (subgrid, in FormulierVeld) */
@media (min-width: 48rem) {
  .paar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 1.25rem;
  }
}

/* De uitleg bij een formulier dat niet laadt: onzichtbaar en zonder ruimte, en na 6 seconden zichtbaar (alleen als de
   pagina dan nog niet is geladen). Zonder JavaScript staat de noscript-regel er al; dan blijft deze regel weg. */
.zonder-script {
  margin-block-end: -1.25rem;
  block-size: 0;
  overflow: hidden;
  visibility: hidden;
  animation: toon-uitleg 0.01s 6s forwards;
}

@keyframes toon-uitleg {
  to {
    margin-block-end: 0;
    block-size: auto;
    overflow: visible;
    visibility: visible;
  }
}

@media (scripting: none) {
  .zonder-script {
    display: none;
  }
}

/* De melding-houder is er altijd (voor schermlezers) maar neemt geen ruimte als hij leeg is */
.houder:not(:has(.melding)) {
  margin-block-end: -1.25rem;
}

/* Alleen ruimte als Cloudflare een controlevak neerzet */
.widget:not(.widget--open) {
  margin-block-end: -1.25rem;
}

/* De knop is op mobiel zo breed als de kaart */
.kaart__knop {
  inline-size: 100%;
  padding-inline: 1rem;
  border: 0;
  font: inherit;
  cursor: pointer;
}

.kaart__knop[aria-disabled='true'] {
  cursor: progress;
}

@media (min-width: 48rem) {
  .kaart__knop {
    align-self: flex-start;
    inline-size: auto;
    padding-inline: 1.875rem;
  }
}

.knop__rondje {
  inline-size: 1.25rem;
  block-size: 1.25rem;
  margin-inline-end: 0.75rem;
  border: 3px solid rgb(255 255 255 / 0.4);
  border-block-start-color: var(--kleur-wit);
  border-radius: 50%;
  animation: draai 0.9s linear infinite;
}

@keyframes draai {
  to {
    transform: rotate(360deg);
  }
}

/* Voor wie minder beweging wil: het rondje staat stil, de tekst zegt genoeg */
@media (prefers-reduced-motion: reduce) {
  .knop__rondje {
    animation: none;
  }
}
</style>
