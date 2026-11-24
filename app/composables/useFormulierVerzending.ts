// Het versturen van een formulier naar een eindpunt van de Worker, met de toestanden van het formulier: bezig, klaar
// en een melding bij een fout. Dezelfde stappen voor elk formulier (bladmuziek, contact); wat per formulier
// verschilt (de velden, de controle, de body en welke serverfout bij welk veld hoort) geeft het formulier mee.
import type { Ref } from 'vue'

export type Melding = 'teVaak' | 'druk' | 'mis'

interface Opties {
  // Het eindpunt, bijvoorbeeld '/api/bladmuziek'
  pad: string
  turnstile: {
    krijgToken: () => Promise<string>
    nieuwToken: () => void
    ruimOp: () => void
  }
  // Het verborgen veld tegen spam (de waarde komt van het DOM-veld zelf), en de bevestiging die de focus krijgt
  valVeld: Ref<HTMLInputElement | null>
  website: Ref<string>
  bevestiging: Ref<HTMLElement | { $el?: HTMLElement } | null>
  // Controleert de velden; geeft false als er een fout is (de fouten staan dan al bij de velden)
  valideer: () => boolean
  // Zet de focus op het eerste veld met een fout
  naarEersteFout: () => Promise<void>
  // De inhoud van het verzoek
  body: (token: string, val: string) => Record<string, unknown>
  // De server keurde een veld af (400 'ongeldig' met het veld): zet de fout bij dat veld en geef true als het
  // bekend is; false (of een onbekend veld) geeft de algemene melding
  serverVeldFout: (veld: string) => boolean | Promise<boolean>
}

export function useFormulierVerzending(o: Opties) {
  const bezig = ref(false)
  const klaar = ref(false)
  // De Worker nam het bericht aan maar de mail komt later (antwoord 200 met `later: true`)
  const later = ref(false)
  const melding = ref<Melding | null>(null)

  async function verstuur() {
    if (bezig.value) return
    melding.value = null
    // Verborgen veld tegen spam: de waarde komt van het DOM-veld zelf (ook als Vue een invoer niet zag, bijvoorbeeld
    // bij een script dat het veld vult). Is het gevuld, dan versturen we niets en tonen we niets.
    const val = o.valVeld.value?.value ?? o.website.value
    if (val !== '') return
    if (!o.valideer()) return o.naarEersteFout()
    bezig.value = true
    try {
      let t: string
      try {
        t = await o.turnstile.krijgToken()
      } catch {
        melding.value = 'mis'
        return
      }
      const res = await fetch(o.pad, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(o.body(t, val)),
      })
      o.turnstile.nieuwToken()
      if (res.ok) {
        o.turnstile.ruimOp()
        later.value = await res
          .json()
          .then((b) => b?.later === true)
          .catch(() => false)
        klaar.value = true
        await nextTick()
        const b = o.bevestiging.value
        ;((b as { $el?: HTMLElement } | null)?.$el ?? (b as HTMLElement | null))?.focus()
        return
      }
      let fout = ''
      let veld = ''
      try {
        const body = await res.json()
        fout = String(body?.fout ?? '')
        veld = String(body?.veld ?? '')
      } catch {
        // geen JSON: een algemene fout
      }
      if (res.status === 400 && fout === 'ongeldig' && veld && (await o.serverVeldFout(veld))) {
        await o.naarEersteFout()
      } else if (res.status === 429) {
        melding.value = 'teVaak'
      } else if (res.status === 503) {
        melding.value = 'druk'
      } else {
        melding.value = 'mis'
      }
    } catch {
      o.turnstile.nieuwToken()
      melding.value = 'mis'
    } finally {
      bezig.value = false
    }
  }

  return { bezig, klaar, later, melding, verstuur }
}
