---
title: Tekstichat
parent: Löydökset
grand_parent: Dauntless Revived suomeksi
nav_order: 10
lang: fi
ref: findings/chat
locale: fi_FI
description: "Miten Dauntless 1.4.4 käyttää tekstichattia palvelimemme kanssa, luettuna ohjelmatiedostosta: miksi ensimmäinen chat-palvelin näytti nimien sijaan UID-...-tunnuksia, huoneiden nimimerkki ja miten tarkistamme sen, mitkä huoneet on olemassa ja kuka niihin pääsee sekä mikä on vielä vahvistamatta."
---

{% assign api_page = site.pages | where: "path", "fi/reference/api.md" | first %}
{% assign config_page = site.pages | where: "path", "fi/reference/configuration.md" | first %}
{% assign ports_page = site.pages | where: "path", "fi/reference/ports.md" | first %}
{% assign social_page = site.pages | where: "path", "fi/findings/social.md" | first %}
{% assign trouble_page = site.pages | where: "path", "fi/setup/troubleshooting.md" | first %}
{% assign winserver_page = site.pages | where: "path", "fi/setup/windows-server.md" | first %}

# Tekstichat versiossa 1.4.4
{: .no_toc }

Tämä sivu kertoo, miten **1.4.4**-peliohjelman tekstichat toimii palvelimemme kanssa: Ramsgaten ja
metsästysten chat, ryhmächat (party), kiltachat (guild) ja kuiskaukset. Sivu selittää, miksi
ensimmäinen chat-palvelin näytti jokaisen lähettäjän muodossa `UID-...`, mitä peliohjelma tarvitsee
näyttääkseen käyttäjänimet, miten palvelin estää ketään esiintymästä toisena pelaajana ja mikä on
vielä vahvistamatta.

