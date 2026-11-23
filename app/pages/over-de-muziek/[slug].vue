<script setup lang="ts">
const route = useRoute()
const slug = String(route.params.slug)

const { data: nummer } = await useAsyncData(`nummer-${slug}`, () =>
  queryCollection('nummers').path(`/over-de-muziek/${slug}`).first(),
)

if (!nummer.value) {
  throw createError({ statusCode: 404, statusMessage: 'Nummer niet gevonden', fatal: true })
}

useSeoMeta({
  title: `${nummer.value.title}: liedtekst - Mariëlle Madern`,
  description: nummer.value.description,
})
useNummerDeelafbeelding(slug, nummer.value.title)

// Schema.org: het nummer, met de EP als het daarop staat, en het kruimelpad. Alleen gegevens uit de content:
// geen uitgavedatum en geen origineel nummer, want die zijn nog niet bevestigd.
const { data: uitgave } = await useAsyncData('uitgave-ep-schema', () =>
  queryCollection('uitgaven').select('title', 'nummers').first(),
)
const site = useSiteConfig().url
useSchemaOrg([
  defineMusicRecording(nummerSchema(site, nummer.value, uitgave.value)),
  defineBreadcrumb({
    itemListElement: [
      { name: 'Home', item: `${site}/` },
      { name: 'Over de muziek', item: `${site}/over-de-muziek/` },
      { name: nummer.value.title, item: `${site}${nummer.value.path}/` },
    ],
  }),
])

// Alinea's zijn gescheiden door een lege regel. Een alinea die met “ begint is een citaat.
const alineas = (tekst: string | undefined) => (tekst ?? '').trim().split(/\n\s*\n/)
const verhaal = computed(() => alineas(nummer.value?.verhaal))
const bijzonder = computed(() => alineas(nummer.value?.bijzonder))
const strofen = computed(() => alineas(nummer.value?.liedtekst))

// Vorig en volgend nummer, in dezelfde volgorde als op Over de muziek (zie app/utils/nummer-volgorde.ts); de EP-volgorde
// komt uit dezelfde `uitgave` als het schema hierboven
const { data: alleNummers } = await useAsyncData('nummer-volgorde', () =>
  queryCollection('nummers').select('path', 'title', 'uitgave', 'volgorde').all(),
)
const volgorde = computed(() =>
  nummerVolgorde(alleNummers.value ?? [], uitgave.value?.nummers ?? []),
)
const plek = computed(() => volgorde.value.findIndex((n) => n.path.endsWith(`/${slug}`)))
const vorige = computed(() => (plek.value > 0 ? volgorde.value[plek.value - 1] : undefined))
const volgende = computed(() => (plek.value >= 0 ? volgorde.value[plek.value + 1] : undefined))

// Het formulier voor de bladmuziek: alleen bij een nummer met `bladmuziek: true` (en met een Turnstile-sitesleutel)
const sitekey = useRuntimeConfig().public.turnstileSitekey
const metBladmuziek = computed(() => Boolean(nummer.value?.bladmuziek && sitekey))
const formulier = ref<{ laad: () => void } | null>(null)
</script>

