---
title: Dauntless Revived suomeksi
nav_order: 100
has_children: true
has_toc: false
permalink: /fi/
description: "Dauntless Revived on yksityinen palvelin, jolla Dauntlessia voi taas pelata: aito 1.4.4-versio ja muokattu Undaunted. Mikä toimii ja miten sen saa käyttöön."
lang: fi
ref: index
locale: fi_FI
---

{% assign setup_page = site.pages | where: "path", "fi/setup/index.md" | first %}
{% assign findings_page = site.pages | where: "path", "fi/findings/index.md" | first %}
{% assign roadmap_page = site.pages | where: "path", "fi/roadmap.md" | first %}
{% assign legal_page = site.pages | where: "path", "fi/legal.md" | first %}

# Dauntless Revived

**Dauntless** on Phoenix Labsin tekemä tietokonepeli, jossa pelaajat metsästävät yhdessä suuria
hirviöitä. Pelin viralliset palvelimet (tietokoneet, jotka pyörittivät peliä verkossa) suljettiin
**30.5.2025**. Peliä voi silti yhä pelata yksityisellä palvelimella. Dauntless Revived on yksi
sellainen: yksityinen ja ei-kaupallinen hanke, joka säilyttää pelin ja herättää sen henkiin. Siinä
käytetään aitoa **Dauntless 1.4.4** -peliohjelmaa (lokakuulta 2020). Palvelimena on muokattu versio
avoimen lähdekoodin [Undaunted](https://github.com/SyST3MDeV/Undaunted)-palvelimesta, jonka ovat
tehneet gwog ja muut tekijät (lisenssi AGPL-3.0). Palvelin ei ole julkinen: omistaja pitää sitä
pystyssä muutamalle ystävälle. Kuka tahansa, jolla on oma kopio 1.4.4-peliohjelmasta, voi pystyttää
samanlaisen palvelimen [repositorion]({{ site.github.repository_url }}) (koodivaraston) avulla.

Aloitimme tutkimalla pelin viimeistä versiota, **2.1.1**:tä (”Awakening”). Kaikki, mitä opimme
molemmista versioista, on kirjoitettu tälle sivustolle.

**Lyhyesti:**

- Dauntlessin viralliset palvelimet suljettiin 30.5.2025.
- Tämä hanke saa pelin vanhan version 1.4.4 toimimaan taas omalla palvelimella.
- Palvelin on pieni ja yksityinen. Se on tehty muutamalle ystävälle, ei kaikille avoimeksi.
- Jos sinulla on oma kopio pelistä, voit pystyttää oman palvelimen tämän sivuston ohjeilla.

> **Vastuuvapaus.** Dauntless Revived on epävirallinen fanien tekemä hanke. Se **ei liity Phoenix
> Labsiin eikä Epic Gamesiin, eivätkä ne ole hyväksyneet tai tukeneet sitä**. ”Dauntless” ja siihen
> liittyvät nimet ovat omistajiensa tavaramerkkejä. **Tällä sivustolla ja lähdekoodissa ei ole
> pelin tiedostoja**: ei ohjelmatiedostoja, ei pak-paketteja, ei grafiikkaa eikä pelin asetuksia, eikä
> linkkejä niiden latauksiin. Jos haluat käyttää jotakin täällä kuvattua, tarvitset **oman kopion**
> Dauntless 1.4.4 -peliohjelmasta. Julkista palvelinta, jolle voisi liittyä, ei ole.

[Asennusohjeet]({{ setup_page.url | relative_url }}){: .btn .btn-primary .mr-2 }
[Lue löydökset]({{ findings_page.url | relative_url }}){: .btn .mr-2 }
[Tiekartta]({{ roadmap_page.url | relative_url }}){: .btn }

---

## Tilanne nyt {#current-status}

Tilanne syyskuussa 2026. Kaikki tämän osion tiedot koskevat **1.4.4**-peliohjelmaa. Tähän mennessä
sitä on testattu yhdellä tietokoneella: omistaja on pelannut yksin.

### Mikä toimii {#what-works}

| Ominaisuus | Tila | Huomiot |
|---|---|---|
| Kirjautuminen omalla tilillä | Toimii | Jokaisella pelaajalla on tili meidän palvelimellamme, ja hän kirjautuu henkilökohtaisella tiliavaimella (pitkä salainen tunnus, joka toimii salasanana). **Epic-tiliä ei tarvita.** Versiossa 1.4.4 ei ole Epic Online Services -kirjautumista, koska versio on sitä vanhempi. Peli käynnistetään niin sanotussa exchange code -kirjautumistilassa. Peliin ladattava DLL-tiedosto (pieni ohjelmakirjasto) ohjaa pelin Epic-tyylisen tilipalvelukutsun meidän metagame-palveluumme (palvelimen osa, joka hoitaa tilit ja hahmot). Metagame hyväksyy pelaajan tiliavaimen vaihtokoodina eli exchange codena. |
| Opetusjakso (tutorial) | Toimii | Uusi hahmo ohjataan opetussaarelle. Saari pyörii pelipalvelimella, jonka deploy-palvelin (ohjelma, joka käynnistää pelipalvelimet) käynnistää tarvittaessa. |
| Ramsgate | Toimii | Pysyvä Ramsgate-palvelin pyörii taustapalvelun rinnalla. Ramsgate on pelin keskuskaupunki. Opetusjakson jälkeen ja jokaisella myöhemmällä kirjautumisella pelaaja menee suoraan sinne. |
| Metsästyspalvelimet | Toimii (yksin) | Deploy-palvelin käynnistää yhden pelipalvelimen jokaista metsästystä varten. Meidän kokoonpanossamme yksi pelaaja on pelannut opetusjakson metsästyksen, tavallisen metsästyksen (Lesser Boreus) ja takaa-ajon (pursuit). Undauntedin historian mukaan neljän pelaajan metsästykset ovat toimineet samalla peliversiolla, mutta me **emme ole vielä testanneet** metsästyksiä useamman kuin yhden pelaajan kanssa. |
| Tavaroiden ja varustesarjojen tallennus | Toimii (yksin) | Materiaalit, Ramsit (pelin raha, todennäköisesti `CURRENCY_NOTES`-pino), valmistetut ja saadut varusteet, ensimmäinen varustesarja (loadout) sekä hahmon tiedot (tehtävien eteneminen, opetusjakson tila, liput, ulkonäkö) tallennetaan SQLite-tietokantaan. Metsästyksistä saatu saalis tallentuu. Tiedot säilyvät, vaikka peliohjelma tai koko palvelin käynnistetään uudelleen. Toistaiseksi tätä on testannut vain yksi pelaaja. |

Palvelinkoneella (tietokone, jolla palvelin pyörii) mitattu kulutus oli: Ramsgate-palvelin noin 1,1 Gt
keskusmuistia (RAM) ja noin 0,2 suoritinydintä, jokainen metsästyspalvelin noin 0,9 Gt, ja pelaajan
oma peliohjelma 1,5–2,3 Gt (suurempi luku Cinematic-grafiikka-asetuksilla).

### Mikä ei vielä toimi {#what-does-not-work-yet}

- **Pelaaminen kavereiden kanssa internetin yli.** Tällä hetkellä metagame ja deploy-palvelin
  kuuntelevat vain palvelinkoneella, ja pelipalvelimien osoitteeksi kerrotaan `127.0.0.1`, joten vain
  isäntä voi pelata. Suunnitelma on yhdistää kaverit Tailscalella (ohjelma, joka tekee salatun,
  yksityisen yhteyden koneiden välille) ja ottaa kutsukoodit käyttöön.
- **Ryhmät (parties) ja kaverilista.** Ryhmä on aina ”sinä yksin”, ja kaverilistassa näkyy 0 kaveria
  paikalla.
- **Kehittyminen (progression).** Slayer-taso ja aseiden mestaruus (mastery) tulevat kiinteästä
  mallista, ja siksi jokaisella tilillä näkyy taso 50. Kehityksen tallennukset hylätään, eikä niitä
  säilytetä.
- **Palkkiotehtävät (bounties), Hunt Pass, odotusajat (cooldowns) ja Escalation.** Näille on vain
  tyngät (paikanpitäjät, jotka eivät oikeasti tallenna mitään), eikä mikään niistä siirry
  pelikerrasta toiseen.
- **Useat varustesarjat, oman käyttäjänimen valitseminen, tervetuloviesti ja postilaatikko,
  kausitapahtumat sekä kauppa.**

[Tiekartassa]({{ roadmap_page.url | relative_url }}) on järjestys, jossa aiomme edetä, sekä oikeissa
pelikerroissa nähdyt virheet. Kaikki ei voi palata. Äänichat toimi Vivoxilla, joka on maksullinen
ulkopuolinen palvelu, joten käytä sen sijaan Discordia. Marraskuun 2020 jälkeen julkaistu sisältö ei
ole versiossa 1.4.4.

---

## Kenelle tämä on {#who-this-is-for}

- **Omistajalle ja muutamalle kutsutulle kaverille.** Tämä on pieni yksityinen porukka, ei julkinen
  palvelu.
- **Niille, joilla on 1.4.4-peliohjelma ja jotka haluavat pyörittää samaa omalle porukalleen.**
  [Asennus]({{ setup_page.url | relative_url }})-osio kertoo isännän (palvelimen pyörittäjän) puolen,
  kavereiden puolen ja sen, miten tarkistat, että pelikopiosi on aito ja muuttamaton.
- **Kaikille, joita kiinnostaa, miten Dauntlessin verkkopuoli toimi.**
  [Löydökset]({{ findings_page.url | relative_url }})-osioon on kirjattu taustapalvelun rajapinta (eli
  se, millaisia viestejä peli ja palvelin vaihtavat), miten Undauntedin palvelintilan DLL toimii ja
  mitä opimme 2.1.1-peliohjelmasta. Kerromme, mistä versiosta kukin tieto on peräisin, ja merkitsemme
  kaiken varmistamattoman.

---

## Miten osat sopivat yhteen (1.4.4) {#how-it-fits-together-144}

| Osa | Mikä se on | Missä se pyörii |
|---|---|---|
| Peliohjelma (client) | Muokkaamaton Dauntless 1.4.4 -ohjelmatiedosto ja sen viereen laitetut kaksi Undauntedin DLL-tiedostoa: `dxgi.dll`-välittäjä (proxy), joka lataa `UndauntedInternalServer.dll`-tiedoston. Se ohjaa peliohjelman taustapalvelukutsut metagameen tavallisena HTTP-liikenteenä | Jokaisen pelaajan tietokone |
| Metagame | Undauntedin TypeScriptillä kirjoitettu taustapalvelu: tilit, hahmot, tavarat, varustesarjat ja pelaajien yhteen sovittaminen (matchmaking) | Palvelinkone, TCP 61000 |
| Deploy-palvelin | Käynnistää pelipalvelinprosessit ja valvoo niitä | Palvelinkone, TCP 61001, vain koneen sisäinen osoite eli loopback (siinä ei ole tunnistautumista) |
| Pelipalvelimet | Lisää kopioita samasta peliohjelmasta, jotka DLL kääntää palvelintilaan: yksi pysyvä Ramsgate-palvelin ja lisäksi yksi jokaista metsästystä varten | Palvelinkone, UDP 8770–8777 |

Tähänastiset muutoksemme Undauntediin ovat pieniä ja käytännöllisiä. Molemmat palvelut kuuntelevat
nyt oletuksena vain koneen sisäisessä osoitteessa. Päällekkäinen portti on nyt selvä virhe, kun se
ennen johti hiljaiseen sulkeutumiseen. Jokainen pyyntö kirjataan lokiin. Training Dojo (harjoitussali)
käynnistyy vain silloin, kun sitä tarvitaan. [Tiekartassa]({{ roadmap_page.url | relative_url }})
luetellaan ne kaikki.

---

## Miten tähän päädyttiin {#how-we-got-here}

Aloitimme pelin viimeisestä versiosta **2.1.1** ja kirjoitimme oman taustapalvelun alusta asti. Sen
työn tuloksena selvisi, että peli keskustelee Phoenix Labsin oman REST-rajapinnan kanssa
`steelyard.ca`-palvelimilla (eikä PlayFabin, kuten yhteisön aiemmissa muistiinpanoissa oletettiin).
Saimme ratkaistua koko 2.1.1:n kirjautumisketjun. Kun syötimme peliin omia käyttäjäasetuksia, saimme
jopa Ramsgaten näkymään ruudulla. Ohjattavaa pelaajahahmoa kaupunkiin emme kuitenkaan koskaan
saaneet.

**Korjaus.** Päättelimme ensin, että moninpeli on mahdotonta, koska molemmat kaupalliset versiot
(2.1.1 ja 1.4.4) ovat pelkkiä peliohjelmia: `UWorld::Listen` on korvattu tyhjällä tyngällä, ja
verkkotila on pakotettu asentoon ”client”. Tuo päätelmä oli **väärä**. Vain sisäänkäynti on
poistettu. Sen alla oleva verkkokerros (`UIpNetDriver::InitListen` sekä palvelinpuolen liittymis- ja
kirjautumiskäsittelijät) on ehjä. Peliin ladattu DLL voi ohjata sitä, ja juuri niin Undaunted
pyörittää moninpelin Ramsgatea ja metsästyksiä 1.4.4-peliohjelmalla. Kun ymmärsimme tämän, siirryimme
versioon 1.4.4 ja teimme Undauntedista oman muokatun version (forkin).

---

## Kiitokset {#credits}

Tämä hanke rakentuu gwogin (Gregory Morford) ja muiden tekijöiden **Undauntedin** varaan. Palvelintilan
DLL, deploy-palvelin, metagame ja käynnistin ovat heidän tekemiään. Muokattu versiomme on edelleen
AGPL-3.0-only-lisenssin alainen, ja sen koko lähdekoodi on [tämän sivuston repositoriossa]({{ site.github.repository_url }}).
Sivulta [Kiitokset ja lisenssi]({{ legal_page.url | relative_url }}) löydät kaikki kiitokset, sen, mitä
AGPL vaatii jokaiselta, joka pyörittää muokattua versiota, sekä huomiot tavaramerkeistä ja
pelitiedostoista.
