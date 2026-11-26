<script setup lang="ts">
import { kanalen } from '~/data/kanalen'

// De kop en de regel van de strook 'Nieuwsbrief' (design/teksten-nieuwsbrief.md, sectie 1). Ze staan hier en niet in
// nieuwsbrief-teksten.ts: de voet staat op elke pagina en mag geen code van het formulier meetrekken (de teksten van het
// formulier laden pas mee als het formulier in beeld komt).
const NIEUWSBRIEF_KOP = 'Nieuwsbrief'
const NIEUWSBRIEF_REGEL =
  'Met de nieuwsbrief hou ik je op de hoogte van nieuwe muziek en activiteiten.'
const { data: home } = await useAsyncData('voet-home', () =>
  queryCollection('home').select('voetlijst').first(),
)
const { data: nummers } = await useAsyncData('voet-nummers', () =>
  queryCollection('nummers').select('path', 'title').all(),
)

// Volgorde van de nummers staat in content/home.yml
const lijst = computed(() =>
  (home.value?.voetlijst ?? []).flatMap((slug) => {
    const n = (nummers.value ?? []).find((x) => x.path.endsWith(`/${slug}`))
    return n ? [n] : []
  }),
)

// Het jaartal in de voet. De pagina's worden bij het bouwen gemaakt, dus 'nu' is dan de dag van de bouw: zonder
// nieuwe uitrol in januari bleef het oude jaar staan. Server en browser beginnen allebei met het bouwjaar (het
// tijdstip van de bouw staat in de gegevens van de pagina, dus geen verschil bij het laden); na het laden springt
// het naar het huidige jaar.
const bouwjaar = new Date(useNuxtApp().payload.prerenderedAt ?? Date.now()).getFullYear()
const jaar = ref(bouwjaar)
onMounted(() => {
  jaar.value = new Date().getFullYear()
})
</script>

<template>
  <footer class="voet">
    <!-- De strook 'Nieuwsbrief' bovenin de voet, op elke pagina (design/nieuwsbrief-aanmelden.md). Het formulier ontwaakt pas
         als de strook in beeld komt (hydrate-on-visible) en wordt niet vooraf geladen. -->
    <section class="voet__nieuwsbrief" aria-labelledby="voet-nieuwsbrief">
      <div class="voet__nieuwsbrief-tekst">
        <h2 id="voet-nieuwsbrief" class="voet__kop">{{ NIEUWSBRIEF_KOP }}</h2>
        <p>{{ NIEUWSBRIEF_REGEL }}</p>
      </div>
      <LazyNieuwsbriefFormulier
        hydrate-on-visible
        class="voet__nieuwsbrief-formulier"
        labelledby="voet-nieuwsbrief"
      />
    </section>

    <div class="voet__binnen">
      <nav aria-labelledby="voet-snel">
        <h2 id="voet-snel" class="voet__kop">Snel naar</h2>
        <ul class="voet__lijst">
          <li><NuxtLink to="/over-mij/">Over mij</NuxtLink></li>
          <li><NuxtLink to="/over-de-muziek/">Over de muziek</NuxtLink></li>
          <li><NuxtLink to="/contact/">Contact</NuxtLink></li>
        </ul>
      </nav>

      <nav aria-labelledby="voet-muziek">
        <h2 id="voet-muziek" class="voet__kop">De muziek die ik maak</h2>
        <ul class="voet__lijst">
          <li v-for="nummer in lijst" :key="nummer.path">
            <NuxtLink :to="`${nummer.path}/`">{{ nummer.title }}</NuxtLink>
          </li>
        </ul>
      </nav>

      <div>
        <h2 class="voet__kop">Neem contact op</h2>
        <p>
          <a class="voet__mail" href="mailto:hallo@mariellemadern.nl">hallo@mariellemadern.nl</a>
        </p>
      </div>

      <nav aria-labelledby="voet-volg">
        <h2 id="voet-volg" class="voet__kop">Volg mij</h2>
        <ul class="voet__iconen">
          <li v-for="kanaal in kanalen" :key="kanaal.naam">
            <a :href="kanaal.link" :aria-label="kanaal.naam">
              <Icoon :naam="kanaal.icoon" />
            </a>
          </li>
        </ul>
      </nav>
    </div>

    <div class="voet__onder">
      <p>Copyright {{ jaar }} Mariëlle Madern - alle rechten voorbehouden</p>
      <nav aria-label="Privacy en contact">
        <NuxtLink to="/privacy/">Privacy</NuxtLink>
        <span aria-hidden="true"> • </span>
        <NuxtLink to="/contact/">Contact</NuxtLink>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
