---
title: Tiekartta
parent: Dauntless Revived suomeksi
nav_order: 5
description: "Dauntless Revivedin tiekartta selkokielellä: tavoite, välitavoitteet M0–M4, mitä on jo tehty ja mitä on työn alla. Päivittyvä lista on englanniksi."
lang: fi
ref: roadmap
locale: fi_FI
---

{% assign roadmap_en = site.pages | where: "path", "roadmap.md" | first %}
{% assign friends_page = site.pages | where: "path", "fi/setup/friends.md" | first %}

# Tiekartta
{: .no_toc }

Tällä sivulla kerrotaan tavallisin sanoin, mihin Dauntless Revived on menossa ja mitä on jo tehty.
Tämä on suomenkielinen yhteenveto. Tarkka tarkistuslista, jota päivitetään sitä mukaa kuin työ etenee,
on englanniksi:

[Avaa päivittyvä tarkistuslista (englanniksi)]({{ roadmap_en.url | relative_url }}){: .btn .btn-primary .mr-2 }
[ROADMAP.md GitHubissa]({{ site.github.repository_url }}/blob/dauntless-revived/ROADMAP.md){: .btn }

Yhteenveto kuvaa tilannetta 21.9.2026; oikean etenemisen tiedot on päivitetty 22.9.2026. Jos tämä
sivu ja englanninkielinen lista eroavat toisistaan, englanninkielinen lista on ajan tasalla.

