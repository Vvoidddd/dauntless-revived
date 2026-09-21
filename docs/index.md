---
title: Dauntless Revived
nav_order: 1
permalink: /
description: "Dauntless Revived is a private server revival of Dauntless: the genuine 1.4.4 client on a self-hosted fork of Undaunted. What works and how to set it up."
lang: en
ref: index
# The WebSite structured data comes from _includes/head_custom.html; this stops jekyll-seo-tag adding a second one.
seo:
  type: WebPage
---

{% assign roadmap_page = site.pages | where: "path", "roadmap.md" | first %}
{% assign legal_page = site.pages | where: "path", "legal.md" | first %}

# Dauntless Revived

**Dauntless**, the Phoenix Labs co-op monster-hunting game, lost its official servers on
**30 May 2025**, but it can still be played against a private server. Dauntless Revived is one: a
private, non-commercial preservation revival that runs the genuine **Dauntless 1.4.4** client
(October 2020) against a fork of the open-source [Undaunted](https://github.com/SyST3MDeV/Undaunted)
server by gwog and contributors (AGPL-3.0). It is not a public server: the owner runs it for a few
friends, and anyone with their own copy of the 1.4.4 client can host the same thing from
[the repository]({{ site.github.repository_url }}).

We started out studying the final client, **2.1.1** ("Awakening"). What we learned from both builds
is written up here.

> **Disclaimer.** Dauntless Revived is an unofficial fan project. It is **not affiliated with,
> endorsed by, or supported by Phoenix Labs or Epic Games**. "Dauntless" and related names are
> trademarks of their owners. This site and the repository **contain no game files**: no executables,
> no paks, no assets and no configuration from the game, and no links to downloads. To use anything
> here you need **your own copy** of the Dauntless 1.4.4 client. There is no public server to join.

[Set it up]({{ '/setup/' | relative_url }}){: .btn .btn-primary .mr-2 }
[Read the findings]({{ '/findings/' | relative_url }}){: .btn .mr-2 }
[Roadmap]({{ roadmap_page.url | relative_url }}){: .btn }

---

## Current status

As of September 2026. Everything in this section is about the **1.4.4** client. So far it has been
tested on one PC, by the owner, playing alone.

### What works

| Feature | State | Notes |
|---|---|---|
| Log in with your own account | Works | Each player has an account on our server and logs in with a personal account key. **No Epic account is needed.** The 1.4.4 client has no Epic Online Services login; it predates that integration. It is launched in its exchange-code login mode. The injected DLL points the client's Epic-style account-service call at our metagame, which accepts the player's account key as the exchange code. |
| Tutorial | Works | A new character is matchmade into the tutorial island. That island runs on a game server the deploy server starts on demand. |
| Ramsgate | Works | A permanent Ramsgate server runs next to the backend. After the tutorial, and on every later login, the player goes straight there. |
| Hunt servers | Works (solo) | The deploy server starts one game server per hunt. On our setup, one player has played the tutorial hunt, a normal hunt (a Lesser Boreus) and a pursuit. Undaunted's history reports 4-player hunts on the same client, but we have **not yet tested** hunts with more than one player. |
| Saved inventory and loadouts | Works (solo) | Materials, Rams (most likely the `CURRENCY_NOTES` stack), crafted and granted gear, the first loadout slot, and character data (quest progress, tutorial state, flags, appearance) are stored in a SQLite database. Hunt loot is saved. The data survives a client restart and a full server restart. So far only one player has tested this. |
| Slayer level, mastery and the Hunt Pass | Works (solo), on by default | Real progression: Slayer level, weapon and behemoth mastery and the Hunt Pass start at 0 and are saved. Every account owns the Elite Hunt Pass, and rank rewards are granted once. Tested in game on a throwaway account, including a full restart. `PROGRESSION_MODE=stub` brings back upstream's fixed level 50. |

The measured cost on the host PC was about 1.1 GB of RAM and roughly 0.2 of a CPU core for the
Ramsgate server, about 0.9 GB per hunt server, and 1.5 to 2.3 GB for the player's own client (the
higher figure at Cinematic settings).

### What does not work yet

