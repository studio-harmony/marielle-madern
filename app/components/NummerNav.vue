<script setup lang="ts">
// De links naar het vorige en volgende nummer en naar alle nummers, onder de liedtekst (en onder het formulier voor
// bladmuziek, als dat er is): altijd het laatste onderdeel van de pagina vóór de voet.
defineProps<{
  vorige?: { path: string; title: string }
  volgende?: { path: string; title: string }
}>()
</script>

<template>
  <!-- Onder de liedtekst, als laatste van de pagina: wie het lied gelezen heeft, wil daar verder. Alleen de titel
       en 'Alle nummers' zijn onderstreept; het label erboven hoort bij dezelfde link (één aanraakvlak). Bij het
       eerste of laatste nummer blijft de plek van de ontbrekende link leeg. -->
  <nav class="nummernav" aria-label="Meer nummers">
    <NuxtLink v-if="vorige" :to="`${vorige.path}/`" rel="prev" class="nummernav__link">
      <span class="nummernav__label">Vorig nummer</span>
      <span class="nummernav__titel">{{ vorige.title }}</span>
    </NuxtLink>
    <NuxtLink
      v-if="volgende"
      :to="`${volgende.path}/`"
      rel="next"
      class="nummernav__link nummernav__link--volgend"
    >
      <span class="nummernav__label">Volgend nummer</span>
      <span class="nummernav__titel">{{ volgende.title }}</span>
    </NuxtLink>
    <NuxtLink to="/over-de-muziek/" class="nummernav__alle">Alle nummers</NuxtLink>
  </nav>
</template>

<style scoped>
/* Links onder de liedtekst (advies van de Designer, PR #62): een lijn van 1 px lichtgoud met 56 px ruimte erboven,
   24 px tussen de lijn en de links, 24 px tussen de kolommen en 8 px tussen de rijen. Vorig nummer links, Volgend
   nummer rechts, 'Alle nummers' gecentreerd eronder; op de telefoon (tot 767 px) alles onder elkaar. */
.nummernav {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 1.5rem;
  margin-block-start: 3.5rem;
  padding-block-start: 1.5rem;
  border-block-start: 1px solid var(--kleur-lichtgoud);
}

/* Elke link is minstens 44 px hoog: het label en de titel samen vormen het aanraakvlak */
.nummernav__link {
  grid-column: 1;
  justify-self: start;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-block-size: var(--doel-min);
  text-decoration: none;
}

.nummernav__link--volgend {
  grid-column: 2;
  justify-self: end;
  align-items: flex-end;
  text-align: end;
}

.nummernav__label {
  font-size: var(--tekst-klein);
  color: var(--kleur-tekst);
  text-decoration: none;
}

.nummernav__titel {
  font-size: var(--tekst-basis);
  color: var(--kleur-groen);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.nummernav__alle {
  grid-column: 1 / -1;
  justify-self: center;
  display: inline-flex;
  align-items: center;
  min-block-size: var(--doel-min);
  font-size: var(--tekst-basis);
}

@media (max-width: 47.9375rem) {
  .nummernav {
    grid-template-columns: 1fr;
  }

  .nummernav__link,
  .nummernav__link--volgend {
    grid-column: 1;
    justify-self: start;
    align-items: flex-start;
    text-align: start;
  }

  .nummernav__alle {
    justify-self: start;
  }
}
</style>
