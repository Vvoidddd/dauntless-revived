---
title: Vianetsintä
parent: Asennus
grand_parent: Dauntless Revived suomeksi
nav_order: 4
description: "Dauntless 1.4.4 ja Dauntless Revived -palvelin: ongelmat, joihin törmäsimme, syineen ja korjauksineen. Varatut portit, kirjautuminen, sumea grafiikka, Defender ja git."
lang: fi
ref: setup/troubleshooting
locale: fi_FI
---

{% assign host_page = site.pages | where: "path", "fi/setup/host.md" | first %}
{% assign roadmap_page = site.pages | where: "path", "fi/roadmap.md" | first %}
{% assign crashes_page = site.pages | where: "path", "fi/findings/crashes.md" | first %}
{% assign awakening_page = site.pages | where: "path", "fi/findings/awakening-2-1-1.md" | first %}

# Vianetsintä
{: .no_toc }

Nämä ovat ongelmat, joihin oikeasti törmäsimme Dauntless Revivedia pystyttäessä, syineen ja
korjauksineen. Muutama lopun kohta on peräisin koodin lukemisesta, eivätkä ne ole vielä osuneet
meihin; ne on merkitty. Itse asennus on sivulla [Pystytä palvelin]({{ host_page.url | relative_url }}).
Ellei kohdassa sanota toisin, se koskee peliversiota **1.4.4**. Versiota **2.1.1** koskevat kohdat on
säilytetty, koska samalla koneella on usein molemmat versiot.

Muutama selitys ensin: metagame on taustapalvelu, joka hoitaa tilit ja hahmot. Deploy-palvelin on
ohjelma, joka käynnistää pelipalvelimet. Peliohjelma (client) on pelaajan oma Dauntless-ohjelma.
Portti on numeroitu ”ovi”, jonka kautta ohjelmat ottavat yhteyttä toisiinsa.