<details open markdown="block">
  <summary>Sisältö</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Tavoite {#goal}

Tavoite on yksinkertainen: **pieni kaveriporukka pelaa yhdessä tällä palvelimella, ja kaikki, mitä
he pelissä ansaitsevat, säilyy.**

Työjärjestys on sovittu näin: kaverit kutsutaan mukaan vasta, kun välitavoite M2 (kaikki ansaittu
tallentuu) on valmis. Silloin jo heidän ensimmäinen metsästyksensä lasketaan. Siksi turvaverkon (M0)
jälkeen rakennetaan ensin M2. Sen voi rakentaa ja testata omistaja yksin. Ryhmät (parties)
rakennetaan M2:n rinnalla, ja niitä testataan toisella tilillä ja toisella peli-ikkunalla samalla
koneella. Muu yhdessä pelaamiseen tarvittava (M1) valmistellaan samaan aikaan. Ensimmäinen yhteinen
peli-ilta odottaa, kunnes M2 on valmis.

---

## Missä mennään nyt {#where-we-are}

Toistaiseksi palvelimella on pelannut yksi pelaaja, omistaja, ja kaikki pyörii omistajan koneella.
Nämä toimivat: kirjautuminen, opetusjakso, Ramsgate (pelin keskuskaupunki), Training Dojo
(harjoitussali), oikeat metsästykset, esineiden valmistus (crafting), tavarat ja käytössä oleva
varustesarja.

Kaverit eivät vielä pääse mukaan. Kaikki kuuntelee vain omistajan koneella, eivätkä ryhmät ja
kaverilista vielä oikeasti toimi.

Osa pelissä ansaitusta tallentuu jo, osa ei:

- **Tallentuu:** tavarat, materiaalit, Ramsit (pelin raha), valmistetut varusteet, tehtävät ja tarinan
  eteneminen. Oikean etenemisen myötä, joka on nyt oletuksena päällä, tallentuvat myös Slayer-taso,
  aseiden ja hirviöiden mestaruus (mastery) ja Hunt Pass (Elite-passi kaikille). Se läpäisi
  pelitestin kertakäyttöisellä testitilillä, myös uudelleenkäynnistyksen yli (hirviöiden mestaruutta
  ei ole vielä nähty pelissä).
- **Tallentuu, mutta ei vielä kokeiltu kokonaan pelissä:** palkkiotehtävät (bounties), päivittäiset
  ajastimet ja lisävarustesarjojen paikat.
- **Ei vielä tallennu:** Escalation. Sille on toistaiseksi vain tynkä, joka heittää jokaisen
  tallennuksen pois.

---

## Mitä on jo tehty {#done-so-far}

- Peliversio 1.4.4 on tarkistettu: kaikki 406 tiedostoa vastaavat Phoenix Labsin omaa
  tiedostoluetteloa, ohjelmatiedostoja ei ole muutettu, ja haittaohjelmatarkistus oli puhdas.
- Peli on asennettu, ja palvelimen valmiit DLL-tiedostot tarkistetaan tiivisteillä (tiedostojen
  sormenjäljillä) ennen käyttöä.
- Koko palvelinkokonaisuus pyörii omistajan koneella: metagame (tilit ja hahmot), deploy-palvelin
  (käynnistää pelipalvelimet) ja pelipalvelimet.
- Kirjautuminen omalla tilillä toimii ilman Epic-tiliä.
- Opetusjakso ja sen jälkeen Ramsgate toimivat omalla palvelimella.
- Paras grafiikka (Cinematic-taso, täysi resoluutio, terävöinti) asetetaan käynnistimessä
  automaattisesti.
- Korjauksia Undauntediin: palvelut kuuntelevat oletuksena vain omalla koneella, päällekkäinen portti
  on nyt selvä virhe eikä hiljainen sulkeutuminen, jokainen pyyntö kirjataan lokiin, ja Training Dojo
  käynnistyy vain tarvittaessa.
- Muokattu versio on tallennettu ja julkaistu [repositorioon]({{ site.github.repository_url }}).
- Ensimmäiset metsästykset on pelattu omalla palvelimella: opetusjakson takaa-ajo (pursuit), Lesser
  Boreus -metsästys ja toinen takaa-ajo. Saaliit tallentuivat: esimerkiksi Ramsit nousivat
  1 260:stä 1 460:een, ja 20 kappaletta `ORB_FROST`-materiaalia saapui.
- Jokaisen pelin järjestelmän tallentuminen on käyty läpi ja tarkistettu oikeasta tietokannasta ja
  pyyntölokista.
- **Automaattiset varmuuskopiot (0.1):** tietokannasta otetaan kopio tunnin välein sekä jokaisen
  käynnistyksen ja pysäytyksen yhteydessä, ja palautustesti onnistui. Kopioita koneen ulkopuolelle ei
  vielä ole.
- **Uudelleenkäynnistystesti (0.3):** tietokannan kaikki 12 taulua olivat täsmälleen samat ennen koko
  palvelinkokonaisuuden uudelleenkäynnistystä ja sen jälkeen, ja peli latasi hahmon ja tavarat
  normaalisti.
- **Epicin chat-palvelimen esto (0.5):** peli ei enää ota yhteyttä Epicin vanhaan chat-palvelimeen.
  90 sekuntia käynnistyksen jälkeen koneen ulkopuolelle ei ollut yhtään yhteyttä.
- Tämä dokumentaatiosivusto on julkaistu.
- **Oikea eteneminen (M2) on valmis ja oletuksena päällä:** Slayer-taso, mestaruus ja Hunt Pass
  (Elite-passi kaikille) tallentuvat. Se läpäisi pelitestin kertakäyttöisellä testitilillä, myös koko
  palvelinkokonaisuuden uudelleenkäynnistyksen yli.

## Työn alla {#in-progress}

- **Pelaajien siirto oikeaan etenemiseen (2.13).** Mitään ei siirretä automaattisesti: palvelimella,
  jolla oli jo pelaajia, he aloittavat Slayer-tasolta 1, ellei ylläpitäjä anna heille maksimitasoja
  tai valitse vanhaa tynkää (`PROGRESSION_MODE=stub`). Omalla palvelimellamme kaikki aloittavat
  alusta. Tynkäaikana pelanneen tilin siirtoa tasolle 1 ei ole vielä kokeiltu pelissä.
- **Pelin lähettämien tietojen tallennus (0.4)** on kytketty päälle. Se kerää seuraavalla
  pelikerralla, millaisia tallennuksia peli lähettää niille järjestelmille, jotka eivät vielä
  tallenna mitään. Näin tallennukset voidaan rakentaa oikeassa muodossa eikä arvailemalla.
- **Kaveripaketti (1.14)** on koottu: se tarkistaa tiedostot, asentaa DLL-tiedostot, rekisteröi
  kaverin ja käynnistää pelin. Sitä on testattu koepalvelinta vasten, mutta oikea kaveri ei ole vielä
  kokeillut sitä. Se odottaa Tailscalea ja kutsukoodeja. Sivulla
  [Liity kaverina]({{ friends_page.url | relative_url }}) kerrotaan, mitä paketti tekee.
- **Yhden komennon käynnistys, pysäytys ja tilannekatsaus** (`stack.ps1`) toimii jo omistajan
  koneella, mutta sitä ei ole vielä paketoitu.

---

## Viisi välitavoitetta {#milestones}

Työ on jaettu viiteen välitavoitteeseen, jotka on nimetty M0–M4 (M tulee englannin sanasta milestone
eli välitavoite). Arviot ovat karkeita.

### M0: Turvaverkko {#m0-safety-net}

Tämä tehdään ennen kuin mitään muutetaan. Kaikki pelaajien tallennukset ovat yhdessä tiedostossa,
joten ensin varmistetaan, ettei mitään voi menettää. Tietokannasta otetaan automaattisesti
varmuuskopioita, salaiset avaimet varmuuskopioidaan salattuina erikseen, ja testataan, että kaikki
säilyy, kun palvelin käynnistetään uudelleen. Lisäksi tallennetaan, mitä peli lähettää niille
järjestelmille, jotka eivät vielä tallenna mitään, ja estetään peliä ottamasta yhteyttä Epicin
vanhaan chat-palvelimeen. Pelaaja ei huomaa tästä mitään, ennen kuin jokin menee rikki. Silloin se on
ero tunnin menettämisen ja kaiken menettämisen välillä. Arvioitu koko on noin päivä. Varmuuskopiot,
uudelleenkäynnistystesti ja Epicin chat-palvelimen esto ovat valmiita; salaisuuksien varmuuskopio ja
pelin lähettämien tietojen tallennus ovat vielä kesken.

### M1: Pelataan yhdessä {#m1-play-together}

Tämä välitavoite tuo kaverit mukaan. Isännän kone jaetaan kavereille turvallisesti Tailscalella
(ohjelma, joka tekee salatun, yksityisen yhteyden koneiden välille), ja tilin voi luoda vain
kutsukoodilla. Jokainen saa oman käyttäjänimen, jota kukaan muu ei voi ottaa, ja kadonneen avaimen voi
korvata uudella. Ryhmät ja kaverilista rakennetaan, jotta kaverin voi kutsua samaan metsästykseen
tarkoituksella, ja muiden pelaajien nimet näkyvät oikein. Jokaisen kaverin saaliit tallentuvat hänen
omalle tililleen, haun peruminen toimii, ja tallennukset toimivat myös hyvin pitkissä pelikerroissa.
Kaverit saavat linkin palvelimen lähdekoodiin, kuten AGPL-lisenssi edellyttää, ja kaveripaketti tekee
liittymisestä helppoa. Lopuksi pidetään ensimmäinen yhteinen peli-ilta, jonka aikana palvelimen kuormaa
seurataan. Arvioitu koko on 1–2 viikkoa omaa työtä sekä ryhmien (parties) parissa muualla tehtävä työ.

### M2: Kaikki ansaittu tallentuu {#m2-everything-you-earn-is-saved}

Tällä hetkellä osa ansaitusta tallentuu ja osa ei. M2:n jälkeen myös Slayer-taso, aseiden ja
hirviöiden mestaruus, Hunt Pass, palkkiotehtävät, päivittäiset ja viikoittaiset rajoitukset,
Escalation ja useat varustesarjat tallentuvat oikeasti. Samalla varmistetaan, ettei esineitä voi
monistaa eikä kuluttaa enemmän kuin omistaa, tallennuksille tulee historia, jonka avulla pelaajan voi
palauttaa aiempaan versioon, ja ylläpitäjä saa työkalut rikkoutuneen tallennuksen korjaamiseen
minuuteissa. Ruudulla näkyvä rahamäärä korjataan vastaamaan sitä, mitä pelaajalla oikeasti on. Jokainen
uusi palvelimen vastaus testataan ensin koetilillä, koska väärin muotoiltu vastaus voi kaataa pelin. On
myös päätetty, että jokainen tili saa Elite Hunt Passin. Arvioitu koko on 3–5 viikkoa. Slayer-taso,
mestaruus, Hunt Pass ja oikeudet on jo tehty, testattu pelissä ja otettu oletuksena käyttöön; loput ovat
työn alla.

### M3: Koko peli toimii {#m3-the-full-game-loop}

Kun perusasiat toimivat, peliin tuodaan takaisin loput: muut metsästystyypit (partiot, vaikeammat
heroic-takaa-ajot ja tarinatehtävät), lootlaatikoiden eli corejen avaaminen, kaikki kosmeettiset
esineet, postilaatikko ja lahjat, tervetuloviesti, kauppa, Trials-haasteet tulostauluineen,
kausitapahtumat, tekstichat, killat (guilds) ja paluu samaan metsästykseen, jos peli kaatuu kesken.
Ensin tarkistetaan, mitkä pelin noin 90 sisäänrakennetusta ominaisuuskytkimestä ovat päällä, koska se
ratkaisee, kannattaako osaa näistä rakentaa. Tämä vie monta viikkoa, ja osa on tutkimustyötä, jonka
kestoa ei voi tietää etukäteen. Guild Gauntletia ei rakenneta, koska sitä ei ole versiossa 1.4.4, eikä
Aether Caster -aseita luvata.

### M4: Vakaa ja helppo ylläpitää {#m4-solid-to-run}

Viimeinen välitavoite tekee palvelimen pyörittämisestä helppoa ja turvallista. Kaatunut palvelu
käynnistyy itsestään uudelleen, ja kokonaisuus käynnistyy, kun omistaja kirjautuu koneelle. Lokit
pysyvät siisteinä, ja muistisuojat estävät karkaavaa palvelinta jumittamasta koko konetta.
Palvelimen DLL-tiedostot käännetään itse lähdekoodista, eikä konsoli-ikkunan sulkeminen voi enää
kaataa palvelinta. Päivitykset tehdään yhdellä turvallisella komennolla. Pidemmällä aikavälillä
selvitetään aina päällä olevaa palvelinkonetta, jotta kaverit voisivat pelata silloinkin, kun
omistajan kone on sammuksissa, ja kokeillaan, voisivatko pelipalvelimet pyöriä halvemmalla
Linux-koneella Wine-ohjelman avulla. Arvioitu koko on 1–2 viikkoa; aina päällä oleva kone on
valinnainen, isompi työ.

---

## Mitä pelaajan kannattaa tietää nyt {#what-to-tell-friends-right-now}

- Tavarat, materiaalit, Ramsit, valmistetut varusteet, tehtävät ja tarinan eteneminen tallentuvat.
- Slayer-taso, aseiden mestaruus ja Hunt Pass tallentuvat (oikea eteneminen on oletuksena päällä).
  Kaikki aloittavat tasolta 1, ja jokaisella on Elite Hunt Pass. Palkkiotehtävät tallentuvat, mutta
  niiden valitsemista ja lunastamista ei ole vielä kokeiltu pelissä.
- Älä vielä hajota cellejä (varusteisiin liitettäviä kykyesineitä) pölyksi. Kukaan ei ole
  tarkistanut, säilyykö pöly.
- Sulje peli vähintään kerran päivässä. Kirjautuminen vanhenee 24 tunnissa, ja sen jälkeen
  tallennukset voivat epäonnistua.

## Mitä ei voi palauttaa {#cant-come-back}

- **Äänichat.** Se toimi Vivoxilla, joka on maksullinen ulkopuolinen palvelu. Käytä Discordia.
- **Oikealla rahalla toiminut kauppa.** Yksityinen palvelin voi sen sijaan jakaa kosmeettiset
  esineet.
- **Marraskuun 2020 jälkeen julkaistu sisältö.** Versio 1.4.4 on sitä vanhempi.
  [Mystic Paradox](https://github.com/pranav158/Mystic-Paradox) siirtää samaa lähestymistapaa
  versioon 1.12.0.
- **Epic-alustan saavutukset.** Pelin sisäisten saavutusten edistyminen voi palata myöhemmin.
- **Alkuperäiset palkintoarvot:** palkkiotehtävien palkkiot, muiden kausien Hunt Pass -palkinnot ja
  kaupan hinnat. Kaikki, mitä asetamme niiden tilalle, on omaa suunnitteluamme.
- **Guild Gauntlet.** Sitä ei ole versiossa 1.4.4.

Kaikki yksityiskohdat, avoimet kysymykset ja kokeet, joilla ne ratkaistaan, löytyvät
[englanninkielisestä tarkistuslistasta]({{ roadmap_en.url | relative_url }}).
