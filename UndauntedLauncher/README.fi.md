# Dauntless Revived Launcher

*[In English](README.md)*

Windows-sovellus, jonka kaverit asentavat pelatakseen Dauntless Revived -palvelimella. Se liittyy
palvelimelle kutsulla, luo tilin, lataa ja tarkistaa Dauntless 1.4.4:n pelitiedostot ylläpitäjän
omalta palvelimelta, laittaa kaiken valmiiksi ja käynnistää pelin. Kielinä englanti ja suomi.

**Sovelluksessa tai tässä repositoriossa ei ole pelitiedostoja.** Ne tulevat ylläpitäjän
sisältöpalvelimelta, ja jokainen tiedosto tarkistetaan käynnistimeen käännettyä listaa vasten
(410 tiedostoa, koot ja SHA-256-tiivisteet, `UndauntedContent/data/dauntless-1.4.4.json`).
Palvelin, joka tarjoaa jotain muuta, hylätään.

## Kavereille

1. Asenna `DauntlessRevivedLauncher-Setup.exe` projektin julkaisuista. Sitä ei ole vielä
   allekirjoitettu, joten SmartScreen voi pyytää vahvistusta (Lisätietoja, sitten Suorita silti).
   Koneella, jossa tunnistamattomat sovellukset on asetettu estettäviksi, SmartScreen estää sen
   kokonaan eikä tarjoa Suorita silti -vaihtoehtoa. Tarkista silloin tiedosto saman julkaisun
   `SHA256SUMS.txt`-tiedostoa vasten (`Get-FileHash .\DauntlessRevivedLauncher-Setup.exe` -komennon on
   näytettävä sama SHA-256), poista esto (hiiren oikea > Ominaisuudet > Poista esto, tai
   `Unblock-File .\DauntlessRevivedLauncher-Setup.exe`) ja käynnistä se uudelleen. Allekirjoitus on
   tiekartan kohta 4.16.
2. Avaa ylläpitäjän lähettämä kutsulinkki tai liitä se Pelaa-sivulle ja paina **LIITY**.
3. Valitse käyttäjänimi ja paina **REKISTERÖIDY**. Tallenna avaimesta varmuuskopio, kun käynnistin
   tarjoaa sitä.
4. Paina **ASENNA** (noin 11 Gt). Voit pitää tauon, sulkea käynnistimen ja jatkaa myöhemmin.
5. Paina **PELAA**.

## Kaksi palvelintyyppiä

| | Yksityinen (kutsu v1) | Julkinen (kutsu v2) |
|---|---|---|
| Missä | ylläpitäjän koneella | palvelimella, jolla on julkinen IP |
| Miten kaverit yhdistävät | Tailscale | suoraan, TLS-yhteydellä palvelimen yhdyskäytävään |
| Kutsu | `dauntless-revived://join?v=1&host=…&port=61000&code=…&name=…[&share=…]` | `dauntless-revived://join?v=2&mode=public&host=…&port=443&fp=…&code=…&name=…` |

Julkisessa tilassa kutsussa on `fp`, palvelimen TLS-varmenteen SHA-256. Jokainen yhteys (tila,
rekisteröinti, lataukset ja itse peli) tarkistetaan sitä vasten ennen kuin mitään lähetetään.
Palvelin, jolla on eri varmenne, ei saa mitään, ja käynnistin kertoo, ettei tämä ole kaverisi palvelin.

Julkisen palvelimen tiliavain on sidottu tähän sormenjälkeen. Kutsu samaan osoitteeseen eri
varmenteella ei koskaan saa avainta: käynnistin näyttää molemmat sormenjäljet ja kysyy ensin, ja avain
siirtyy uudelle varmenteelle vain, jos vahvistat sen (tee niin vain, kun ylläpitäjä kertoo
asentaneensa palvelimen uudelleen). Yksityiset (v1) kutsut toimivat vain Tailscale-osoitteilla
(100.64.0.0/10) ja `*.ts.net`-nimillä, koska se yhteys on salaamatonta HTTP:tä tailnetin sisällä.
(Myös koneen omat loopback-osoitteet, kuten `127.0.0.1`, hyväksytään, jotta käynnistintä voi kokeilla
samalla koneella olevaa palvelinta vasten.)

Dauntless 1.4.4 osaa vain salaamatonta HTTP:tä, joten julkisessa tilassa käynnistin pitää pelin ajan
käynnissä **paikallista välitintä**: peli puhuu omalla koneellasi osoitteeseen
`http://127.0.0.1:61000`, ja välitin kuljettaa jokaisen pyynnön (ja chatin WebSocketin) lukitulla
TLS-yhteydellä palvelimelle. Pidä käynnistin auki pelatessasi; se kysyy ennen sulkemista, jos peli on
käynnissä. Välitin kuuntelee vain osoitteessa 127.0.0.1 ja hylkää verkkosivuilta tulevat pyynnöt.

## Tietoturva

