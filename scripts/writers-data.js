// scripts/writers-data.js
//
// Single source of truth for the "Our Writers" page. Extends the author roster
// (lib/authors.js) with public-profile fields (age, location, experience,
// interests) used to render writer-cards. Names/usernames/beats here mirror
// AUTHOR_REGISTRY — keep them in sync. Grouped by parent category so the page
// sections match the site's category structure.

export const SITE_URL = 'https://merlows.com';

// Each writer: { name, slug, beat, floater?, age, location, experience, interests }
// slug = WP user slug (author archive at /author/<slug>/).
export const WRITER_GROUPS = [
  {
    key: 'breaking-news', label: 'Breaking News',
    blurb: 'The hard-news desk — fast, sourced reporting on the stories shaping the region.',
    writers: [
      { name: 'Adi Rosen',       slug: 'adi-rosen',       beat: 'Trade & Economy',   age: 41, location: 'Tel Aviv, Israel',      experience: '16 years in business journalism', interests: 'Regional trade, energy markets, the economics of normalisation' },
      { name: 'Layla Mansour',   slug: 'layla-mansour',   beat: 'Peace & Diplomacy', age: 38, location: 'Amman, Jordan',          experience: '14 years as a diplomatic correspondent', interests: 'Ceasefire negotiations, track-two diplomacy, summitry' },
      { name: 'Daniel Roth',     slug: 'daniel-roth',     beat: 'Antisemitism',      age: 45, location: 'London, United Kingdom', experience: '20 years covering community affairs', interests: 'Extremism monitoring, community security, hate-crime data' },
      { name: 'Marcus Whitfield',slug: 'marcus-whitfield',beat: 'Culture War',       age: 49, location: 'New York, United States', experience: '22 years in political commentary', interests: 'Free speech, campus politics, Western identity debates' },
      { name: 'Yael Bar-On',     slug: 'yael-bar-on',     beat: 'Nationalism',       age: 36, location: 'Jerusalem, Israel',       experience: '12 years in political reporting', interests: 'Sovereignty, national identity, Knesset politics' },
      { name: 'Tomer Avidan',    slug: 'tomer-avidan',    beat: 'Guest Writer', floater: true, age: 33, location: 'Tel Aviv, Israel', experience: '9 years on the general-assignment desk', interests: 'Breaking news, field reporting, fast-moving stories' },
    ],
  },
  {
    key: 'blitzspirit', label: 'BlitzSpirit',
    blurb: 'Heritage and resilience essays in the spirit of the home front — keep calm and carry on.',
    writers: [
      { name: 'Edith Caldwell',  slug: 'edith-caldwell',  beat: 'Original Spirit', age: 58, location: 'London, United Kingdom',     experience: '30 years writing essays and social history', interests: 'Wartime social history, civic memory, the home front' },
      { name: 'Jonathan Pearce', slug: 'jonathan-pearce', beat: 'Explainers',     age: 42, location: 'Bristol, United Kingdom',    experience: '17 years in explanatory journalism', interests: 'Archival research, plain-English history, context pieces' },
      { name: 'Margaret Ellison',slug: 'margaret-ellison',beat: 'Blitz Echoes',   age: 53, location: 'Manchester, United Kingdom', experience: '26 years as a social historian', interests: 'Oral history, intergenerational memory, wartime Britain' },
      { name: 'Henry Ashworth',  slug: 'henry-ashworth',  beat: 'Spirit Today',   age: 39, location: 'Leeds, United Kingdom',      experience: '15 years in features reporting', interests: 'Resilience, civic courage, community profiles' },
      { name: 'Clara Bennett',   slug: 'clara-bennett',   beat: 'Carry On',       age: 31, location: 'Brighton, United Kingdom',   experience: '8 years in culture writing', interests: 'Morale, popular culture, the lighter human register' },
      { name: 'Reuben Stein',    slug: 'reuben-stein',    beat: 'Guest Writer', floater: true, age: 47, location: 'London, United Kingdom', experience: '21 years as an essayist', interests: 'Heritage, remembrance, the long view' },
    ],
  },
  {
    key: 'cyrus-accord', label: 'Cyrus Accords',
    blurb: 'Persian–Jewish heritage, the Cyrus ideal, and the long arc of Israel–Iran reconciliation.',
    writers: [
      { name: 'Darius Kohan',    slug: 'darius-kohan',    beat: 'The Cyrus Vision',        age: 52, location: 'Los Angeles, United States', experience: '24 years in opinion writing', interests: 'Pluralism, the Cyrus ideal, Iran’s future' },
      { name: 'Shirin Hakimi',   slug: 'shirin-hakimi',   beat: 'Persian-Jewish Heritage', age: 46, location: 'Tel Aviv, Israel (b. Tehran)', experience: '19 years in cultural history', interests: 'Persian-Jewish memory, diaspora identity, heritage preservation' },
      { name: 'Cyrus Nazarian',  slug: 'cyrus-nazarian',  beat: 'Conflict & Diplomacy',    age: 50, location: 'Washington DC, United States', experience: '23 years in Iran analysis', interests: 'The regime and the opposition, regional diplomacy, sanctions' },
      { name: 'Esther Yaghoubi', slug: 'esther-yaghoubi', beat: 'Guest Writer', floater: true, age: 35, location: 'New York, United States (b. Shiraz)', experience: '11 years in feature writing', interests: 'Diaspora voices, women’s stories, cultural bridges' },
    ],
  },
  {
    key: 'abraham-accords', label: 'Abraham Accords',
    blurb: 'The widening circle of Gulf–Israel normalisation — diplomacy, security and trade.',
    writers: [
      { name: 'Khalid Al-Mansoori', slug: 'khalid-al-mansoori', beat: 'Normalisation & Diplomacy', age: 44, location: 'Abu Dhabi, UAE',     experience: '18 years in Gulf affairs', interests: 'Normalisation diplomacy, Gulf–Israel ties, regional summitry' },
      { name: 'Noa Friedman',       slug: 'noa-friedman',       beat: 'Regional Security',        age: 40, location: 'Herzliya, Israel',   experience: '16 years in defence reporting', interests: 'Deterrence, defence cooperation, air & missile defence' },
      { name: 'Faisal Al-Rashid',   slug: 'faisal-al-rashid',   beat: 'Trade & Connectivity',     age: 43, location: 'Manama, Bahrain',    experience: '17 years in business journalism', interests: 'Trade corridors, ports & logistics, cross-border investment' },
      { name: 'Rana Haddad',        slug: 'rana-haddad',        beat: 'Guest Writer', floater: true, age: 37, location: 'Dubai, UAE',       experience: '13 years in feature writing', interests: 'Regional culture, business profiles, people of the Gulf' },
    ],
  },
  {
    key: 'diplomatic-analysis', label: 'Diplomatic Analysis',
    blurb: 'Long-form strategy — the structures, treaties and balances of power behind the headlines.',
    writers: [
      { name: 'Gregory Halloran', slug: 'gregory-halloran', beat: 'Great-Power Politics',  age: 56, location: 'Washington DC, United States', experience: '28 years in geopolitics', interests: 'US–China–Russia competition, grand strategy, the regional balance' },
      { name: 'Avner Cohen',      slug: 'avner-cohen',      beat: 'Security & Strategy',   age: 54, location: 'Jerusalem, Israel',           experience: '27 years in strategic studies', interests: 'Deterrence theory, force posture, escalation dynamics' },
      { name: 'Amira Suleiman',   slug: 'amira-suleiman',   beat: 'Treaties & Institutions', age: 41, location: 'Geneva, Switzerland (b. Cairo)', experience: '16 years in international law', interests: 'Treaty law, the UN system, multilateral institutions' },
      { name: 'Daniel Okonkwo',   slug: 'daniel-okonkwo',   beat: 'Guest Writer', floater: true, age: 38, location: 'London, United Kingdom (b. Lagos)', experience: '14 years in foreign affairs', interests: 'Comparative diplomacy, Global South perspectives, mediation' },
    ],
  },
  {
    key: 'regional-voices', label: 'Regional Voices',
    blurb: 'First-person and on-the-ground — how the region sees itself, in its own words.',
    writers: [
      { name: 'Mariam Al-Sabah', slug: 'mariam-al-sabah', beat: 'Gulf Perspectives',  age: 39, location: 'Kuwait City, Kuwait', experience: '15 years in column writing', interests: 'Gulf public opinion, generational change, regional identity' },
      { name: 'Itai Ben-David',  slug: 'itai-ben-david',  beat: 'Israeli Society',    age: 34, location: 'Tel Aviv, Israel',    experience: '11 years in features reporting', interests: 'Israeli street life, the start-up scene, social currents' },
      { name: 'Rachel Goldstein',slug: 'rachel-goldstein',beat: 'Diaspora Dialogues', age: 48, location: 'Toronto, Canada',     experience: '20 years in community journalism', interests: 'Diaspora identity, belonging, the Israel–diaspora bond' },
      { name: 'Samir Khoury',    slug: 'samir-khoury',    beat: 'Guest Writer', floater: true, age: 45, location: 'Nazareth, Israel', experience: '19 years in feature writing', interests: 'Levantine voices, coexistence, minority narratives' },
    ],
  },
];

export function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