<details open markdown="block">
  <summary>Sisältö</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Mistä katsoa ensin {#where-to-look-first}

| Lähde | Mitä se kertoo |
|---|---|
| `C:\dr\data\metagame.log` | Yksi JSON-rivi tapahtumaa kohden. Fork kirjaa jokaisen pyynnön muodossa `METHOD /path gs=0` (peliohjelma) tai `gs=1` (pelipalvelin). Tämä on tärkein mittarimme: kuinka pitkälle peliohjelma pääsi, ja mitä se pyysi viimeksi? |
| `C:\dr\data\deploy.log` | Matchmaking-pyynnöt, `Running Gameserver Watchdog!` 60 sekunnin välein ja `Cleaning up Gameserver on port N`, kun palvelin sulkeutuu. |
| Pelipalvelinten konsoli-ikkunat | Yksi kutakin palvelinta kohden, palvelin-DLL:n avaamana. Ne näyttävät palvelimen oman tulosteen. |
| Peliohjelman konsoli-ikkuna | DLL avaa sen client-tilassa. **Jos konsoli-ikkunaa ei ilmesty peliohjelman käynnistyessä, DLL-tiedostot eivät ole latautuneet.** |
| `%LOCALAPPDATA%\Archon\Saved\Crashes\` | Kaatumisraportit. Niiden lukemisesta kerrotaan sivulla [Kaatumisten tutkiminen]({{ crashes_page.url | relative_url }}). |

1.4.4:n shipping-peliohjelma ei kirjoita omaa pelilokitiedostoa. `Saved\Logs` sisältää vain pelin
sisäisen selaimen lokit. Näin luet metagamen lokia tavallisena tekstinä:

```powershell
Get-Content C:\dr\data\metagame.log -Tail 40 | ForEach-Object { try { ($_ | ConvertFrom-Json).msg } catch { $_ } }
```

---

## Portti 60000 on varattu, ja metagame sanoo silti ”Clear Skies” {#port-60000-is-taken-and-the-metagame-says-clear-skies-anyway}

**Oire.** Metagame tulosti kuuntelevansa porttia 60000 ja `Clear Skies, Slayer.`, mutta mikään ei
toiminut. Peliohjelma ja omat HTTP-kutsumme osoitteeseen `127.0.0.1:60000` saivat yhteyden ja
jäivät sitten odottamaan loputtomiin. Pyyntöloki pysyi tyhjänä.

**Syy.** Kaksi ongelmaa yhdessä:

1. `127.0.0.1:60000` kuului **`ShadowUSB`**-palvelulle, joka asentui Shadow-sovelluksen mukana
   (pilvipelaamisen sovellus, asennettuna omalle koneellemme). Se hyväksyy TCP-yhteydet siinä
   portissa eikä koskaan vastaa HTTP:llä.
2. Alkuperäisen koodin `app.listen(PORT, () => { ... })` jättää huomiotta virheen, jonka Express 5
   antaa kuuntelun takaisinkutsulle. Epäonnistunut porttivaraus tulosti silti onnistumisrivit, ja
   sitten prosessi sulkeutui.

**Korjaus.**

- Selvitä, kenen portti on, ennen kuin käytät sitä:

  ```powershell
  Get-NetTCPConnection -LocalPort 60000,61000,61001 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { "{0}:{1} {2}" -f $_.LocalAddress, $_.LocalPort, (Get-Process -Id $_.OwningProcess).ProcessName }
  ```

- Siirryimme portteihin **61000** (metagame) ja **61001** (deploy-palvelin). Muuta metagamen
  `.env`-tiedostossa `PORT`, `QOS_TARGET_URL` ja `DEPLOYSERVER_URL` sekä deploy-palvelimen
  `.env`-tiedostossa `PORT`. Sitten **luo `Game.ini` uudelleen** komennolla
  `make-gameini.ps1 -Metagame 127.0.0.1:61000`
  ([Pystytä palvelin, vaihe 8]({{ host_page.url | relative_url }}#game-ini)).
- Forkimme metagame ja deploy-palvelin pitävät nyt epäonnistunutta porttivarausta vakavana virheenä ja
  sulkeutuvat koodilla 1:

  ```
  Could not listen on 127.0.0.1:60000: listen EADDRINUSE: address already in use 127.0.0.1:60000
  ```

**Jatko-ongelma, johon myös törmäsimme.** Siirron jälkeen kaksi `Game.ini`-tiedoston merkintää oli yhä
portissa 60000. Etsi ja korvaa -toimintomme osui merkkijonoon `:60000/`, mutta `MatchmakingEndpoint`
ja `TrackingEndpoint` ovat pelkkiä `http://host:port`-arvoja ilman polkua, joten matchmaking ja
telemetria (pelin lähettämät käyttötiedot) olisivat jääneet vanhaan porttiin. Haku jäljelle jääneistä
`60000`-merkkijonoista paljasti ne. Kun tiedosto luodaan uudelleen muokkaamisen sijaan, tätä ei tapahdu.

---

## Invoke-RestMethod jumittaa {#invoke-restmethod-hangs}

**Oire.** Windows PowerShell 5.1:ssä komento
`Invoke-RestMethod -Method Post -Uri http://127.0.0.1:60000/undaunted/api/Register ...` ei koskaan
palannut, eikä metagame kirjannut mitään.

**Mitä se oikeasti oli.** Aluksi pidimme sitä PowerShell 5.1:n omituisuutena ja siirryimme käyttämään
Nodea. Todellinen syy oli edellinen kohta: portti kuului `ShadowUSB`-palvelulle, joka hyväksyi
yhteyden eikä koskaan vastannut. `curl.exe -m 5` teki sen selväksi: se sai yhteyden heti, ei saanut
HTTP-vastausta 5 sekunnissa (`http=000`), ja kuuntelevan prosessin tarkistus näytti `ShadowUSB`:n.

**Korjaus ja hyvä tapa.**

- Tarkista, kenen portti on (edellinen kohta), ennen kuin syytät peliohjelmaa.
- Laita aikaraja jokaiseen skriptillä tehtyyn HTTP-kutsuun, jotta väärä kuuntelija epäonnistuu
  nopeasti:

  ```powershell
  curl.exe -s -m 5 http://127.0.0.1:61000/dauntless-status
  Invoke-RestMethod -Uri http://127.0.0.1:61000/dauntless-status -TimeoutSec 10
  node -e "fetch('http://127.0.0.1:61000/dauntless-status', { signal: AbortSignal.timeout(5000) }).then(r => r.text()).then(console.log)"
  ```

Teemme ylläpitokutsut yhä Noden `fetch`-funktiolla ja `AbortSignal.timeout`-aikarajalla, koska sama
yhden rivin komento voi myös päivittää tietokantaa `better-sqlite3`-kirjaston kautta (katso
[Pystytä palvelin, vaihe 10]({{ host_page.url | relative_url }}#admin-account)).

---

## git: ”Filename too long” ja ”'$GIT_DIR' too big” {#git-filename-too-long}

**Oire.** Kun kloonasimme (kopioimme) Undauntedin syvällä sisäkkäisissä kansioissa olevaan
työkansioon, git tulosti `error: unable to create file ...: Filename too long`, jopa tiedostoille kuten
`.git/hooks/fsmonitor-watchman.sample`. Sitten se päättyi näin:

```
fatal: '$GIT_DIR' too big
fatal: remote helper 'https' aborted session
```

**Syy.** Windowsin 260 merkin polkuraja. Työkansion polku oli jo pitkä, ja repositorio lisää jopa 94
merkkiä. Syvimmät nimet ovat kansiossa `UndauntedInternalServer/SDK/`, joka on yli 4 000 tiedoston
generoitu SDK. Gitin omat tiedostot `.git`-kansiossa lisäävät pituutta vielä. Valitsimen
`-c core.longpaths=true` lisääminen **ei** korjannut ongelmaa: `$GIT_DIR`-virhe johtuu siitä, että
itse repositorion sijainnin polku on liian pitkä.

**Korjaus.** Kloonaa lyhyeen polkuun ja pidä `core.longpaths` asetettuna sen sisällä olevia tiedostoja
varten:

```powershell
git -c core.longpaths=true clone <URL of this repository> C:\dr\undaunted
git -C C:\dr\undaunted config core.longpaths true
```

Emme ottaneet käyttöön Windowsin koko järjestelmän pitkien polkujen asetusta. Lyhyt polku teki siitä
tarpeettoman. Sama perustelu koskee peliasennusta (`C:\D144`) ja palvelin-DLL:n myöhempää kääntämistä
MSVC:llä.

---

## Sumea grafiikka {#blurry-graphics}

**Oire.** 1.4.4 näytti pehmeältä ja vähäyksityiskohtaiselta, valitsimmepa asetusvalikosta mitä
tahansa, ja pyöri pienessä ikkunassa.

**Syy.** Omat muistirajoituksemme. 2.1.1:n muistisäikähdyksen jälkeen (seuraava kohta) olimme
kirjoittaneet nämä jaettuun käyttäjän `Engine.ini`-tiedostoon, ja käynnistimme pelin valitsimilla
`-windowed -ResX=1280 -ResY=720`:

```ini
[SystemSettings]
r.Streaming.PoolSize=400
r.Streaming.LimitPoolSizeToVRAM=1
r.Streaming.FullyLoadUsedTextures=0
r.MipMapLODBias=2
r.ScreenPercentage=70
sg.ViewDistanceQuality=0
sg.ShadowQuality=0
sg.PostProcessQuality=0
sg.TextureQuality=0
sg.EffectsQuality=0
sg.FoliageQuality=0
t.MaxFPS=60
gc.TimeBetweenPurgingPendingKillObjects=10
s.ForceGCAfterLevelStreamedOut=1
```

Käyttäjän `Engine.ini`-tiedoston `[SystemSettings]` ohittaa valikon. Niinpä asetusnäkymä näytti yhtä,
kun taas pelimoottori piirsi kuvan 70 prosentin resoluutiolla ja sumennetuilla tekstuuritasoilla.
Lisäksi UE4:n ajallinen reunanpehmennys (temporal anti-aliasing) pehmentää kuvaa hieman millä tahansa
asetuksella.

**Korjaus.** `play.ps1` kirjoittaa nyt `[SystemSettings]`-osion uudelleen jokaisella käynnistyksellä
([Pystytä palvelin, vaiheet 13–14]({{ host_page.url | relative_url }}#graphics)):

- Oletuksena `-Graphics 4` (Cinematic).
- `r.ScreenPercentage=100`, `r.MipMapLODBias=0`, `r.MaxAnisotropy=16`, `r.Tonemapper.Sharpen=0.6`.
- 3000 megatavun tekstuuripooli, rajattuna näytönohjaimen muistiin.
- Sama taso kopioituna `GameUserSettings.ini`-tiedostoon.
- Ei FPS-rajaa eikä pakotettua ikkunaa.

`-Graphics -1` pitää vain muistirivit ja antaa valikon päättää. Cinematic-tasolla ja resoluutiolla
1920x1080 peliohjelma käyttää 1,9–2,3 Gt keskusmuistia (RAM), joten matalia rajoja ei koskaan
tarvittu 1.4.4:ssä.

### Ilmalaiva on tosi pimeä ja ikkunat palavat puhki valkoisiksi {#airship-dark-windows-blown-out}

**Oire.** Metsästysretken valikot näyttävät normaaleilta, mutta ilmalaivan hytti ennen retkeä on lähes
musta ja sen ikkunat täysin valkoiset. Ilmiö voi vaihdella retkestä toiseen, koska aula näyttää retken
kohteen tunnelman.

**Syy.** Dauntless 1.4.4:n automaattinen valotus (histogrammiin perustuva ”silmän sopeutuminen”)
reagoi huonosti ilmalaivan tavallista suurempaan kirkkauserojen määrään nykyisillä näytönohjainten
ajureilla. Kyse on jälkikäsittelystä, ei puuttuvista tekstuureista eikä väärästä retken määrityksestä.

**Tilanne: ei korjattu oletuksena.** Vvoidddd huomasi, että `Engine.ini`-tiedoston rivi
`r.EyeAdaptationQuality=0` (automaattinen valotus pois) korjaa ilmalaivan, ja käynnistimen versio 0.1.0
sekä kaveripaketti asettivat sen. Ensimmäisessä oikeassa testissä (22. syyskuuta 2026) se teki
Ramsgatesta ja kaikista yökohtauksista aivan liian pimeitä, koska ne tarvitsevat automaattista valotusta
kirkastuakseen. Siksi käynnistimen versiosta 0.1.1 alkaen mikään ei laita automaattista valotusta pois,
ja käynnistin poistaa version 0.1.0 kirjoittaman rivin seuraavalla käynnistyskerralla. Ilmalaivan hytti on
lyhyt kohtaus; korjaus, joka ei pimennä muuta peliä, on tiekartalla.

Näin näet, mitä oikeasti pakotetaan:

```powershell
Get-Content "$env:LOCALAPPDATA\Archon\Saved\Config\WindowsClient\Engine.ini" -TotalCount 20
```

---

## Muistipiikit ja rajat {#memory-spikes-and-caps}

**Mitä tapahtui (2.1.1).** Erillinen 2.1.1-peliohjelma, joka käynnistyi suoraan Ramsgateen ilman
rajoituksia, nousi **9 gigatavuun**. Yhdessä kaiken muun käynnissä olleen kanssa se vei 32 gigatavun
koneemme muistin 98 prosenttiin (31,3 / 31,9 Gt). 400 megatavun tekstuuripoolilla, matalilla
laatutasoilla ja kahdella roskienkeruurivillä sama käynnistys nousi enimmillään noin **2,8
gigatavuun**. Lisäsimme myös vahtikoiran, joka lopetti prosessin 6,5 gigatavun yläpuolella.
Yksityiskohdat: [Itsenäinen käynnistys 2.1.1:llä]({{ awakening_page.url | relative_url }}).

**1.4.4 on paljon kevyempi** (mittauksemme, yksi pelaaja):

- Ramsgate-palvelin: noin 1,1 Gt.
- Metsästyspalvelin: noin 0,9 Gt.
- Peliohjelma Cinematic-tasolla: 1,9–2,3 Gt.

Siksi kokoonpano pitää vain ne rajat, jotka eivät heikennä kuvanlaatua: 3000 megatavun pooli rajattuna
näytönohjaimen muistiin (VRAM) sekä `gc.TimeBetweenPurgingPendingKillObjects=10` ja
`s.ForceGCAfterLevelStreamedOut=1`.

**Mitä käytämme nyt.**

- `play.ps1 -Seconds 180 -CapMB 12000` valvoo peliohjelmaa 3 minuuttia. Se tulostaa muistinkäytön
  30 sekunnin välein ja lopettaa ohjelman, jos se ylittää rajan.
- Käsin ajettava palvelintestiskriptimme tekee saman pelipalvelimelle (oletusraja 5000 Mt).
- Sulje raskaat ohjelmat ennen pelikertaa. Jos käytät WSL:ää, `wsl --shutdown` vapauttaa sen
  virtuaalikoneen varaaman muistin (noin 3 Gt meidän koneellamme). Voit myös rajata sen pysyvästi
  tiedostossa `%UserProfile%\.wslconfig`:

  ```ini
  [wsl2]
  memory=4GB
  ```

**Tunnettu puute.** Alkuperäisen projektin deploy-palvelin käynnistää peliprosessit ilman muistirajaa,
ja kuusi samanaikaista metsästystä on mahdollista oletusporttialueella. Palvelinkohtainen muistisuoja
on [tiekartalla]({{ roadmap_page.url | relative_url }}). Siihen asti valvo palvelimia tällä komennolla:

```powershell
Get-CimInstance Win32_Process -Filter "Name='Dauntless-Win64-Shipping.exe'" | ForEach-Object { "{0,6}  server={1}  {2} MB" -f $_.ProcessId, ($_.CommandLine -match ' -server'), [int]($_.WorkingSetSize/1MB) }
```

---

## Jumiin jääneet EOS-overlay-prosessit (vain 2.1.1) {#stale-eos-overlay-processes}

**Oire (2.1.1).** Kaatuneen ajon jälkeen Epicin kirjautumisikkuna (overlay) ei tullut esiin
seuraavalla käynnistyksellä.

**Syy.** Kaatuneesta ajosta jääneet `EOSOverlayRenderer-Win64-Shipping`-prosessit.

**Korjaus.** Lopeta vain nuo prosessit ennen kuin käynnistät pelin uudelleen. Jätä Epic Games
Launcher rauhaan.

```powershell
Get-Process EOSOverlayRenderer-Win64-Shipping -ErrorAction SilentlyContinue | Stop-Process
```

Tämä ei koske tämän sivuston 1.4.4-kokoonpanoa. 1.4.4 on Epic Online Servicesiä vanhempi, siinä ei ole
EOS-overlayta, ja se kirjautuu avaimella, jonka oma metagamemme on myöntänyt.

---

## Windows Defender ja allekirjoittamattomat DLL-tiedostot {#windows-defender-and-the-unsigned-dlls}

**Tausta.** `dxgi.dll` ja `UndauntedInternalServer.dll` ovat allekirjoittamattomia. Peliin koukkuja
asentava (hook) välittäjä-DLL on juuri sellainen asia, jonka virustorjunnan heuristiikka merkitsee
epäilyttäväksi. Meidän koneellamme Defender **ei ilmoittanut mistään** sen jälkeen, kun kopioimme
tiedostot paikalleen. Tarkistimme sen näin:

```powershell
Get-MpThreatDetection -ErrorAction SilentlyContinue | Where-Object { $_.InitialDetectionTime -gt (Get-Date).AddHours(-1) } |
  Select-Object InitialDetectionTime, @{n='Resources';e={$_.Resources -join ';'}}
```

**Jos Defender merkitsee tai poistaa jommankumman:**

- Älä kytke Defenderiä pois päältä, äläkä jätä kokonaisia kansioita tarkistuksen ulkopuolelle.
- Vertaa tiedostoasi kiinnitettyihin tiivisteisiin (tiedoston sormenjälkiin) sivulla
  [Pystytä palvelin, vaihe 5]({{ host_page.url | relative_url }}#dlls). Jos se ei täsmää, poista se ja
  kopioi uudelleen tuoreesta kloonista.
- Jos tiiviste täsmää, havainto on heuristinen ja koskee tavuja, jotka olemme analysoineet. Molempien
  tiedostojen staattisen analyysimme yhteenveto on vaiheessa 5. Palautatko sen yhden tiedoston
  kohdasta **Windowsin suojaus → Suojaushistoria**, on sinun päätöksesi.
- Kloonasimme gitillä, joten emme törmänneet tähän, mutta jos repositorio ladataan zip-tiedostona,
  tiedostot merkitään internetistä tulleiksi. Kun olet tarkistanut tiivisteet, `Unblock-File` kahdelle
  DLL-tiedostolle poistaa tuon merkinnän.

Pysyvä korjaus on kääntää `UndauntedInternalServer.dll` lähdekoodista ja korvata `dxgi.dll` omalla
pienellä välittäjällämme. `dxgi.dll`-tiedoston lähdekoodi ei ole Undauntedin repositoriossa, eikä sitä
tietääksemme ole julkaistu. Molemmat ovat [tiekartalla]({{ roadmap_page.url | relative_url }}).

---

## npm:n allow-scripts-varoitukset {#npm-allow-scripts-warnings}

**Oire.** `npm ci` (npm 11.17, Node 24.19) päättyi molemmissa palvelinkansioissa näin:

```
npm warn allow-scripts   esbuild@0.18.20 (postinstall: node install.js)
npm warn allow-scripts   better-sqlite3@12.11.1 (install: prebuild-install || node-gyp rebuild --release)
npm warn allow-scripts   esbuild@0.25.12 (postinstall: node install.js)
npm warn allow-scripts   esbuild@0.28.1 (postinstall: node install.js)
npm warn allow-scripts
npm warn allow-scripts Run `npm approve-scripts --allow-scripts-pending` to review, or `npm approve-scripts <pkg>` to allow.
```

**Mitä se tarkoitti meille.** Mikään ei hajonnut:

- `npm run build` (pelkkä `tsc`) onnistui.
- Ainoa palvelinten tarvitsema natiivimoduuli oli paikallaan.
- `esbuild`-työkalua käyttävät vain kehitystyökalut (`tsx`, `drizzle-kit`), eikä `npm start` aja
  niitä.

Tarkista natiivimoduuli:

```powershell
Test-Path C:\dr\undaunted\UndauntedMetagame\node_modules\better-sqlite3\build\Release\better_sqlite3.node
```

**Jos tämä tulostaa `False`,** metagame ei voi avata tietokantaansa. Tarkista ja hyväksy vain se
paketti, kuten npm ehdottaa, ja asenna sitten uudelleen:

```powershell
npm approve-scripts better-sqlite3
npm ci --no-audit --no-fund
```

Paketin asennusskripti lataa valmiiksi käännetyn tiedoston (`prebuild-install`) tai, jos se ei
onnistu, kääntää sellaisen itse (`node-gyp`, joka tarvitsee Visual Studion C++-käännöstyökalut). Emme
ole itse tarvinneet tätä vaihetta. Natiivimoduuli on sidottu Node-versioon, joten aja `npm ci`
uudelleen jokaisen Node-päivityksen jälkeen.

---

## Osoitearvot katkenneet muotoon ”https:” (ini-tiedoston `//`-katkaisu) {#ini-truncation}

**Oire (nähty 2.1.1:ssä).** Käyttäjän `Engine.ini`-tiedoston `[OnlineSubsystemPhoenix]`-lohkon kaikki
163 arvoa olivat pelkästään `https:`, esimerkiksi `AccountInfoEndpoint=https:`. Kaikki `//`-merkeistä
eteenpäin oli poissa.

**Syy.** Pelimoottorin ini-jäsennin tulkitsee `//`-merkit **lainausmerkittömässä** arvossa kommentin
aluksi ja katkaisee arvon siihen. Peli kirjoittaa asetuksensa takaisin levylle, joten katkenneet arvot
korvasivat alkuperäiset. Tuo lohko sattui olemaan vaaraton: `[OnlineSubsystemPhoenix]` kuuluu
`Game.ini`-hierarkiaan, joten `Engine.ini`-tiedostossa sitä ei koskaan luettu, ja 2.1.1:n oikea
liikenne tavoitti yhä täydet osoitteet. Ohituksena `Game.ini`-tiedostossa se olisi rikkonut jokaisen
osoitteen.

**Korjaus.**

- **Laita jokainen osoite lainausmerkkeihin** käyttäjän ini-tiedostossa, kuten Phoenixin mukana
  tulleissa asetuksissa: `AuthEndpoint="http://127.0.0.1:61000/game/login"`.
- Laita osoiteohitukset `Game.ini`-tiedostoon, ei koskaan `Engine.ini`-tiedostoon. Poista kaikki
  `[OnlineSubsystemPhoenix]`-lohkot, joita löydät `Engine.ini`-tiedostosta.
- Luo `Game.ini` skriptillä `make-gameini.ps1`
  ([Pystytä palvelin, vaihe 8]({{ host_page.url | relative_url }}#game-ini)) ja aja sen
  kuntotarkistus. Sen pitäisi ilmoittaa `entries: 167  not fully quoted: 0`.

Versiossa 1.4.4 peli on kirjoittanut lainausmerkein varustetun `Game.ini`-tiedostomme uudelleen monen
pelikerran jälkeen, ja jokainen arvo on ehjä. Emme ole testanneet lainausmerkittömiä arvoja 1.4.4:ssä.

---

## Pelipalvelin katosi, kun ikkuna suljettiin {#server-console-windows}

Jokainen pelipalvelin avaa konsoli-ikkunan (mustan tekstiruudun), koska palvelin-DLL:n konsolilokitus
on oletuksena päällä. **Konsoli-ikkunan sulkeminen lopettaa sen palvelimen** kaikilta, jotka ovat
siinä. Deploy-palvelimen vahtikoira (watchdog) käynnistää Ramsgaten (ja Dojon) uudelleen noin
minuutissa. Metsästyspalvelinta ei käynnistetä uudelleen. Jätä ikkunat auki (pienennä ne).
Palvelimen tulosteen kirjoittaminen lokitiedostoihin on [tiekartalla]({{ roadmap_page.url | relative_url }}).

Ilmoitusikkuna, jossa lukee **”INVALID GAMESERVER ARGS”**, tarkoittaa, että pelipalvelin
käynnistettiin alle kahdeksalla parametrilla exe-tiedoston nimen jälkeen. Vertaa komentoasi käsin
ajettavaan palvelinkomentoon sivulla
[Pystytä palvelin, vaihe 11]({{ host_page.url | relative_url }}#deploy-server).

---

## Lokirivit, jotka näyttävät hälyttäviltä mutta ovat tuttuja {#log-lines-that-look-alarming-but-are-known}

Omasta metagamen lokistamme (1.4.4, yksi pelaaja, yksi ilta opetusjaksoa, Ramsgatea ja Dojoa):

| Rivi | Nähty | Mitä se on |
|---|---|---|
| `Unstubbed route POST /loadout/<account>/<character>/unlock/3` | yli 40 kertaa | Alkuperäisessä projektissa ei ole käsittelijää varustepaikan avaamiselle. Pelipalvelin (`gs=1`) lähettää sen uusintayritysten ryöppyinä, useita muutaman sekunnin sisällä ja sitten taas minuuttien päästä. Vaaraton. Käsitellään siitä lähtien, kun oikeasta etenemisestä tuli oletus (tiekartan kohta 2.4); matalan tason tili ei lähetä sitä lainkaan, joten näet rivin vain asetuksella `PROGRESSION_MODE=stub`. |
| `Failed to update characterId ... due to conflict` | 14 kertaa | Peliohjelma ja pelipalvelin tallentavat kumpikin hahmon versionumeroiden kanssa ja hylkäävät toistensa kirjoitukset. Joka kerta se osapuoli, jonka kirjoitus hylättiin (joskus peliohjelma, joskus pelipalvelin), luki hahmon uudelleen ja kirjoitti uudestaan noin sekunnin sisällä, joten viimeinen kirjoitus päätyi tietokantaan. Ei vielä todistettu häviöttömäksi tilanteessa, jossa molemmat muuttavat samaa arvoa samanaikaisesti; tiekartalla. |
| `Unstubbed route GET /friends/api/public/friends/<account>` ja `.../blocklist/<account>` | 2 kertaa kumpikin | Kaverilistaa ei vielä ole; peli näyttää ”0 ONLINE FRIENDS”. |
| `Unstubbed route GET /account127.0.0.1:61000` | 2 kertaa | Yhdestä osoitteesta, jonka peliohjelma kokoaa DLL:n osoiteohituksesta, puuttuu `/`. Metagame vastaa 404; mitään näkyvää ei hajoa. |
| `Unstubbed route POST /candidate/player/alive`, `DELETE /candidate` | muutaman kerran | Matchmaking-jonon ylläpitokutsuja, joille ei ole käsittelijää. |
| `Unauthenticated POST to /heartbeat which needs metagame auth!` | kerran | Varhainen telemetrian elonmerkki (heartbeat), joka lähetetään kirjautumisen aikana ennen kuin istunto on valmis. Myöhemmät elonmerkit on tunnistettu. |
| `Running Gameserver Watchdog!` (deploy-loki) | 60 sekunnin välein | Normaalia. |
| `Cleaning up Gameserver on port 8775` (deploy-loki) | kun metsästys päättyy | Metsästyspalvelin sulkeutui, ja sen portti palasi vapaiden porttien joukkoon. |

---

## Kirjautuminen ei etene aloitusruudulta {#login-doesnt-get-past-the-title-screen}

Lue metagamen lokia siitä hetkestä alkaen, kun käynnistit pelin:

- **Riviä `POST /account/api/oauth/token` ei ole lainkaan.** Peliohjelma ei tavoita metagamea.
  Tarkista, että:
  - peliohjelman konsoli-ikkuna ilmestyi (jos ei, DLL-tiedostot puuttuvat `Win64`-kansiosta tai eivät
    lataudu);
  - ensimmäinen käynnistysparametri on `127.0.0.1:61000`;
  - metagame kuuntelee (`curl.exe -s -m 5 http://127.0.0.1:61000/dauntless-status`).
- **`Invalid API key auth!`** Parametrina `-AUTH_PASSWORD` annettu avain ei vastaa yhtään tiliä.
  Tarkista `C:\dr\data\owner.key` ja varmista, että käytät oikeaa tietokantatiedostoa (`DB_FILENAME`).
  Palvelin tallentaa jokaisesta avaimesta vain tiivisteen, joten kadonnutta avainta ei voi palauttaa;
  työkalu uuden avaimen antamiseen on tiekartalla.
- **Kirjautuminen toimii, mutta mikään ei lataudu matchmakingin jälkeen.** Etsi `gs=1`-rivejä. Jos
  niitä ei ole, pelipalvelin ei tavoita metagamea:
  - `Game.ini` puuttuu tai on väärä (aja vaiheen 8 kuntotarkistus), tai
  - pelipalvelinavainta ei rekisteröity (metagamen on täytynyt kirjata kerran
    `Registered 1 new Gameserver API Key(s) on boot!`), tai
  - deploy-palvelimen `.env`-tiedoston `METAGAME_API_KEY` eroaa `gameserver.key`-tiedostosta.

---

## Vaihtaminen 2.1.1:n ja 1.4.4:n välillä {#switching-between-211-and-144}

Molemmat versiot käyttävät kansiota `%LOCALAPPDATA%\Archon\Saved\Config\WindowsClient`. Toisesta
versiosta jääneet asetukset vaikuttavat myös toiseen. Esimerkkejä ovat 2.1.1-kokeiluista jäänyt
`GameDefaultMap`-ohitus tai 1.4.4:n osoiteohitukset `Game.ini`-tiedostossa. Pidämme sen version
kansion, jota emme juuri käytä, uudelleennimettynä (`WindowsClient.211`) ja vaihdamme kansiot ennen
siirtymistä; katso [Pystytä palvelin, vaihe 6]({{ host_page.url | relative_url }}#config-folder). Älä
koskaan kopioi 1.4.4:n DLL-tiedostoja 2.1.1-asennukseen: niiden muistiosoitteet ovat vain 1.4.4:n
exe-tiedostoa varten.

---

## Ei vielä kohdattu, mutta tiedossa koodista {#not-hit-yet-but-known-from-the-code}

Nämä ovat peräisin koodin lukemisesta (ja ensimmäisen kohdalla lisäksi pienestä testistä), eivät
jostakin, mikä olisi mennyt meillä pieleen.

- **Jäljelle jäänyt käsin käynnistetty pelipalvelin.** Deploy-palvelimen käynnistämät palvelimet
  päättyvät sen mukana: se käyttää Noden oletusarvoista (ei irrotettua eli not detached)
  `spawn`-kutsua, ja Windowsissa Node laittaa tällaiset lapsiprosessit työobjektiin (job object), joka
  sulkeutuu Noden sulkeutuessa. Varmistimme sen testiprosessilla, emme pelipalvelimella. Käsin
  käynnistetty palvelin (vaiheen 11 käsin ajettava komento tai testiskriptimme) on tuon työobjektin
  ulkopuolella ja jää käyntiin. Sen jälkeen käynnistetty deploy-palvelin käynnistää heti uuden
  Ramsgaten UDP-porttiin 8777, jota vanha palvelin yhä pitää. Pysäytä ennen deploy-palvelimen
  käynnistämistä kaikki prosessit, joiden komentorivillä on `-server` (tarkistuslistan kohta 2 sivulla
  [Pystytä palvelin]({{ host_page.url | relative_url }}#checklist)).
- **Metsästyspalvelin, joka sulkeutuu ennen kuin hidas pelaaja saapuu.** Porttien 8776 alapuolella
  palvelin-DLL sulkee palvelimen, kun siihen ei ole ollut kukaan yhteydessä yhteensä 50 sekuntiin.
  Pelaaja, jonka kentän lataus kestää kauemmin, voi saapua vasta, kun palvelin on jo poissa.
  Säädettävä tyhjäkäyntiaikaraja on [tiekartalla]({{ roadmap_page.url | relative_url }}).
- **Tallennukset epäonnistuvat hyvin pitkissä pelikerroissa.** Kirjautumistunnisteet vanhenevat 24
  tunnissa. Pelipalvelimen tallennukset kantavat pelaajan tunnistetta, eikä metagamen tarkistuksessa
  ole virheenkäsittelyä vanhentuneelle tunnisteelle, joten 24 tunnin jälkeen nuo tallennukset
  epäonnistuvat palvelinvirheeseen. Kunnes tämä korjataan, sulje peli vähintään kerran päivässä.
  Uusiiko peliohjelma koskaan tunnistettaan itse, on vielä testaamatta.
- **Metsästysportit loppuvat.** Oletusalueella kuusi metsästystä voi olla käynnissä kerralla.
  Seitsemäs pyyntö epäonnistuu deploy-palvelimen sisällä (`No free ports left!`, HTTP 500
  metagamelle), ja alkuperäinen metagame kirjaa `DeployServer returned status 500` ja antaa sitten
  ryhmälle virheen sijaan tyhjän osoitteen ja portin 0. Tämä on tiekartalla yhdessä muistisuojan
  kanssa.
