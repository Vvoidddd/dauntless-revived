---
title: Asennus
parent: Dauntless Revived suomeksi
nav_order: 2
has_children: true
has_toc: false
description: "Näin Dauntless Revived otetaan käyttöön: oma palvelin Windows-koneelle, kavereiden liittyminen, palvelin ryhmälle ja yleisimpien ongelmien korjaus."
lang: fi
ref: setup/index
locale: fi_FI
---

{% assign host_page = site.pages | where: "path", "fi/setup/host.md" | first %}
{% assign friends_page = site.pages | where: "path", "fi/setup/friends.md" | first %}
{% assign admin_page = site.pages | where: "path", "fi/setup/admin.md" | first %}
{% assign trouble_page = site.pages | where: "path", "fi/setup/troubleshooting.md" | first %}
{% assign verification_page = site.pages | where: "path", "fi/findings/verification.md" | first %}
{% assign legal_page = site.pages | where: "path", "fi/legal.md" | first %}

# Asennus

Nämä sivut ovat ohjeita niille, jotka haluavat pystyttää palvelimen tai liittyä kaverin
palvelimelle. Ne kertovat, miten me pyöritämme Dauntless Revivedia: aito **Dauntless 1.4.4**
-peliohjelma (lokakuu 2020, UE4 eli Unreal Engine 4 -pelimoottori, pak v9) keskustelee meidän
muokatun [Undaunted](https://github.com/SyST3MDeV/Undaunted)-versiomme kanssa, ja kaikki pyörii
yhdellä Windows-tietokoneella. Kaikki tämän osion tieto koskee versiota **1.4.4**. Pelin viimeinen
versio, 2.1.1, ei toimi tällä kokoonpanolla, koska Undauntedin palvelin-DLL (peliin ladattava
ohjelmakirjasto) muokkaa kiinteitä muistiosoitteita 1.4.4:n ohjelmatiedoston sisällä.

Tarvitset **oman kopion** 1.4.4-peliohjelmasta. Tällä sivustolla ja lähdekoodissa ei ole
pelitiedostoja eikä linkkejä niiden latauksiin.

**Tilanne.** Isännän kokoonpano on se, mitä ajamme tänään: vain koneen sisällä (loopback) ja
pelkästään omistajalle. Avaaminen kavereille Tailscalen kautta (ohjelma, joka tekee salatun,
yksityisen yhteyden koneiden välille) on kokoonpano, johon olemme siirtymässä. Se on kirjoitettu auki,
mutta sitä ei ole vielä ajettu alusta loppuun, ja sivuilla kerrotaan se aina siellä, missä sillä on
merkitystä.

## Sivut {#pages}

| Sivu | Kenelle | Mitä se kattaa |
|---|---|---|
| [Pystytä palvelin]({{ host_page.url | relative_url }}) | Palvelinta pyörittävälle | Version tarkistus, asennus lyhyeen polkuun, kahden DLL-tiedoston asennus kiinnitettyjä tiivisteitä vasten, asetustiedostot, metagamen ja deploy-palvelimen käynnistys, ensimmäisen käynnistyksen tarkistukset, peliohjelman käynnistys ja kaiken pysäyttäminen. Lopussa on yhden sivun käynnistyslista. |
| [Liity kaverina]({{ friends_page.url | relative_url }}) | Kutsutulle pelaajalle | Tailscale, pelitiedostojen tarkistus, kahden DLL-tiedoston kopiointi, rekisteröityminen henkilökohtaista tiliavainta varten, käynnistys ja se, mikä toimii juuri nyt. |
| [Palvelin ryhmälle]({{ admin_page.url | relative_url }}) | Isännälle, kun kokonaisuus toimii jo paikallisesti | Tailscale-jako, Tailscale-liitäntään rajatut palomuurisäännöt, osoitteiden vaihtaminen, kutsukoodit ja tilit, ylläpitorajapinta, kapasiteetti ja tietokannan varmuuskopiot. Tavoitekokoonpano, jota ei ole vielä testattu alusta loppuun. |
| [Vianetsintä]({{ trouble_page.url | relative_url }}) | Kaikille | Ongelmat, joihin oikeasti törmäsimme, syineen ja korjauksineen. Muutama kohta on peräisin koodin lukemisesta, ja ne on merkitty sellaisiksi. |

## Suositeltu järjestys {#suggested-order}

1. Isäntä: käy läpi sivu [Pystytä palvelin]({{ host_page.url | relative_url }}), kunnes seisot
   Ramsgatessa omalla koneellasi.
2. Isäntä: seuraa sivua [Palvelin ryhmälle]({{ admin_page.url | relative_url }}) päästääksesi
   kaverit sisään.
3. Jokainen kaveri: seuraa sivua [Liity kaverina]({{ friends_page.url | relative_url }}).

Sivulla [Pelitiedostojen tarkistaminen]({{ verification_page.url | relative_url }}) kerrotaan
yksityiskohtaisesti, miten tarkistimme, että oma pelikopiomme on aito, täydellinen ja puhdas. Jos
pyörität muokattua versiota muille ihmisille, lue ensin [Kiitokset ja lisenssi]({{ legal_page.url | relative_url }}):
AGPL-lisenssi vaatii, että tarjoat heille lähdekoodin.
