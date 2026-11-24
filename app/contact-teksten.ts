// De teksten van het contactformulier (design/teksten-contactformulier.md, Tekstschrijver). Alle vaste tekst staat
// hier, zodat een wijziging op één plek kan. De inleiding boven het formulier staat in content/paginas/contact.md.
import { MAIL } from '~/bladmuziek-teksten'

export { MAIL }

// De zes optionele velden bij een boeking. `sleutel` is de naam in het verzoek aan /api/contact (worker/teksten.mjs,
// BOEKINGSVELDEN); `max` is het maximum van de Worker (worker/contact.mjs: 200 voor speeltijden, anders 100).
export const BOEKINGSVELDEN = [
  {
    sleutel: 'datumtijd',
    label: 'Datum en tijd',
    hulp: 'Weet je de datum nog niet? Laat het leeg.',
    max: 100,
  },
  { sleutel: 'plaats', label: 'Plaats', hulp: 'Stad of locatie is genoeg.', max: 100 },
  {
    sleutel: 'gelegenheid',
    label: 'Soort gelegenheid',
    hulp: 'Bijvoorbeeld een kerkdienst, concert of huwelijk.',
    max: 100,
  },
  {
    sleutel: 'aantal',
    label: 'Verwacht aantal bezoekers',
    hulp: 'Een ruwe schatting is prima.',
    max: 100,
  },
  {
    sleutel: 'speeltijden',
    label: 'Speeltijden en duur',
    hulp: 'Hoe laat begint het, en hoe lang duurt het? Ook dit mag je schatten.',
    max: 200,
  },
  {
    sleutel: 'budget',
    label: 'Budget',
    hulp: 'Een ruwe indicatie is genoeg. Laat het leeg als je het nog niet weet.',
    max: 100,
  },
] as const

export const TEKSTEN = {
  onderwerp: 'Waar gaat het over?',
  vraag: 'Algemene vraag',
  boeking: 'Boeking',
  // PLAATSVERVANGERS van de Designer (design/contactformulier.md), nog door de Tekstschrijver te bevestigen
  boekingKop: 'Over de boeking',
  boekingRegel: 'Vul in wat je al weet. Alles is optioneel.',
  naam: 'Naam',
  email: 'E-mailadres',
  bericht: 'Bericht',
  // Zichtbaar zonder JavaScript of als het script niet laadt
  zonderScript: `Het formulier heeft JavaScript nodig. Zonder JavaScript kun je mailen naar ${MAIL}.`,
  knop: 'Verstuur mijn bericht',
  knopBezig: 'Bezig met versturen',
  uitlegVoor:
    'Ik vraag je naam en e-mailadres zodat ik je kan antwoorden. Wat je invult, gebruik ik alleen voor je vraag of boekingsverzoek. Lees hoe ik met je gegevens omga in de ',
  uitlegLink: 'privacyverklaring',
  uitlegNa: '.',
  fouten: {
    naamLeeg: 'Vul je naam in.',
    emailLeeg: 'Vul je e-mailadres in.',
    emailOngeldig:
      'Dit e-mailadres lijkt niet te kloppen. Controleer het, dan probeer je het nog eens.',
    berichtLeeg: 'Vul je bericht in.',
    teVaak: 'Even geduld: probeer het over een minuutje nog eens.',
    druk: 'Het versturen lukt nu even niet. Probeer het later nog eens, of mail me op ',
    drukNa: '.',
    mis: 'Er ging iets mis bij het versturen. Probeer het nog eens, of mail ',
    misNa: '.',
  },
  bevestigingKop: 'Dank je wel.',
  bevestiging:
    'Je bericht is aangekomen. Ik reageer zo snel ik kan. Kijk ook in je spam of ongewenste mail als je de bevestiging niet ziet.',
  // Antwoord 200 met later:true: het bericht is binnen, de mail komt later (in plaats van de gewone bevestiging)
  bevestigingLater:
    'Je bericht is binnen. De mail komt iets later aan. Je hoeft niets opnieuw te doen.',
} as const