**Tilanne 22.9.2026: rakennettu ja testattu ilman peliä, oletuksena pois päältä, kaksi pelaajaa ei ole
vielä kokeillut.** Chat-kuuntelija toimii metagamen sisällä, kun `CHAT=1`
([Asetukset]({{ config_page.url | relative_url }}#metagame-chat)). Jokainen alla oleva sääntö on
katettu testeillä, jotka syöttävät palvelimen vastaukset ohjelmatiedostosta luettuun peliohjelman
malliin. Kahden pelaajan testi vuokratulla palvelimella vahvistaa tai korjaa ne.

Ensimmäisen chat-palvelimen kirjoitti ja testasi oikealla 1.4.4-pelillä **Vvoidddd**
([pull request #9](https://github.com/mixutin/dauntless-revived/pull/9)). Tämä sivu selittää hänen
havaintonsa, ja palvelin on kasvanut hänen koodistaan.

<details open markdown="block">
  <summary>Sisältö</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Todisteet ja varmuus {#evidence-and-confidence}

| Merkki | Lähde |
|:-------|:------|
| **B** | 1.4.4-ohjelmatiedosto (`Dauntless-Win64-Shipping.exe`): merkkijonot ja konekielinen koodi. Osoitteet ovat muistiosoitteita, joiden perusosoite on `0x140000000`. |
| **S** | Vahva päätelmä: yksi ketjun lenkki on jäljittämättä. |
| **G** | Arvaus tai oma suunnitteluratkaisumme, kun peliohjelma ei ratkaise asiaa. |
| **O** | Vvoidddd näki tämän oikealla 1.4.4-pelillä 22.9.2026 (yksi peliohjelma). |
| **C** | Oma koodimme ja testimme. |

## Miten chat tulee palvelimelle {#transport}

Pelin chat on XMPP:tä WebSocketin yli. Yhteys määritetään tiedostossa `Engine.ini`
(`[OnlineSubsystemMcp.XMPP]`), ja käynnistin ja palvelinpaketti ohjaavat sen pois Epiciltä
([Portit ja verkko]({{ ports_page.url | relative_url }}#chat-port)).

- **Julkinen tila** (vuokrattu palvelimemme): peli ottaa yhteyden käynnistimen paikalliseen välittimeen
  (`ws://127.0.0.1:61000`), joka vie yhteyden TLS-salattuna yhdyskäytävälle, joka välittää sen
  metagamen chat-kuuntelijalle osoitteeseen `127.0.0.1:61099`. Pyynnön polku on `//` eikä `/`
  (B `0x1441f761f`), ja jokainen välivaihe hyväksyy sen (C). Palomuurisääntöä ei tarvita: 61099 pysyy
  paikallisena, ja käynnistimet versiosta 0.1.0 alkaen välittävät yhteyden jo.
- **Yksi kone**: peli ottaa yhteyden suoraan osoitteeseen `ws://127.0.0.1:61099`.
- **Yksityinen tila** (Tailscale): ei vielä tuettu. Kuuntelija ei suostu kuuntelemaan muuta kuin
  paikallista osoitetta.

Peliohjelma kirjautuu SASL PLAIN -menetelmällä ja lähettää tilitunnuksensa sekä saman allekirjoitetun
tunnisteen (token), jota se käyttää metagamen kanssa (B `0x144218640`). Palvelin tarkistaa tunnisteen
ja sen, että se kuuluu juuri tälle tilille, ennen mitään muuta. Sitten peliohjelma sitoo resurssin
muotoa `V2:<AppId>:WIN::<32 heksamerkkiä>`, joka on uusi joka kirjautumisella (B `0x143a3ca5a`), ja
palvelin palauttaa sen muuttamattomana.

## Miksi ensimmäinen palvelin näytti UID-... {#why-uid}

Peliohjelma liittyy jokaiseen huoneeseen **nimimerkillä**, jonka se rakentaa itse (B `0x1408b5aeb`):

```
Printf("%s:%s:%s", UrlEncode(DisplayName), AccountId, OwnResource)
  -> Alpha:UID-aaaa...:V2:MissingGameServiceForAppId:WIN::A1B2...
```

Käyttäjänimi on siis jo mukana, ensimmäisessä osassa. Peliohjelma lukee nimen rivin lähettäjän
nimimerkistä: se jakaa nimimerkin `:`-merkin kohdalta, ottaa ensimmäisen osan (URL-dekoodattuna)
nimeksi ja toisen tilitunnukseksi, ja jäsenen tunnuksen se ottaa läsnäolotiedon kohdasta
`<item jid>`, jos sellainen on (B `0x1408fe300`, `0x1408c3500`).

Ensimmäinen palvelin heitti nimimerkin pois. Se vastasi jokaiseen liittymiseen ja lähetti jokaisen
viestin osoitteesta `<huone>/UID-...` ilman kohtaa `<item jid>`. Tässä resurssissa ei ole `:`-merkkiä,
joten peliohjelma otti koko resurssin, `UID-...`, nimeksi ja huoneen JID:n koko polun jäsenen
tunnukseksi (B `0x1408c3686`, `0x1408aea40`). Sellaista tiliä ei ole, joten pelaajan omatkin rivit
kulkivat "toisen jäsenen" polkua: tilihaku ei löytänyt ketään, ja peliohjelma käytti nimeä, joka sillä
oli, eli `UID-...` (B `0x1408fe9c0` -> `0x140987d90`, `0x14097fc20`). XEP-0172:n `<nick>`-elementti ei
auta: sen nimiavaruutta ei ole ohjelmatiedostossa (B).

### Mitä kukin yritys teki ja miksi {#attempts}

| Mitä kokeiltiin (O) | Mitä peli teki (O) | Miksi (B) |
|:--------------------|:-------------------|:----------|
| Vastaus osoitteesta `<huone>/UID-...` | Liittyminen onnistui; rivien lähettäjänä näkyi `UID-...`. | Peliohjelman "olenko tämä minä?" -testi etsii omaa tilitunnustaan nimimerkistä kirjainkoko huomioiden (`0x143a34acd`-`0x143a34aec`), joten liittyminen onnistui. Nimi: katso yllä. |
| Vastaus osoitteesta `<huone>/<käyttäjänimi>` (myös tilakoodilla 210) | Liittymiset jäivät kesken; seuraava liittyminen sanoi "Another operation already pending". | Käyttäjänimessä ei ole tilitunnusta, joten peliohjelma ei koskaan tunnistanut omaa läsnäolotietoaan, ja huone jäi tilaan JoinPublicPending (4). Uusi liittyminen huoneeseen, joka on tilassa 4, hylätään (`0x143a32938`-`0x143a32990`). Tilakoodeja 110 ja 210 ei lueta. |
| Läsnäolotieto osoitteesta `UID-...`, viestit osoitteesta `<käyttäjänimi>` | `[unknown]` | Rivi yhdistetään lähettäjäänsä saman huone-JID:n aiemman läsnäolotiedon kautta (`0x1408a83c0`). Mikään ei täsmännyt, joten lähettäjälle jäi oletusnimimerkki "unknown" (`0x14087ed65`). |
| `JoinPublicRoom failed. Not currently connected` City- ja Party-huoneille | (peliohjelman lokissa) | XMPP-yhteys ei ollut kirjautuneena juuri noiden liittymisten hetkellä (`0x143a327fe`); peliohjelma yrittää niitä uudelleen (S). Tällä ei ole mitään tekemistä nimien kanssa. |

Hänen johtopäätöksensä "pidä UID huoneen osoitteessa" sopii näihin tuloksiin, mutta syy on toinen:
tilitunnus kuuluu huoneen osoitteeseen nimimerkin sisällä ja yhdessä käyttäjänimen kanssa, täsmälleen
niin kuin peliohjelma sen lähetti.

Toinen pelaaja olisi nähnyt hänen rivinsä muodossa `[unknown]`: ensimmäinen palvelin ei koskaan
kertonut muille huoneessa olijoille, että joku oli liittynyt (peliohjelman mallimme ennustaa tämän;
sitä ei koskaan ajettu kahdella peliohjelmalla).

## Mikä saa nimet näkymään {#names}

Kolme palvelimen sääntöä, kaikki tiedostossa `src/realtime/muc.ts` (C):

1. **Pidä jokainen nimimerkki tavu tavulta ennallaan** ja käytä sitä jokaisessa kyseisen huoneessa
   olijan `from`-osoitteessa, niin läsnäolotiedoissa kuin viesteissäkin. Älä koskaan vaihda tilalle
   tilitunnusta tai näyttönimeä, älä anna nimimerkkiä äläkä nimeä uudelleen törmäyksessä.
2. **Laita jokaiseen huoneessa olijan läsnäolotietoon `<item jid="<tili>@<verkkotunnus>/<resurssi>">`**,
   myös pelaajan omaan. Jäsenen tunnus tulee siitä.
3. **Kerro huoneessa olijoille toisistaan molempiin suuntiin**, ja lähetä jokainen huoneviesti myös
   takaisin lähettäjälleen samasta huone-JID:stä. Ilman aiempaa läsnäolotietoa rivi näkyy muodossa
   `[unknown]`.

Järjestyksellä on väliä (B `0x143a34c19`, `0x143a34c0f`): liittyjä kuulee ensin kaikista jo huoneessa
olevista, sitten he kuulevat liittyjästä, ja liittyjän oma läsnäolotieto (tilakoodi 110) tulee
viimeisenä. Juuri oma läsnäolotieto viimeistelee liittymisen liittyjän ruudulla.

Poistumiseen vastataan pelaajan omalla unavailable-läsnäolotiedolla (tilakoodi 110) muille lähtevän
ilmoituksen lisäksi. Ilman sitä huone jää tilaan ExitPending (5), ja seuraava liittyminen siihen
hylätään.

Metagameen ei tarvittu muutoksia nimiä varten. Molemmat tilihaut, joita peliohjelma käyttää, vastaavat
jo `displayName`-kentällä, kun kysyjällä on voimassa oleva tunniste. Kirjautumisvastauksen
`displayName`-kenttää peliohjelma ei lue koskaan (B `0x1408e8303`, `0x1408a8a10`), joten sen
lisääminen ei muuttaisi mitään.

## Mitä kukin pelaaja näkee {#what-each-player-sees}

| Rivi | Mistä nimi tulee |
|:-----|:-----------------|
| Toisen pelaajan huonerivi | `GET /account/api/public/account?accountId=<tunnus>`, sen pelaajan `displayName`. Tunnus tulee kohdasta `<item jid>` (B `0x1408fe9c0` -> `0x140987d90`). |
| Oma huonerivisi | Peliohjelma tunnistaa jäsenen tunnuksen omakseen (B `0x1408febd5`) ja näyttää oman sosiaalisen nimensä (S: saman nimen, jonka Sosiaalinen-paneeli näyttää sinulle). |
| Kuiskaus | Sama tilihaku. Jos lähettäjää ei löydy, kuiskaus jää odottamaan (S). |
| Kun tilihaku ei löydä ketään | Nimimerkin ensimmäinen osa URL-dekoodattuna (B `0x14097fc20`; toimitettu asetus luottaa siihen). |
| "Liittyi huoneeseen"- ja "poistui huoneesta" -ilmoitukset | Luultavasti nimimerkin ensimmäinen osa (G). |

Peliohjelman oma nimi tulee kirjautuessa reitiltä `GET /account/api/public/account/<oma tunnus>`, ja
sen lukee `GetPlayerNickname` (B `0x14092bad0`). Jos haku epäonnistuu, nimi on kirjaimellisesti
`InvalidMCPUser`, ei koskaan tyhjä (B `0x14092bc0b`). Kun ylläpitäjä vaihtaa pelaajan nimen,
peliohjelma pitää vanhan nimen seuraavaan kirjautumiseen asti (S).

## Nimimerkin tarkistus (toisena esiintymisen esto) {#nickname-check}

Nimimerkki on ainoa peliohjelman hallitsema teksti, jonka muut peliohjelmat lukevat. Palvelin tietää
jokaisen yhteyden tilin sen tunnisteesta, joten liittyminen **hylätään**, ellei nimimerkki ole
täsmälleen:

```
<nimi>:<oma tilitunnus>:<oma sidottu resurssi>
```

- Ensimmäisen `:`-merkin jälkeisen osan on oltava yhteyden oma tilitunnus ja resurssi kirjainkoko
  mukaan lukien (lokissa `nick-account` tai `nick-resource`).
- Mitään muuta tilitunnusta ei saa olla missään kohtaa nimimerkkiä. Peliohjelman "olenko tämä minä?"
  -testi on osamerkkijonohaku, joten vieraan nimimerkki, jossa on sinun tunnuksesi, näyttäisi sinun
  ruudullasi omalta läsnäolotiedoltasi, ja hänen poistumisensa päättäisi sinun jäsenyytesi
  (`nick-account`).
- Osassa `<nimi>` saa olla vain merkkejä, joita peliohjelman URL-koodaaja kirjoittaa:
  `A-Z a-z 0-9 - _ . ~` ja `%XX` (B `0x1428aebb0`). Sen on dekoodauduttava kelvolliseksi UTF-8:ksi
  (`nick-format`).
- Dekoodattuna osan `<nimi>` on oltava tilin käyttäjänimi (nykyinen tai chat-kirjautumisen hetken
  nimi) tai peliohjelman varanimi `InvalidMCPUser` (`nick-name`).

Oikeaa peliohjelmaa ei koskaan hylätä: sen koodaaja kirjoittaa vain noita merkkejä, vertailu tehdään
dekoodatulle tekstille (joten heksamerkkien kirjainkoolla ei ole väliä), ja sen nimi on käyttäjänimi,
jonka oma tilireittimme antoi. Yksi poikkeus: kun ylläpitäjä vaihtaa pelaajan nimen, pelaaja
käynnistää pelin uudelleen, ennen kuin chat toimii taas.

Palvelin **ei koskaan kirjoita** nimimerkkiä uudelleen: uudelleen kirjoitettu nimimerkki rikkoo
liittyjän oman "olenko tämä minä?" -testin, ja liittyminen jää roikkumaan, kuten käyttäjänimikokeilu
yllä osoitti. Hylätty liittyminen on virheläsnäolotieto (error presence), ja peliohjelma pudottaa
keskeneräisen huoneen siististi ja ilmoittaa epäonnistuneesta liittymisestä (B `0x143a34d80`; sama
takaisinkutsu kuin onnistuneella liittymisellä, `0x143a298a8`). Hylkäys ei siis koskaan jätä jälkeensä
"Another operation already pending" -tilannetta.

`CHAT_NICK_CHECK=log` päästää sisään nimimerkin, joka rikkoo resurssi-, muoto- tai nimisääntöä, ja
kirjoittaa varoitusrivin. Se on paluukytkin siltä varalta, että oikea peliohjelma hylätään testissä,
ei tavallinen asetus. Tilitunnussääntö (`nick-account`) pätee molemmissa tiloissa: oikea peliohjelma
rakentaa nimimerkkinsä aina omasta tilitunnuksestaan (B `0x1408b5aeb`), joten sen rikkoo vain
väärennetty nimimerkki.

## Huoneet ja kuka niihin pääsee {#rooms}

Peliohjelma nimeää huoneensa itse (B: rakentajat suluissa). Ne kaikki ovat osoitteessa
`muc.<verkkotunnus>`, jossa verkkotunnus on se, jonka peliohjelma lähetti kohdassa `<open to>`;
peliohjelma hyväksyy huoneen läsnäolotiedon omakseen vain täsmälleen tästä verkkotunnuksesta
kirjainkoko mukaan lukien (B `0x143a379d2`).

| Huone | Chat-kanava | Kuka pääsee |
|:------|:------------|:------------|
| `City-<istunnon tunnus>` | Normal, Ramsgatessa (`0x141568c20`) | Kuka tahansa kirjautunut pelaaja |
| `Hunt-<istunnon tunnus>` | Normal, metsästyksellä | Kuka tahansa kirjautunut pelaaja |
| `Party-<ryhmän tunnus>` | Party Chat (`0x1415ad14f`) | Vain sen ryhmän jäsenet |
| `Guild-<killan tunnus>` | Guild Chat (`0x1415bb270`) | Vain sen killan jäsenet |
| `General<tunnus>` | "General Chat" (`0x1415669e0`, ei kutsujaa versiossa 1.4.4) | Kuka tahansa kirjautunut pelaaja |
| kaikki muu (`Lobby...`, muut kirjoitusasut tai kirjainkoot) | ei mikään | Hylätään |

- Jäsenyys tarkistetaan liittyessä, jokaisen viestin kohdalla (lähettäjältä ja jokaiselta
  vastaanottajalta) ja 60 sekunnin välein. Pelaaja, joka on lähtenyt ryhmästä tai killasta (potkut,
  vanhentunut peliohjelma), poistetaan huoneesta tilakoodilla 307, jonka peliohjelma käsittelee
  palvelimen aloittamana huoneesta poistumisena.
- Huoneriviä ei toimiteta pelaajalle, joka on estänyt lähettäjän. Kuiskausta ei toimiteta, jos
  jompikumpi pelaaja on estänyt toisen (sama sääntö kuin ryhmäkutsuissa).
- Saman tilin kaksi yhteyttä eivät koskaan näe toisiaan huoneessa: peliohjelman "olenko tämä minä?"
  -testi pitäisi toisen läsnäolotietoa omanaan.
- Samasta tilistä on huoneessa kerrallaan vain yksi yhteys. Kun pelaaja yhdistää uudelleen ja vanha
  yhteys vielä roikkuu (vaikkapa langaton verkko katkesi hetkeksi), uusi yhteys ottaa jokaisen
  huoneen, johon se liittyy, vanhalta yhteydeltä: muut saavat ensin vanhan yhteyden poistumisen ja
  sitten uuden liittymisen. Vanhalle yhteydelle ei kerrota, ja se pingataan pois 10 sekunnin päästä.
  Syy on peliohjelmassa: se pitää huoneesta yhden jäsenen tilitunnusta kohden. Saman tilin
  läsnäolotieto päivittää jäsenen, ja poistuminen poistaa jäsenen poistuvan nimimerkin tilitunnuksen
  mukaan (B `0x1408fe300`; `0x1408c0680` -> `0x1408e1ce0`). Rivin lähettäjä etsitään sitten jäsenistä
  huoneosoitteen perusteella (B `0x1408a83c0`). Jos vanha yhteys poistuisi vasta myöhemmin, pingin
  aikakatkaisussa, se poistaisi jäsenen, jonka uusi yhteys oli juuri päivittänyt, ja muut näkisivät
  pelaajan rivit muodossa `[unknown]`, kunnes pelaaja poistuisi huoneesta ja liittyisi uudelleen.
- Palvelin ei säilytä historiaa eikä lähetä huoneen aihetta.

**Ramsgaten chat on nyt istuntokohtainen.** Jokainen pelaaja saa Ramsgateen oman istuntotunnuksen,
joten kaksi pelaajaa on samassa `City-`-huoneessa vain, kun he matkustivat sinne yhdessä ryhmänä.
Yhteinen Ramsgate-kanava kaikille saman palvelimen pelaajille on myöhempi vaihe (tiekartta 3.10).

## Ryhmien turvallisuus {#party-safety}

Peliohjelmassa on automaattinen potku ryhmän jäsenille, jotka näyttävät olevan poissa (B
`0x1415f6f60`). Se toimii vain, kun paikallisen pelaajan oma Phoenix-läsnäolotieto on "paikalla" (B
`0x1415f7562`), ja se lukee vain tätä läsnäolotietoa. Palvelimemme **ei lähetä läsnäolotietoja
chat-huoneiden ulkopuolella**: se kirjaa peliohjelman oman yleisläsnäolotiedon ja pudottaa sen,
eikä koskaan kaiuta tai välitä sitä. Huoneiden läsnäolotiedot tulevat osoitteesta
`muc.<verkkotunnus>`, jonka läsnäolomoduuli jättää huonekoodille (B `0x143a381d0`). Automaattinen
potku pysyy siis lepotilassa. Testissä tarkistetaan, että kahden hengen ryhmä pitää molemmat jäsenet
minuutin ajan chatin ollessa päällä
([Kaverit, ryhmät ja killat]({{ social_page.url | relative_url }}#parties)).

Kavereiden paikalla olon näyttäminen tarvitsee läsnäolotietoja, joten se ei kuulu tähän vaiheeseen.

## Yhteydet ja rajat {#limits}

- **Kaatumissuoja.** Jokaisella yhteydellä on virheenkäsittelijä, ja jokainen viestinkäsittelijä on
  suojattu. Liian suuri kehys, virheellinen UTF-8 tai huono WebSocket-toimintokoodi päättää vain sen
  yhden yhteyden, ei koskaan metagamea.
- **Ei uudelleenyhdistämisen silmukoita.** Peliohjelma yhdistää uudelleen heti seuraavalla
  kierroksella, kun muodostettu yhteys katkeaa (B `0x140939988`). Siksi palvelin ei koskaan sulje
  kirjautunutta yhteyttä huonon syötteen takia: se pudottaa viestin ja laskee sen. Vain peliohjelman
  `<close/>`, vastaamaton ping, korvaaminen, sammutus, liian suuri kehys, lukematta jäävä lähtevä
  liikenne tai jatkuva väärinkäyttö päättää yhteyden. Korvaaminen, väärinkäyttö, liian suuri kehys ja
  lukematta jäävä liikenne pidättävät tilin seuraavaa kirjautumista 60 sekuntia, jolloin peliohjelma
  odottaa 15-45 sekuntia (B `0x14093a3ee`). Vastaamaton ping ei pidätä: yksi uudelleenyhdistäminen
  sen jälkeen ei ole silmukka.
- **Pingit ja kartan lataukset.** Kun peliohjelmalta ei ole tullut mitään 50 sekuntiin, palvelin
  pingaa sitä ja päättää yhteyden, jos vastausta ei tule seuraavien 100 sekunnin aikana. Peliohjelma
  vastaa pingiin vain pelisäikeen kierroksella: käsittelijä vain panee sen jonoon (B `0x143a2a690`),
  ja `FXmppPingStrophe::Tick` rakentaa vastauksen, kun yhteys on kirjautunut (B `0x143a3eb90`,
  tarkistus kohdassa `0x143a3ed99`). Pitkä kartan lataus pysäyttää tuon kierroksen hyvin
  todennäköisesti (S: näin Unreal toimii, tätä ei ole jäljitetty). Peliohjelman omat ping-asetukset
  (60 s, 30 s, yksi uusinta: B `0x143a1f367`-`0x143a1f37b`) sallivat noin 150 sekunnin hiljaisuuden
  (S), ja niin sallii nyt palvelinkin. 30 sekunnin rajalla metsästysmatka olisi voinut katkaista
  pelaajan chatin minuutiksi tai kahdeksi.
- **Istunnot.** Enintään kaksi sidottua yhteyttä tiliä kohden; kolmas korvaa pisimpään hiljaa
  olleen. Uusi yhteys pingaa vanhemman, ja se päätetään haamuna, jos se ei vastaa 10 sekunnissa.
  Kun vielä kirjautuvat lasketaan mukaan, tilillä on enintään kolme yhteyttä: uusi kirjautuminen
  sulkee vanhimman, joka ei ole vielä sitoutunut. Yhteyden on sitouduttava 10 sekunnissa
  kirjautumisesta.
- **Ennen kirjautumista** yhteys saa neljä kehystä ja yhden kirjautumisyrityksen; peli tarvitsee
  `<open>`-, `<auth>`- ja hylkäyksen jälkeen vanhan kirjautumistapansa viestin. Kahdeksan yhteyden
  raja osoitetta kohden laskee jokaisen yhteyden, joka ei ole vielä sitoutunut.
- **Lukematta jäävä liikenne.** Kun yhdelle yhteydelle odottaa lähtemättä 256 KiB (peliohjelma
  lakkasi lukemasta), palvelin ei lähetä sille enää mitään ja päättää sen (`reason=backlog`).
- **Hylätyt liittymiset** lasketaan kukin väärinkäytön rajaan, ja ne kirjataan lokiin kerran
  yhteyttä, huonetyyppiä ja syytä kohden 10 minuutin välein, huoneen nimi 80 merkkiin katkaistuna.
- Rajat (viestin koko, tahdit, huoneita pelaajaa kohden) ovat sivulla
  [Asetukset]({{ config_page.url | relative_url }}#metagame-chat). Viestien tekstiä, tunnisteita tai
  pyyntöjen otsakkeita ei kirjata lokiin koskaan.

## Testaus ilman peliä {#testing-without-the-game}

`UndauntedMetagame/test/chatclient.ts` on malli siitä, miten peliohjelma lukee chattia, yllä olevine
osoitteineen. Kun sille syötetään ensimmäisen palvelimen vastaukset, se toistaa sen, mitä Vvoidddd
näki: lähettäjänä `UID-...`, liittyminen jumissa ilmoituksella "Another operation already pending"
ja `[unknown]`. Kun sille syötetään meidän vastauksemme, jotka on kaapattu testissä oikealta
palvelimelta, molemmat pelaajat näkevät käyttäjänimet. Peliohjelman tavoin malli pitää huoneesta
yhden jäsenen tiliä kohden, joten se näyttää myös, mitä uudelleenyhdistäminen tekisi muiden
näkymälle. WebSocket-testit vievät kaksi ja kolme pelaajaa liittymisten, viestien, poistumisten,
vanhan yhteyden vielä roikkuessa tehdyn uudelleenyhdistämisen, nimimerkkisääntöjen, ryhmä- ja
kiltahuoneiden, estojen, kuiskausten, istuntojen, pingien, rajojen ja kaatumissuojan läpi, ja yksi
testi hakee nimet oikeiden tilireittien kautta.

## Näin se tarkistetaan {#how-to-verify}

Kahden pelaajan testi vuokratulla palvelimella.

**Ennen testiä**, kun kukaan ei pelaa (jokainen vaihe käynnistää kokonaisuuden uudelleen, mikä
pudottaa muistissa olevat ryhmät ja matchmaking-jonot):

1. **Päivitä palvelin tähän versioon.** Omalta koneelta: `Deploy-Remote.ps1 -Server <osoite> -Update`
   (tai palvelimella `Update-DauntlessServer.ps1`). `Set-Chat.ps1` tulee päivityksen mukana: vanhemmassa
   versiossa (vuokrattu palvelin ajaa versiota 9f3f78b) sitä ei vielä ole. `-Chat` ei käy yhdessä
   valinnan `-Update` kanssa, joten chatin kytkeminen on toinen ajo.
2. **Ensimmäistä ajoa varten lisää `CHAT_TRACE=1`** tiedostoon
   `C:\DauntlessRevived\data\config\metagame.env` nyt, ennen chatin kytkemistä: seuraavan vaiheen
   uudelleenkäynnistys ottaa sen käyttöön.
3. **Kytke chat päälle:** `Deploy-Remote.ps1 -Server <osoite> -Chat On` (tai palvelimella
   `Set-Chat.ps1 -On`; katso [Windows-palvelin]({{ winserver_page.url | relative_url }}#chat)).
4. **Tarkista**, että `Stack.ps1 status` näyttää rivin `chat             : listening 127.0.0.1:61099`
   ja että metagamen lokissa on `chat: listening on 127.0.0.1:61099 (nick check enforce)`.
5. Kumpikin pelaaja käyttää omaa tiliään ja mitä tahansa käynnistintä versiosta v0.1.0 alkaen (jokainen
   välittää chatin; 0.1.5:ssä on päivitetyt tekijätiedot). He käynnistävät pelin vasta, kun chat on
   päällä; jo käynnissä ollut peli yhdistää noin 45 sekunnissa.

Alla olevat rivit ovat metagamen lokista.

1. **A käynnistää pelin.** `EOS Account Info for <A> by <A>: found`, sitten `chat: connect ... via=gateway`,
   `chat: login ok ... uid=<A>` ja `chat: bound ... uid=<A> resource=V2:... sessions=1`. A:lle ei tule
   toista `bound`-riviä seuraavien minuuttien aikana.
2. **A seisoo Ramsgatessa.** `chat: join room=City-<tunnus> uid=<A> name=<A:n käyttäjänimi>` ja sama
   huoneelle `Party-<P>`. Ei `join refused` -riviä eikä muutaman sekunnin välein toistuvaa `rejoin`-riviä.
3. **A kirjoittaa Normal-kanavalle.** `chat: message room=City-<tunnus> uid=<A> len=<n> to=1`. A näkee
   rivin kerran, omalla nimellään.
4. **B käynnistää pelin ja liittyy A:n ryhmään.** B saa vaiheen 1 rivit, sitten
   `party: accept by <B> ...`, `chat: leave room=Party-<B:n vanha ryhmä> uid=<B> reason=left` ja
   `chat: join room=Party-<P> uid=<B> name=<B:n käyttäjänimi> occupants=1`.
5. **Ryhmächat molempiin suuntiin.** Jokainen rivi antaa `chat: message room=Party-<P> ... to=2`, ja
   toisen pelaajan ensimmäinen rivi rivin `Account info for 1 account(s) by userId ...: 1 found`.
   **Kumpikin pelaaja näkee toisen käyttäjänimen**, ei `UID-...` eikä `[unknown]`.
6. **Ramsgatessa yhdessä, ja metsästys.** Johtaja vie ryhmän Ramsgateen; molemmat liittyvät silloin
   samaan `City-<tunnus>`-huoneeseen, ja Normal-chat toimii molempiin suuntiin. (Kaksi pelaajaa, jotka
   eivät ole ryhmässä, ovat eri `City-`-huoneissa: toistaiseksi odotettua.) Sitten ryhmä käy
   metsästyksellä ja palaa: kartan lataukset eivät saa viedä chattia, joten A:lle tai B:lle ei tule
   riviä `chat: closed ... reason=ping-timeout`, ja ryhmächat toimii heti jokaisen latauksen jälkeen.
7. **Kuiskaukset.** A kuiskaa B:lle nimellä, ja B vastaa. `chat: whisper from=<A> to=<B> len=<n> delivered=1`
   ja toisin päin; B näkee A:n käyttäjänimen.
8. **Estot.** B estää A:n: A:n seuraava Normal-rivi kirjaa `blocked=1`, eikä B näe mitään; A:n kuiskaus
   kirjaa `reason=blocked`. B poistaa eston, ja rivit tulevat taas perille.
9. **Ryhmien turvallisuus.** A ja B pysyvät ryhmässä minuutin chatin ollessa päällä. Lokissa **ei** saa
   olla riviä `DELETE /party/member/...` eikä `DELETE /party/leader/...`, ja ryhmäkysely näyttää yhä
   kaksi jäsentä.
10. **Katkennut yhteys (jos sellainen sattuu, tai kokeiluksi: B katkaisee verkon minuutiksi ja kytkee
    sen takaisin).** Kun peli yhdisti uudelleen vanhan yhteyden vielä roikkuessa, lokissa on
    `chat: bound ... uid=<B> ... sessions=2`, sitten jokaiselle huoneelle
    `chat: leave room=<huone> uid=<B> reason=replaced` ja `chat: join room=<huone> uid=<B> ...`, ja noin
    10 sekuntia myöhemmin `chat: closed ... uid=<B> reason=ping-timeout`. A näkee B:n rivit yhä B:n
    käyttäjänimellä, ei muodossa `[unknown]`.
11. **Poistuminen ja lopetus.** B lähtee ryhmästä (`chat: leave room=Party-<P> uid=<B> reason=left`, ja
    A näkee B:n lähtevän) ja lopettaa sitten pelin (`chat: closed ... uid=<B> reason=close` tai `socket`).
12. **Lokin siisteys.** Etsi metagamen lokista sanaa, jonka kirjoitit vaiheissa 3-7, ja merkkijonoa
    `eyJ`: kumpaakaan ei saa löytyä. Poista sitten `CHAT_TRACE=1` (käynnistä uudelleen, kun kukaan ei
    pelaa).

Testi on läpäisty, kun vaiheet 1-11 menevät kuvatusti ja vaihe 12 ei löydä mitään.

**Paluutiet**, kevyimmästä alkaen:

- Oikeiden pelaajien liittymiset hylätään syyllä `reason=nick-resource`, `nick-format` tai
  `nick-name`: aseta `CHAT_NICK_CHECK=log` tiedostoon `metagame.env`, käynnistä uudelleen, kun kukaan
  ei pelaa, ja raportoi rivi.
- Mikä tahansa vakava: `Deploy-Remote.ps1 -Server <osoite> -Chat Off` (tai palvelimella
  `Set-Chat.ps1 -Off`) palauttaa tilanteen sellaiseksi kuin ennen chattia.
- Vika on itse chat-koodissa: `Update-DauntlessServer.ps1 -Rollback` (päivitystä edeltänyt versio) tai
  `Update-DauntlessServer.ps1 -Ref 9f3f78b`. Vanhempi koodi ei lue asetusta `CHAT`, joten muuta ei
  tarvitse muuttaa.

## Vielä vahvistamatta {#unconfirmed}

| Avoin kohta | Merkki | Miten testi tarkistaa sen |
|:------------|:-------|:--------------------------|
| Tilihaku asettaa nimeksi `displayName`-kentän | S | Rivi `chat: join ... name=` näyttää käyttäjänimen. |
| Omat rivisi näyttävät Sosiaalinen-paneelin nimen sinulle | S | Oma rivisi Normal-chatissa. |
| Nimimerkin resurssi on sidottu resurssi | S | Ei hylkäystä `reason=nick-resource`. |
| Kuinka usein peliohjelma yrittää hylättyä liittymistä uudelleen | tuntematon | Laske asetuksella `CHAT_TRACE=1` jäljityksestä toistuvat liittymisviestit (hylkäys kirjataan vain kerran yhteyttä, huonetyyppiä ja syytä kohden). |
| Avaavatko pelipalvelimet chat-yhteyden | G | Rivit `chat: connect ... via=direct` metsästyksen alettua. |
| Mitä kuiskaus poissa olevalle pelaajalle näyttää | tuntematon | Kuiskaa pelaajalle, joka lopetti. |
| Peliohjelman kirjoitusraja verrattuna meidän 2048 merkkiimme | G | Liitä pitkä rivi; katso `len=`. |
| "Liittyi huoneeseen" -ilmoitukset käyttävät nimimerkin ensimmäistä osaa | G | Ilmoitus näyttää käyttäjänimen (oikein joka tapauksessa). |
| Automaattinen ryhmäpotku pysyy lepotilassa huoneiden läsnäolotietojen kanssa | B sen ehdoille | Kahden hengen ryhmä chat päällä 60 sekuntia: ei `DELETE /party/member/...`. |
| Chat 24 tunnin tunnisteen vanhenemisen jälkeen | B (uusintayritys), C (vanheneminen) | Rivi `reason=expired` enintään 10 minuutin välein. |
| Kartan lataus viivästyttää peliohjelman vastausta palvelimen pingiin | S | Metsästysmatkan ympärillä ei rivejä `reason=ping-timeout` (vaihe 6). |
| Uudelleenyhdistäminen säilyttää pelaajan nimen muille | B peliohjelman jäsenluettelolle, C meidän | Vaihe 10, kun se sattuu. |

Mitä tehdä, kun chat ei toimi, kerrotaan sivulla [Vianetsintä]({{ trouble_page.url | relative_url }}#chat-not-connected);
chatin kytkeminen päälle ja pois palvelimella kerrotaan sivulla
[Windows-palvelin]({{ winserver_page.url | relative_url }}#chat).