.voet {
  background: var(--achtergrond-zacht);
  padding-block: 5rem 3rem;
}

.voet__nieuwsbrief,
.voet__binnen,
.voet__onder {
  inline-size: min(100% - 2.5rem, 68.75rem);
  margin-inline: auto;
}

/* De strook 'Nieuwsbrief': 32 px ruimte en een lijn van 1 px lichtgoud eronder, even breed als de voetkolommen. Vanaf
   1024 px links de kop en de regel en rechts het formulier (gelijk met de vier voetkolommen), eronder onder elkaar. */
.voet__nieuwsbrief {
  display: grid;
  gap: 1rem;
  padding-block-end: 2rem;
  margin-block-end: 2rem;
  border-block-end: 1px solid var(--kleur-lichtgoud);
}

.voet__nieuwsbrief-tekst p {
  margin: 0;
}

/* Op een tablet is het formulier niet breder dan de tekstkolom (600 px), zoals in het ontwerp */
.voet__nieuwsbrief-formulier {
  max-inline-size: 37.5rem;
}

@media (min-width: 64rem) {
  .voet__nieuwsbrief {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 2.5rem;
  }

  .voet__nieuwsbrief-tekst {
    grid-column: 1 / span 2;
  }

  .voet__nieuwsbrief-formulier {
    grid-column: 3 / span 2;
  }
}

.voet__binnen {
  display: grid;
  gap: 2.5rem;
}

@media (min-width: 40rem) {
  .voet__binnen {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 64rem) {
  .voet__binnen {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.voet__kop {
  margin-block-end: 0.75rem;
  font-size: 1rem;
  font-weight: 500;
}

.voet__lijst,
.voet__iconen {
  margin: 0;
  padding: 0;
  list-style: none;
}

.voet__lijst a,
.voet__mail {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--doel-min);
  color: var(--tekst);
  font-weight: 400;
  text-decoration: none;
  transition: color 100ms;
}

.voet__lijst a:hover,
.voet__mail:hover {
  text-decoration: underline;
}

/* Ingedrukt: de links terracotta diep (4,51:1 op crème), het e-mailadres groen (6,11:1) */
.voet__lijst a:active {
  color: var(--kleur-terracotta-diep);
  text-decoration: underline;
}

/* E-mailadres in terracotta diep: het oorspronkelijke terracotta haalt 3,48:1 op crème */
.voet__mail {
  color: var(--kleur-terracotta-diep);
  text-decoration: underline;
  transition: color 100ms;
}

.voet__mail:active {
  color: var(--kleur-groen);
}

.voet__iconen {
  display: flex;
  flex-wrap: wrap;
}

.voet__iconen a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--doel-min);
  block-size: var(--doel-min);
  color: var(--kleur-terracotta-diep);
  transition:
    color 100ms,
    scale 100ms;
}

.voet__iconen a:active {
  color: var(--kleur-groen);
}

@media (prefers-reduced-motion: no-preference) {
  .voet__iconen a:active {
    scale: 0.94;
  }
}

.voet__onder {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 2rem;
  margin-block-start: 3rem;
  font-size: 0.875rem;
}

.voet__onder p {
  margin: 0;
}

.voet__onder a {
  /* Klikvlak minstens 1,5rem hoog (24 px), anders is de link te klein om te raken */
  display: inline-flex;
  align-items: center;
  min-block-size: 1.5rem;
  color: var(--kleur-terracotta-diep);
}
</style>