- **Playing with friends over the internet.** For now the metagame and deploy server listen on the
  host PC only, and game servers are advertised at `127.0.0.1`, so only the host can play. The plan
  is to connect friends over Tailscale and turn on invite codes.
- **Parties and the friends list.** Parties are faked as "you, alone", and the friends list shows
  0 online.
- **Bounties, cooldowns and escalation.** With real progression, bounties and cooldowns are stored
  per account, but drafting and claiming a bounty in the game and cooldowns across a daily reset have
  not been tried yet. Escalation is still stubbed, so its progress does not carry over between
  sessions.
- **Multiple loadouts, choosing your own username, the welcome message and mailbox, seasonal events,
  and the store.**

The [roadmap]({{ roadmap_page.url | relative_url }}) has the order we plan to work in, plus the bugs
we have seen in real sessions. Some things cannot come back. Voice chat ran on Vivox, a paid
third-party service, so use Discord instead. Content released after November 2020 is not in the
1.4.4 build.

---

## Who this is for

- **The owner and a handful of invited friends.** This is a small private group, not a public
  service.
- **People who own the 1.4.4 client and want to run the same thing for their own group.** The
  [Setup]({{ '/setup/' | relative_url }}) section covers the host, the friends' side, and how to
  check that your copy of the game is genuine and unmodified.
- **Anyone curious how Dauntless's online side worked.** The
  [Findings]({{ '/findings/' | relative_url }}) section records the backend contract, how
  Undaunted's server-mode DLL works, and what we learned from the 2.1.1 client. We say which build
  each fact comes from, and we mark anything unverified.

---

## How it fits together (1.4.4)

| Part | What it is | Where it runs |
|---|---|---|
| Client | The unmodified Dauntless 1.4.4 executable plus two DLLs from Undaunted placed next to it: a `dxgi.dll` proxy that loads `UndauntedInternalServer.dll`, which redirects the client's backend calls to the metagame over plain HTTP | Each player's PC |
| Metagame | Undaunted's TypeScript backend: accounts, characters, inventory, loadouts, matchmaking | Host PC, TCP 61000 |
| Deploy server | Starts and supervises the game-server processes | Host PC, TCP 61001, loopback only (it has no authentication) |
| Game servers | More copies of the same client executable, switched into server mode by the DLL: one permanent Ramsgate server, plus one per hunt | Host PC, UDP 8770 to 8777 |

Our changes to Undaunted so far are small and practical. Both services now bind to loopback by
default. A port clash is now a hard error, where it used to be a silent exit. Every request is
logged. The Training Dojo starts only when it is needed. Progression is real by default, where
upstream answered with a fixed template and saved nothing. The [roadmap]({{ roadmap_page.url | relative_url }})
lists all of them.

---

## How we got here

We started with the final **2.1.1** client and wrote our own backend from scratch. That work
established that the game talks to Phoenix Labs' own REST API on `steelyard.ca` hosts (not PlayFab,
as earlier community notes assumed). It solved the whole 2.1.1 login chain. By injecting user
config, it even got Ramsgate to render. It never got a controllable player in the city.

**A correction.** We first concluded that multiplayer was impossible, because both retail builds
(2.1.1 and 1.4.4) are client-only: `UWorld::Listen` is stubbed out and the net mode is forced to
"client". That conclusion
was **wrong**. Only the entry point is stripped. The network layer underneath (`UIpNetDriver::InitListen`
and the server-side join and login handlers) is intact. An injected DLL can drive it, and that is
exactly how Undaunted runs multiplayer Ramsgate and hunts on the 1.4.4 client. Once we understood
that, we switched to 1.4.4 and forked Undaunted.

---

## Credits

This project stands on **Undaunted** by gwog (Gregory Morford) and its contributors. The server-mode
DLL, the deploy server, the metagame and the launcher are theirs. The fork remains AGPL-3.0-only, and
its full source is in [this site's repository]({{ site.github.repository_url }}). See
[Credits and license]({{ legal_page.url | relative_url }}) for the full credits, what the AGPL asks
of anyone who hosts a modified version, and the notes on trademarks and game files.