- Sivu on eristetty (sandbox, context isolation, ei Node-oikeuksia). Se ei pääse verkkoon lainkaan:
  pääprosessi tekee jokaisen pyynnön, ja vain kutsun palvelimelle. Sivu puhuu pääprosessille pienen
  tyypitetyn rajapinnan kautta (`src/preload.ts`), ja jokainen argumentti tarkistetaan uudelleen.
- Tiukka Content-Security-Policy. Kuvat tulevat vain sovelluksesta itsestään tai ylläpitäjän
  kuvapaketista, jonka pääprosessi hakee lukitulla yhteydellä.
- Siirtymät ja uudet ikkunat on estetty. Linkit avautuvat selaimeen vain kiinteältä sallittujen
  listalta.
- Tiliavain tallennetaan vain Windowsin DPAPI:lla (`safeStorage`). Sitä ei näytetä, sitä ei kirjoiteta
  tavalliseen tiedostoon (paitsi itse tallentamaasi varmuuskopioon), ja se peitetään lokissa.
- Avain lähetetään vain kutsun palvelimelle (julkisessa tilassa vain lukitun yhteyden kautta): tilin
  tarkistuksen, latausten ja palvelimen tilan mukana. Palvelin näyttää paikalla olijat vain
  rekisteröityneille pelaajille, joten ennen rekisteröitymistä palvelinpaneeli pyytää kirjautumaan
  eikä listaa ketään. Ennen tätä muutosta julkaistut käynnistimet eivät lähetä avainta eivätkä tunne
  tätä vastausta: muutoksen sisältävää palvelinta vasten ne näyttävät 0 pelaajaa paikalla eikä yhtään
  maailmaa, kunnes ne päivittävät itsensä. Päivitä vanhempi palvelin vasta, kun muutoksen sisältävä
  käynnistin on julkaistu.
- Electron-fuset: ei `ELECTRON_RUN_AS_NODE`-, `NODE_OPTIONS`- eikä debug-lippuja, ja sovelluskoodi
  ladataan vain eheystarkistetusta asar-paketista.
- Pelin tarvitsemat kaksi DLL:ää tulevat käynnistimen mukana, ja ne tarkistetaan lukittuja tiivisteitä
  vasten ennen kopiointia ja ennen jokaista käynnistystä, kuten `friend-kit/play.ps1` tekee.

## Kehitys

Vaatimukset: Windows ja Node.js 24.

```powershell
npm ci
npm run typecheck
npm test            # yksikkötestit (node:test), paikalliset testipalvelimet vain porteissa 62012-62013 ja 624xx
npm run make        # asennusohjelma ja zip kansioon out/make/
```

`DAUNTLESS_REVIVED_RELAY_PORT` siirtää välittimen pois portista 61000 harjoituksia varten koneella,
jolla portti 61000 on varattu. Palvelimen `QOS_TARGET_URL` pitää silloin osoittaa samaan porttiin.

## Julkaisut ja päivitykset

CI (`.github/workflows/ci.yml`) kääntää ja testaa käynnistimen jokaisen pushin yhteydessä ja pitää
asennusohjelman, zipin ja `SHA256SUMS.txt`:n ladattavana viikon ajan.
`.github/workflows/launcher-release.yml` julkaisee `package.json`-tiedoston version
`dauntless-revived`-haarasta GitHub-julkaisuna `launcher-v<versio>`, jokaiselle tiedostolle
allekirjoitetun käännöstodistuksen (build provenance attestation) kera, ja luo sen tagin. Uusi julkaisu
syntyy siis nostamalla versiota:

- oletuksena `dauntless-revived`-haaran push, joka läpäisee kaikki tarkistukset ja jonka versiolla ei
  ole vielä `launcher-v<versio>`-julkaisua, julkaisee CI:n kääntämän asennusohjelman. Tauon saat
  asettamalla repositorion muuttujan `LAUNCHER_AUTO_RELEASE` arvoon `false` (Settings > Secrets and
  variables > Actions > Variables);
- tai aja Actions > **Launcher release** > **Run workflow** `dauntless-revived`-haaralle.

Julkaisun jälkeen työnkulku siirtää jatkuvan `launcher-updates`-julkaisun uuteen versioon; asennetut
käynnistimet tarkistavat sen tunnin välein ja päivittävät itsensä. Versio julkaistaan vain, jos se on
uudempi kuin kaikki aiemmat, eikä julkaistua versiota koskaan korvata. Esiversio (kuten
`0.2.0-beta.1`) julkaistaan GitHubin esijulkaisuna, eikä se koskaan päädy `launcher-updates`-julkaisuun.
Jos ajo epäonnistuu kesken, aja sen epäonnistuneet työt uudelleen: se viimeistelee aloittamansa. Jo
julkaistulle versiolle ajettu työnkulku vain päivittää `launcher-updates`-julkaisun siihen. Pidä
GitHubin muuttumattomat julkaisut (immutable releases) pois päältä, koska `launcher-updates`-julkaisua
päivitetään paikallaan.

## Lisenssi

AGPL-3.0-only. Perustuu gwogin (Gregory Morford) ja muiden tekijöiden Undaunted-käynnistimeen.
Epävirallinen faniprojekti, jolla ei ole yhteyttä Phoenix Labsiin tai Epic Gamesiin.
