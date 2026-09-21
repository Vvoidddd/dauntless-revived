// Everyone the launcher's Credits page thanks, in English and Finnish. This is the only place the
// list lives: adding a contributor is one line in PROJECT_PEOPLE (or UPSTREAM_PEOPLE).
//
// Plain data, no links: the page opens the contributor pages by link name ("project_contributors",
// "upstream_contributors"), and the main process maps those names to fixed URLs (src/main/links.ts).
// The project's maintainer appears here only by the GitHub handle.

import type { Language } from "./types";

export type Localized = Readonly<Record<Language, string>>;

export type CreditRole = "maintainer" | "creator" | "contributor";

export interface CreditPerson {
  name: string; // as shown
  github: string; // GitHub handle
  role: CreditRole;
  note: Localized;
}

export interface CreditSoftware {
  name: string;
  author: string | Localized;
  license: string | null; // SPDX identifier; null when the project publishes no license file
  note: Localized;
}

// Dauntless Revived (everyone: the "project_contributors" link).
export const PROJECT_PEOPLE: readonly CreditPerson[] = [
  { name: "mixutin", github: "mixutin", role: "maintainer", note: { en: "Maintains the project: the server kit, this launcher, backend fixes, real progression and the docs.", fi: "Ylläpitää projektia: palvelinpaketti, tämä käynnistin, taustapalvelun korjaukset, oikea eteneminen ja ohjeet." } },
  { name: "Vvoidddd", github: "Vvoidddd", role: "contributor", note: { en: "Found the cause of the dark pre-hunt airship (the game's automatic exposure; the change was reverted in launcher 0.1.1 because it made Ramsgate too dark), hid the console windows of temporary hunt servers and added the repository's .gitignore.", fi: "Löysi syyn siihen, miksi ilmalaiva on pimeä ennen metsästystä (pelin automaattinen valotus; muutos peruttiin käynnistimen versiossa 0.1.1, koska se pimensi Ramsgaten), piilotti tilapäisten metsästyspalvelimien konsoli-ikkunat ja lisäsi projektiin .gitignore-tiedoston." } },
];

// Undaunted, the project this launcher and the whole fork are a modified version of (everyone: the
// "upstream_contributors" link).
export const UPSTREAM_PEOPLE: readonly CreditPerson[] = [
  { name: "gwog (Gregory Morford)", github: "SyST3MDeV", role: "creator", note: { en: "Created Undaunted: the server-mode DLL that turns the ordinary game client into a game server, the deploy server, the metagame and the original launcher.", fi: "Loi Undauntedin: palvelintilan DLL:n, joka tekee tavallisesta peliohjelmasta pelipalvelimen, sekä deploy-palvelimen, metagamen ja alkuperäisen käynnistimen." } },
  { name: "EisigesEis", github: "EisigesEis", role: "contributor", note: { en: "Metagame work: inventory and loadouts, progression and mastery, invite codes, the admin API and status fixes.", fi: "Metagamen parannuksia: inventaario ja varustelut, eteneminen ja mestaruus, kutsukoodit, ylläpidon rajapinta ja tilavastausten korjauksia." } },
];

// Open-source software in the launcher and in the server DLL it ships. The full license texts are in
// THIRD-PARTY-NOTICES.txt, which ships with the launcher.
export const SOFTWARE: readonly CreditSoftware[] = [
  { name: "MinHook", author: "Tsuda Kageyu", license: "BSD-2-Clause", note: { en: "The function-hooking library in the server DLL.", fi: "Palvelin-DLL:n funktioiden koukutuskirjasto." } },
  { name: "Hacker Disassembler Engine 64", author: "Vyacheslav Patkov", license: "BSD-2-Clause", note: { en: "Part of MinHook.", fi: "Osa MinHookia." } },
  { name: "Dumper-7", author: { en: "Encryqed and contributors", fi: "Encryqed ja muut tekijät" }, license: null, note: { en: "The Unreal Engine SDK generator the server DLL is built against.", fi: "Unreal Engine -SDK:n generaattori. Palvelin-DLL on käännetty sen tuottamaa SDK:ta vasten." } },
  { name: "Electron", author: { en: "Electron contributors", fi: "Electronin tekijät" }, license: "MIT", note: { en: "The app framework. The Chromium and Node.js notices ship next to the launcher as LICENSES.chromium.html.", fi: "Sovelluskehys. Chromiumin ja Node.js:n lisenssit tulevat käynnistimen mukana tiedostossa LICENSES.chromium.html." } },
  { name: "update-electron-app", author: "GitHub Inc.", license: "MIT", note: { en: "Self-updates from the project's GitHub releases.", fi: "Itsepäivitys projektin GitHub-julkaisuista." } },
  { name: "electron-squirrel-startup", author: "Lucas Hrabovsky", license: "Apache-2.0", note: { en: "Shortcuts when the installer runs.", fi: "Pikakuvakkeet asennuksen aikana." } },
  { name: "github-url-to-object", author: "zeke", license: "MIT", note: { en: "Used by update-electron-app.", fi: "update-electron-app käyttää tätä." } },
  { name: "is-url", author: "Segment", license: "MIT", note: { en: "Used by github-url-to-object.", fi: "github-url-to-object käyttää tätä." } },
  { name: "ms", author: { en: "Vercel (formerly ZEIT)", fi: "Vercel (ennen ZEIT)" }, license: "MIT", note: { en: "Used by update-electron-app and debug.", fi: "update-electron-app ja debug käyttävät tätä." } },
  { name: "debug", author: "TJ Holowaychuk", license: "MIT", note: { en: "Used by electron-squirrel-startup.", fi: "electron-squirrel-startup käyttää tätä." } },
  { name: "GitHub Octicons", author: "GitHub Inc.", license: "MIT", note: { en: "The GitHub mark on the GitHub button.", fi: "GitHub-painikkeen GitHub-logo." } },
];

export function localized(v: string | Localized, lang: Language): string {
  return typeof v === "string" ? v : v[lang] ?? v.en;
}