<template>
  <article v-if="nummer">
    <PaginaBanner :titel="nummer.title" kleur="lichtgoud" />

    <div class="sectie">
      <div class="kolom">
        <KopBlok :accent="`Waar gaat ${nummer.title} over`" kop="Het verhaal achter het lied" />
        <div class="tekst">
          <template v-for="(alinea, i) in verhaal" :key="i">
            <blockquote v-if="alinea.startsWith('“')" class="citaat">{{ alinea }}</blockquote>
            <p v-else>{{ alinea }}</p>
          </template>
        </div>
      </div>
    </div>

    <div class="sectie sectie--pil">
      <div class="kolom">
        <div class="pil">
          <Icoon naam="apple" class="pil__noot" />
          <p class="pil__titel">{{ nummer.title }}</p>
          <a
            class="pil__link"
            :href="`https://open.spotify.com/track/${nummer.spotify}`"
            :aria-label="`Luister op Spotify: ${nummer.title}`"
          >
            <Icoon naam="spotify" />
          </a>
          <a
            class="pil__link"
            :href="`https://youtu.be/${nummer.youtube}`"
            :aria-label="`Bekijk op YouTube: ${nummer.title}`"
          >
            <Icoon naam="youtube" />
          </a>
        </div>
        <a v-if="metBladmuziek" class="bladlink" href="#bladmuziek" @click="formulier?.laad()">
          <span class="bladlink__tekst">Bladmuziek van dit nummer</span
          ><span class="bladlink__pijl" aria-hidden="true">↓</span>
        </a>
      </div>
    </div>

    <div class="sectie">
      <div class="kolom">
        <KopBlok
          :accent="nummer.title"
          :kop="nummer.bijzonderKop ?? 'Wat dit nummer zo bijzonder maakt'"
        />
        <div class="bijzonder">
          <NuxtImg
            class="bijzonder__cover"
            :src="nummer.cover.src"
            :alt="`Hoes van ${nummer.title}`"
            width="120"
            height="120"
            densities="x1 x2"
          />
          <div class="tekst">
            <template v-for="(alinea, i) in bijzonder" :key="i">
              <blockquote v-if="alinea.startsWith('“')" class="citaat">{{ alinea }}</blockquote>
              <p v-else>{{ alinea }}</p>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div :class="['sectie', !metBladmuziek && 'sectie--eind']">
      <div class="kolom">
        <KopBlok :accent="nummer.title" kop="Liedtekst" />
        <div class="tekst">
          <p v-for="(strofe, i) in strofen" :key="i" class="strofen">{{ strofe }}</p>
        </div>
        <NummerNav v-if="!metBladmuziek" :vorige="vorige" :volgende="volgende" />
      </div>
    </div>

    <!-- Na de liedtekst, boven de voet (design/bladmuziek-formulier.md) -->
    <div v-if="metBladmuziek" class="sectie sectie--eind">
      <div class="kolom">
        <LazyBladmuziekFormulier ref="formulier" :nummer="slug" :titel="nummer.title" />
        <!-- De nummerlinks blijven als laatste vóór de voet: bij een nummer met formulier staan ze eronder -->
        <NummerNav :vorige="vorige" :volgende="volgende" />
      </div>
    </div>
  </article>
</template>

<style scoped>
/* De crème balk met het nummer en de links naar Spotify en YouTube, 50 px onder het verhaal */
.sectie--pil {
  padding-block-start: 4.375rem;
}

.pil {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-block-size: 3.8125rem;
  padding-inline: 1.5rem;
  border-radius: 3.125rem;
  background: var(--kleur-creme);
}

.pil__noot {
  flex: none;
  inline-size: 1.5rem;
  block-size: 1.5rem;
  color: var(--kleur-terracotta-diep);
}

.pil__titel {
  flex: 1;
  margin: 0;
  font-size: 1.425rem;
  font-weight: 700;
  line-height: 1.2;
}

.pil__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--doel-min);
  block-size: var(--doel-min);
  color: var(--kleur-terracotta-diep);
}

/* De koppeling naar het formulier onder de luisterbalk: een tikdoel van minstens 44 px */
.bladlink {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--doel-min);
  margin-block-start: 0.5rem;
  color: var(--link);
  text-decoration: none;
}

.bladlink__tekst {
  text-decoration: underline;
  text-underline-offset: 0.15em;
}

/* De pijl omlaag staat buiten de onderstreping, in de tekstkleur */
.bladlink__pijl {
  margin-inline-start: 0.4rem;
  color: var(--tekst);
}

.bijzonder {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 1.25rem;
  margin-block-start: 1.25rem;
}

.bijzonder .tekst {
  flex: 1 1 18rem;
}

.bijzonder__cover {
  flex: none;
  inline-size: 7.5rem;
  block-size: 7.5rem;
}
</style>
