---
title: Päivitysohjeet
parent: Asennus
grand_parent: Dauntless Revived suomeksi
nav_order: 6
description: "Mitä pelaajille muuttuu, kun päivität jo käytössä olevan Dauntless Revived -palvelimen: oikea eteneminen on nyt oletuksena päällä. Näin pidät vanhat maksimitasot, aloitat alusta tai jatkat tyngällä."
lang: fi
ref: setup/upgrading
locale: fi_FI
---

{% assign host_page = site.pages | where: "path", "fi/setup/host.md" | first %}
{% assign admin_page = site.pages | where: "path", "fi/setup/admin.md" | first %}
{% assign winserver_page = site.pages | where: "path", "fi/setup/windows-server.md" | first %}
{% assign roadmap_en = site.pages | where: "path", "roadmap.md" | first %}

# Päivitysohjeet
{: .no_toc }

Lue tämä ennen kuin päivität palvelimen, jolla on jo pelaajia. Jokainen kohta kertoo, mikä muuttuu,
mitä pelaajasi näkevät ja mitä voit asialle tehdä. Uusin muutos on ensimmäisenä.

<details open markdown="block">
  <summary>Sisältö</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Oikea eteneminen on oletuksena päällä {#real-progression-default}

**Syyskuu 2026.** Koskee jokaista palvelinta, joka päivitetään commitin "Metagame: real progression by
default" jälkeiseen versioon ja jonka metagamen asetuksissa ei ole `PROGRESSION_MODE`-riviä.

### Mikä muuttui {#what-changed}

Ennen metagame (taustapalvelin, jonka kanssa peli keskustelee) vastasi kaikkiin etenemisen
(progression) pyyntöihin alkuperäisen Undauntedin tyngällä (stub), ellei asetuksena ollut
`PROGRESSION_MODE=real`:

- jokaisella tilillä näkyi Slayer-taso 50 ja täydet mestaruudet (mastery), eikä mitään pelaajan
  ansaitsemaa tallennettu;
- Hunt Pass näytti arvoa 99 999 999 ja kaikki palkinnot jo lunastettuina, ja Elite-rata näkyi
  lukittuna, koska tynkä ei kerro tilillä olevan yhtään oikeutta (entitlement);
- opetustehtävä "Claim your Hunt Pass rewards" ei voinut koskaan valmistua.

Nyt **tyhjä tai puuttuva `PROGRESSION_MODE` tarkoittaa oikeaa etenemistä kaikille tileille**:

- Slayer-taso, aseiden ja hirviöiden mestaruus sekä niiden tavoitteet (objectives) alkavat nollasta
  ja tallentuvat metsästyksistä ja tehtävistä.
- Hunt Pass (kausi 9b) alkaa nollasta. Lunastukset sekä ilmaisella että Elite-radalla tallentuvat.
  Jokaisella tilillä on oletuksena Elite-passi (`ENTITLEMENTS_DEFAULT`-luettelo).
- Tasopalkinnot antaa pelipalvelin kerran, tavaroiden kautta. Metagame vain kirjaa lunastuksen.
- Oikeudet, varustesarjojen paikat (loadout slots), odotusajat (cooldowns) ja palkkiotehtävät
  (bounties) tallentuvat tilikohtaisesti samassa tilassa.

`PROGRESSION_MODE=stub` antaa yhä alkuperäisen toiminnan, ja `PROGRESSION_REAL_ACCOUNTS` luettelee yhä
tilit, jotka saavat oikean etenemisen tynkätilassa (muissa tiloissa sitä ei huomioida). Muu arvo
kirjataan lokiin varoituksena ja tulkitaan oikeaksi etenemiseksi.

**Mitä on testattu.** Testaaja pelasi oikealla etenemisellä kertakäyttöisellä testitilillä,
käynnisti sitten kaiken uudelleen ja kirjautui takaisin (englanninkielisen
[tarkistuslistan]({{ roadmap_en.url | relative_url }}) kohdat 2.8–2.15): tasot alkoivat 1:stä,
mestaruus- ja Slayer-tasojen nousut vahvistettiin ja jokainen palkinto annettiin kerran, loputonta
mestaruusilmoitusta ei tullut, Hunt Passin lunastukset toimivat sekä ilmaisella että Elite-radalla,
pelipalvelimen myöntämä oikeus tallentui, ja kaikki oli tallessa uudelleenkäynnistyksen jälkeen.
**Vielä kokeilematta:** lisävarustesarjojen paikat pelin valikoissa, palkkiotehtävien valinta ja
lunastus pelin valikoissa, odotusajat vuorokauden vaihteen yli, useampi pelaaja yhtä aikaa, ja
tynkäaikana pelanneen tilin siirtäminen valetasolta 50 tasolle 1. Escalation on yhä alkuperäinen
tynkä kummassakin tilassa.

### Mitä pelaajasi näkevät {#what-your-players-will-see}

**Mitään ei siirretä automaattisesti.** Pelaajalla, joka pelasi palvelimellasi ennen päivitystä, ei
ole tallennettua etenemistä, joten hän aloittaa **Slayer-tasolta 1 tyhjällä Hunt Passilla** kuten uusi
pelaaja.

- Tavarat säilyvät, myös kaikki, mitä valetaso 50 jakoi (vaihtoehtoiset aseet, aseiden avausmerkit).
- Taso 1 lukitsee uudelleen sen, minkä valetaso 50 avasi: kulutustavaroiden paikat (tasot 2, 4 ja 7),
  lisävarustesarjojen paikat (tasot 34, 38 ja 45), osan valmistuksesta ja Slayer-tasoon sidotut
  metsästykset.

Käynnistyessään metagame kirjaa lokiin tilansa ja, niin kauan kuin tällaisia pelaajia on, varoituksen
heidän määrästään:

```
Progression mode: real for every account (the default)
3 player account(s) have no stored progression yet: they start at Slayer level 1 with an empty Hunt Pass, not upstream's fake max ranks. Nothing was migrated. ...
```

Luku kertoo tilit, joilla on hahmo mutta ei tallennettua etenemistä. Ylläpitäjän tiliä, jolla ei ole
koskaan pelattu, ei lasketa, ja pelaaja putoaa luvusta pois heti, kun hän ansaitsee jotain tai kun
annat hänelle lähtötason (seed).

### Valitse, mitä tapahtuu, ennen kuin pelaajat kirjautuvat {#choose-what-happens}

| Haluat | Tee näin |
|:-------|:---------|
| Kaikki aloittavat alusta (tämän valitsimme omalle palvelimellemme) | Ei mitään. Kerro pelaajille, että tasot ja Hunt Pass alkavat alusta ja säilyvät tästä eteenpäin. |
| Yksi pelaaja pitää maksimitasot | Anna hänelle lähtötaso `grandfather`, kun hän ei ole pelissä (ohje alla). Jokainen rata asetetaan korkeimmalle tasolleen ja vahvistetaan siihen, joten mitään ei jaeta eikä ilmoituksia tule. Hunt Pass näkyy kokonaan lunastettuna. |
| Jatkat vanhalla tyngällä toistaiseksi | Lisää metagamen asetuksiin `PROGRESSION_MODE=stub` ja käynnistä metagame uudelleen. `PROGRESSION_REAL_ACCOUNTS=<tunnus>,<tunnus>` antaa valituille tileille oikean etenemisen sillä välin. |

Lähtötaso `fresh` asettaa jokaisen radan nollaan ja tyhjentää tallennetut tavoitteet. Pelaaja, jolla ei
ole tallennettua etenemistä, on jo nollassa, joten `fresh` tarvitaan vain, kun haluat nollata tilin,
jolla on jo oikeaa etenemistä, esimerkiksi testitilin. Lähtötaso muuttaa vain kyseisen tilin
etenemisrivejä ja kirjaa muutoksen `progression_events`-tauluun. Lähtötasolla `grandfather` on
yksikkötestit, mutta sitä ei ole vielä kokeiltu pelissä.

**Ota ensin varmuuskopio.** Metagame ajaa tietokantamuutokset (migraatiot) käynnistyessään.
Palvelinpaketti ottaa varmuuskopion jokaisen päivityksen yhteydessä; itse kootulla koneella katso
[Varmuuskopioi tietokanta]({{ admin_page.url | relative_url }}#back-up-the-database).

### Missä asetus on {#where-the-setting-lives}

- **Itse koottu kone** ([Pystytä palvelin]({{ host_page.url | relative_url }})): `.env`
  `UndauntedMetagame`-kansiossa. Käynnistä metagame uudelleen muutoksen jälkeen.
- **Windows-palvelinpaketti** ([Windows-palvelin]({{ winserver_page.url | relative_url }})):
  `C:\DauntlessRevived\data\config\metagame.env`. Asennus ja `Update-DauntlessServer.ps1` säilyttävät
  jokaisen tiedostossa jo olevan rivin, joten palvelin, jolla oli jo `PROGRESSION_MODE=real` tai `stub`,
  pitää sen. Jos haluat jatkaa tyngällä, lisää rivi **ennen** päivitystä, tai lisää se jälkeenpäin ja
  aja `C:\DauntlessRevived\bin\Stack.ps1 restart -Only metagame`.

### Lähtötason antaminen pelaajalle {#seeding-a-player}

Ylläpitoreitit vastaavat vain metagamen omalla koneella (yhdyskäytävä torjuu ne), ja ne vaativat
ylläpitäjän tiliavaimen. Tallenna tämä nimellä `seed-progression.js` mihin tahansa sillä koneella. Se
tarvitsee Noden version 18 tai uudemman eikä mitään muuta:

```js
// node seed-progression.js <admin key file> list
// node seed-progression.js <admin key file> <UserId> grandfather|fresh
// Optional: set METAGAME to the metagame's address if it does not listen on 127.0.0.1:61000.
const fs = require("fs");
const [keyFile, userId, mode] = process.argv.slice(2);
const base = (process.env.METAGAME || "http://127.0.0.1:61000") + "/undaunted/api";
const key = fs.readFileSync(keyFile, "utf8").trim();

async function call(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { "x-undaunted-user-api-key": key, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`${method} ${path} returned HTTP ${r.status}`);
  return r.json();
}

(async () => {
  if (userId === "list") {
    const { Users } = await call("GET", "/GetAllUsers");
    for (const u of Users) {
      const p = await call("GET", "/Progression?UserId=" + encodeURIComponent(u.UserId));
      const slayer = p.Tracks.find((t) => t.progression_id === "MasteryTrack_PlayerLevel");
      const pass = p.Tracks.find((t) => t.progression_id === "season09b");
      console.log(`${u.UserId}  ${u.Username}  real=${p.RealMode}  slayer=${slayer.earned_free_rank}  huntpass=${pass.progress}`);
    }
    return;
  }
  if (!userId || (mode !== "grandfather" && mode !== "fresh")) throw new Error("usage: see the first lines of this file");
  const r = await call("POST", "/SeedProgression", { UserId: userId, Mode: mode });
  console.log(`${r.UserId}: seeded ${r.Mode}, ${r.Tracks.length} tracks, real mode ${r.RealMode}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
```

Ylläpitäjän avaintiedosto on `C:\dr\data\owner.key`, jos seurasit sivua
[Pystytä palvelin]({{ host_page.url | relative_url }}), tai `C:\DauntlessRevived\data\keys\owner.key`
palvelinpaketin koneella:

```powershell
node seed-progression.js C:\DauntlessRevived\data\keys\owner.key list
node seed-progression.js C:\DauntlessRevived\data\keys\owner.key UID-... grandfather
```

`list` tulostaa jokaisen tilin, sen Slayer-tason sellaisena kuin peli sen näyttää ja Hunt Passin
kokemuspisteet (XP). Se näyttää `real=false` tileille, jotka ovat yhä tyngän varassa
(`PROGRESSION_MODE=stub`); lähtötaso tallentuu joka tapauksessa ja otetaan käyttöön, kun tili on
oikean etenemisen tilassa. Skripti ei koskaan tulosta avainta.
