---
title: Friends, parties and guilds
parent: Findings
nav_order: 9
description: "How the Dauntless 1.4.4 client does friends, parties and guilds against its backend, read from the executable and the live server: the identity chain, the exact replies, why the first two-player test showed nothing, and what is still unconfirmed."
lang: en
ref: findings/social
---

{% assign api_page = site.pages | where: "path", "reference/api.md" | first %}
{% assign config_page = site.pages | where: "path", "reference/configuration.md" | first %}
{% assign files_page = site.pages | where: "path", "reference/files.md" | first %}
{% assign contract_page = site.pages | where: "path", "findings/backend-contract.md" | first %}
{% assign rev_page = site.pages | where: "path", "findings/json-reversing.md" | first %}
{% assign awakening_page = site.pages | where: "path", "findings/awakening-2-1-1.md" | first %}
{% assign friends_page = site.pages | where: "path", "setup/friends.md" | first %}

# Friends, parties and guilds in 1.4.4
{: .no_toc }

This page describes how the **1.4.4** client handles the Social panel: friends, blocked players,
parties and party invites, and guilds. It records what the client sends, what it needs back, and why
the first test with two players on 22 September 2026 showed nothing. It also lists the fixes we built
in the metagame.

**Status (22 September 2026): built and tested without the game, not yet tried by two players.** Every
fix below passes HTTP tests that replay the client's own requests and check each reply against a model
of the client's parsing. The next two-player test on the rented server will confirm or correct them.
Online status and chat are not built (they need an XMPP server, see [Deferred](#deferred)).

<details open markdown="block">
  <summary>Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Evidence and confidence

Each fact is marked with where it comes from and how sure we are.

| Label | Source |
|:------|:-------|
| **B** | The 1.4.4 executable (`Dauntless-Win64-Shipping.exe`, 103 MB): its strings (ASCII and UTF-16), and disassembly of the functions that build requests and parse replies. Addresses are virtual addresses with image base `0x140000000`. |
| **L** | The live server: a census of every route the real clients and game servers called on 22 September 2026, with counts and unanswered routes, and what the two players reported. |
| **R** | Requests the 2.1.1 client sent to our research server (the same Phoenix services, recorded with their bodies). |
| **K** | Reflected class and struct names (the SDK dump of the game's classes), and the endpoint table in `UndauntedInternalServer/dllmain.cpp`. |
| **C** | Our own code and tests. |
| **G** | A design decision of ours, where nothing in the client decides it. |

Confidence: **H** high (read in the code, or seen live), **M** medium (one link not traced), **L** low.

The method for reading JSON field names out of the executable is on
[Reading the JSON contract from the binary]({{ rev_page.url | relative_url }}).

## What the players saw, and why

| What the players saw | Cause | Fix | Conf |
|:---------------------|:------|:----|:-----|
| A party invite reached the other player's client (the invite poll answered it twice) but never appeared under PARTY INVITES. | Before the panel shows an invite, the client asks `POST /accountinfo/public` about the sender. Our reply, inherited from upstream, described the **caller** instead: the caller's id in `accountId` and in `linkedAccounts`. The client files user info under the reply's `accountId` and keeps the first reply per id, so the sender never got any user info, was invalidated, and the invite was dropped (B `0x140b74870`, `0x1409ede50`). | `/accountinfo/public` answers for the asked account. | H in the code, M that nothing else stands in the way |
| Add Friends "found nothing". | Add Friends is not a search. It is a name box and an Add button. The name was found (`GET /account/api/public/account/displayName/<name>`), but the next step, `POST /account/mapping`, first got 404 and then a reply shape the client does not read. With no mapping, the client drops the friend request without a message. No friend request ever reached the server (0 calls, L). | `/account/mapping` answers in the shape the client parses. | H |
| Everyone, the players themselves included, showed as Offline. | Online status comes only from XMPP presence, pushed over the chat connection, and nothing listens there. There is no HTTP presence route. | Not built yet: needs the XMPP server. | H |
| "Unable to create guild." | `POST /guild/validate` (from the client) and `POST /guild` (from the **game server**) both got 404. | The eleven v2 guild routes. | H |
| Nobody used the in-game party Invite (both invites of the night came from the host's fallback). | The players could not find each other: Hunt Members and friends need the same user-info step as an invite's sender. | Same fix as the first row. | M |

**After the fixes are deployed, both players must restart the game once.** The client keeps the
first user info and the first mapping per id for the whole session, so wrong entries from before stay
until it restarts.

**A correction.** Our earlier notes, and roadmap item 1.11, blamed `/account/mapping` for both the
friend search and the party invite. That is only half right. Add Friends did stop at
`/account/mapping` (and would next have stopped at `/accountinfo/public`). The received party invite
never uses the mapping: its sender id is already a Phoenix id, and it was dropped at
`/accountinfo/public`. The mapping calls seen around the invite that night fit other callers: the
two Add Friends attempts and the client's own mapping of the local player at login.

## One id, two steps: the identity chain

Every entry in every Social list (friends, friend requests, blocked players, party members, Hunt
Members, party invites, guild members, guild inviters) is a "social user" keyed by its **Phoenix**
account id (B `0x1415af620`). It only appears once two lookups have succeeded:

```
Epic id (friends list, block list, Add Friends, /invite <name>, the guild add-member box)
   |  POST /account/mapping {"srcAccountType": "epic", "ids": [<epic id>]}      -> Phoenix id
   v
Phoenix id (party invite sender, party members, Hunt Members, guild members and inviters)
   |  POST /accountinfo/public {"accountId": <phoenix id>}                      -> user info
   |     the reply's accountId must be the asked id (cache key, first reply wins)
   |     linkedAccounts [{accountType: "epic", accountId: X}] sets the user's Epic id to X
   v
the social toolkit checks that the user's Epic id is the Epic id the action started from
   v
the entry is shown, or the queued action runs (send the friend request, show the invite ...)
```

When the mapping yields nothing, the action is dropped quietly (B, log string "Mapping primary Id for
unknown, unmapped external Id [%s] for user action"). When the user info yields nothing, the user is
invalidated (B, "SocialToolkit - HandleUserInvalidated called for [%s]").

**On this server every account has exactly one id**, `UID-<uuid>`. It is at once the Epic account id
(the login answers it as `account_id`), the Phoenix account id (party and guild member ids) and the
future chat id. So every mapping is the identity. In the original service the Epic id was a separate
32-character id (R: the 2.1.1 client mapped such an id at login), and the client still walks both
steps, so both must answer correctly even though the ids are equal.

### `POST /account/mapping`

The client's `QueryAccountMappingsEndpoint` (K `dllmain.cpp`), in Phoenix's own user service.

- **Request** (B, R, L): `{"srcAccountType": "epic", "ids": ["<id>"]}`, JSON with the player's bearer
  token, at most 100 ids per request. The 2.1.1 client sent exactly this at login (R), and so did the
  live 1.4.4 clients (L).
- **Reply the parser reads** (B `0x140b09f60`..`0x140b0afd4`): a root key `accountMappings` holding an
  **object keyed by each asked id**. Each value is an object with non-empty strings `accountId` and
  `accountType`; `accountType` is compared without case with `epic` and `phoenix`. Nothing else in an
  entry is read. The HTTP status is not checked; an empty body fails ("Empty response payload") and so
  does invalid JSON ("Invalid response payload"). Extra root keys are ignored.
- **Our reply**: `{"accountMappings": {"<id>": {"accountId": "<id>", "accountType": "phoenix"}}, "code": "OK",
  "message": "", "payload": {"accountMappings": {...}}}`. The wrapped copy under `payload` costs nothing
  and covers a reader that expects the Phoenix envelope. For `srcAccountType` `phoenix` the entries say
  `epic`. Unknown ids are left out; without a valid token the map is empty.
- **Why the two earlier replies failed**: the first was an object keyed by id at the root, with no
  `accountMappings` key, so the parser found nothing. The second sent `accountMappings` as an **array**,
  which the parser reads as an empty object. Either way no mapping was cached. Our client model
  reproduces both failures (see [Testing without the game](#testing-without-the-game)).
- Confidence **H** for the shape (the parser was traced end to end); not yet seen working in game.

### `POST /accountinfo/public`

The client's `PublicAccountInfoEndpoint`, one call per player to show (73 calls live, all answered,
L). This is the step every other player in the Social panel depends on.

- **Request** (B, R): `{"accountId": "<id>"}`, or from a second request builder `{"displayname": "<name>"}`.
- **Reply** (B `0x140b69ac0`, a plain object, no envelope, like the other account services on
  [Backend contract]({{ contract_page.url | relative_url }})):

  ```json
  {
    "accountId": "UID-B",
    "username": "Bravo",
    "linkedAccounts": [ { "accountId": "UID-B", "accountType": "epic" } ],
    "isSubscribed": true,
    "language": null
  }
  ```

- `accountId` must be the **looked-up** account: it is the key the client files the user info under,
  and the first reply per key wins (B `0x140b74870`, the early return at `0x140b748f9`).
- The `epic` entry of `linkedAccounts` becomes the user's Epic id (B `0x140b7499f`), which the
  toolkit compares with the Epic id the action started from.
- An unknown id or name answers **404 `{}`**: the client counts a failed lookup and caches nothing (B,
  "Batch Succeeded, Total = %d, FailureCount = %d"). With the old reply it cached nothing useful either.
- `isSubscribed` and `language` are not read by the client; they stay because they were harmless live.
- **Why upstream's reply failed**: it put the caller's own id in `accountId` and `linkedAccounts`. At
  login the client looks up its own id first, so every later lookup of another player landed on the
  caller's existing entry and was ignored. The other player never got user info.
- Confidence **H** for the shape and the cache keying; **M** that this alone makes invite senders,
  Hunt Members and friends appear.

### Lookups by name (unchanged)

| Route | Used by | Conf |
|:------|:--------|:-----|
| `GET /account/api/public/account/displayName/:name` → `{id, displayName, externalAuths: {}}` or 404 | Add Friends, the chat's `/invite <name>`, the guild add-member box (B, L: 2 calls) | M |
| `GET /account/api/public/account?accountId=A&accountId=B` → an array of the same | The Epic-side name of a social user (B) | M |

A typed name that contains `@` goes to an email lookup, which stays unanswered: our usernames cannot
contain `@`, and the 404 gives the normal "not found" message.

## Friends

The Epic friends service (`[OnlineSubsystemMcp.OnlineFriendsMcp]`, B), with our player token as the
bearer. Friendships and blocks are stored in SQLite (built for roadmap 1.9). The routes are on
[HTTP API]({{ api_page.url | relative_url }}#friends).

| Call | When | Request and reply | Evidence | Conf |
|:-----|:-----|:------------------|:---------|:-----|
| `GET /friends/api/public/friends/:id?includePending=true` | once per login | A bare **array** of `{accountId, status: ACCEPTED or PENDING, direction: INBOUND or OUTBOUND, created}` (the client wraps it as `{"friends": ...}` itself) | B, L: 8 logins, 8 calls | H |
| `GET /friends/api/public/blocklist/:id` | once per login | `{"blockedUsers": [...]}` | B, L | H |
| `POST /friends/api/public/friends/:me/:them` | Add Friends, the Add Friend menu item, Accept | no body (Accept sends an empty JSON body); any 2xx | B | H |
| `DELETE /friends/api/public/friends/:me/:them` | Decline, Remove Friend | any 2xx | B | H |
| `POST` (and now also `PUT`) `/friends/api/public/blocklist/:me/:them` | Block, after its dialog | any 2xx | B, the verb inferred | M |
| `DELETE /friends/api/public/blocklist/:me/:them` | Unblock | any 2xx | B | H |

The client reads both lists **only at login** (L). A friend request or an accept therefore shows for
the other player at their next login, until the XMPP server can push the change.

**What the player should see** (M unless marked):

| Step | Calls | Result |
|:-----|:------|:-------|
| Log in | friends list, block list; per listed id: mapping, user info | Accepted friends under OFFLINE (never under EPIC FRIENDS without presence); a pending request someone sent, with Accept and Decline; blocked players under BLOCKED; requests you sent are not listed |
| Add Friends: type a name, press Add | name lookup (404: the "unknown player" message; your own name: the "you cannot invite yourself" message), mapping, user info, `POST .../friends/<me>/<them>` | a "friend invite sent" message; nothing new in the lists |
| The other player logs in again | the login calls | the request, with Accept and Decline (where exactly it is listed is still to be seen) |
| Accept | `POST .../friends/<me>/<them>` | the friend shows under OFFLINE after the next login |
| Decline, Remove Friend | `DELETE .../friends/<me>/<them>` | the entry goes (H) |
| Block, Unblock | `POST`/`DELETE .../blocklist/<me>/<them>` | the entry moves to or from BLOCKED |

**Limits we added** (G): at most 50 unanswered requests sent per account, and at most 20 new requests
per 10 minutes (409, which the client shows as a failure). Accepting a request is never limited. The
existing limits stay: 200 friendships and 200 blocks per account.

## Parties

The party service was already built (roadmap 1.9) and matched the client's requests and replies. The
live census shows it working: 399 party polls and 399 invite polls, and the invite delivered to the
other player's poll (L). **The only server change parties needed is the `/accountinfo/public` fix.**

| Call | When | Evidence | Conf |
|:-----|:-----|:---------|:-----|
| `POST /party` `{buildId, featureOverrides: []}` | the poll, about every 10 seconds, and at login | B `0x140b57600`, L: 399 calls | H |
| `GET /party/invites` → `{"invitations": [{recipientPlayerId, sendingPlayerId, partyId, sendingPlatform, sendingDisplayName}]}` | the invite poll | B `0x140b675d0`, L: 399 calls | H |
| `PUT /party/invite` `{recipientPlayerId, partyId, buildId, featureOverrides}` | Invite to Party; the chat's `/invite <name>` | B | H |
| `PUT /party/invite/accept/:partyId` | Accept | B | H |
| `DELETE /party/invite` | Decline | B | H |
| `DELETE /party/member`, `DELETE /party/member/:id`, `PUT /party/member/promote/:id` | leave (also at every login), kick, promote | B, L: 12 leaves in 8 logins | H |
| `POST /candidate/join` from the leader | the leader picks a hunt; the members follow through their party poll | C, tests | M |

**What the player should see** once the fix is deployed: an invite appears under PARTY INVITES
within about 10 seconds (the next invite poll), after the client has looked up the sender. Accepting
shows both names in both party panels. When the leader picks a hunt, the whole party lands on one
hunt server. Parties live in memory: a metagame restart leaves everyone in a party of one, which the
client treats as normal.

Two things we deliberately left alone: invites the caller **sent** are not listed in
`GET /party/invites` (the client might misread them as received), and a party of one keeps the old
placeholder values, which were harmless live. The client's automatic kick of "offline" party members
never runs without presence (B `0x1415f6f60`, a 10-second threshold). It must stay that way when the
XMPP server arrives: the server must never echo a player's own presence back.

## Guilds

### The contract

- **Endpoints** (K `dllmain.cpp`, the cooked `DefaultGame.ini`): eleven `*_v2` keys. The older `v1`
  keys are compiled in but never called, so we built only v2.
- **Every reply** is read through the Phoenix envelope `{"code": string, "message": string, "payload":
  object}` (B `0x140b12170`). Success is a 2xx status **and** a parseable JSON body (B `0x140aae300`),
  so a 204 is a failure. `GET /guild`'s 204 for "not in a guild" relies on exactly that: the client then
  clears its guild (B `0x1415c2c90`; L: 34 calls answered 204).
- **On an error status** the client still reads `code` and maps it to its guild error (B
  `0x140ade3f0`, K `EGuildRequestError`). An unknown or empty code shows as "Unable to create guild."
- **Payload fields** are strings, except `maximum_guild_members` (a whole number). Ranks are `Member`,
  `Officer` and `Leader`, compared without case; the client puts the rank in the URL in lower case.
- **Creation goes through the game server.** The Create button sends the RPC `ServerCreateGuild` to the
  Ramsgate game server (B, K), which sends `POST /guild` with its key (L: one such call, answered 404).
  The RPC's validation returns true without checking any item, so **creating a guild costs nothing** in
  1.4.4.
- There is no message of the day, banner, hall, perk or guild XP in v2. Guild chat is the XMPP room
  `Guild-<guildId>` (not built). The `[TAG]` over players' heads works by itself once `GET /guild`
  returns a nameplate.

We send every reply wrapped and also copy the payload's fields to the root (G). The envelope reader
ignores extra root keys, so the copies cost nothing and cover a flat reader in case our reading of the
code is wrong.

### Error codes

The server sends the `code`; the client shows its own text (from the create-guild widget).

| `code` | Client error | Status we send | Text the client shows |
|:-------|:-------------|:---------------|:----------------------|
| `SlyAdorableQuillshot` | InvalidPermission | 403 | |
| `ExcludedAdorableQuillshot` | NotInAGuild | 404 | |
| `ObedientAdorableQuillshot` | GuildNameInvalidLength | 400 | Name is invalid. Must contain 4-15 english letters and digits. |
| `SeizedAdorableQuillshot` | GuildNameTaken | 409 | Guild name already in use. |
| `NastyAdorableQuillshot` | GuildNameProfane | 400 | Guild name contains profanity. |
| `NumberedAdorableQuillshot` | GuildNameTooManyNumbers | 400 | Guild name must have 6 numbers or less. |
| `LetteredAdorableQuillshot` | GuildNameTooManyLetters | 400 | Guild name must not have more than 6 of the same letter in a row. |
| `DutifulAdorableQuillshot` | GuildNameplateInvalidLength | 400 | Nameplate is invalid. Must contain 2-6 english letters and digits. |
| `CapturedAdorableQuillshot` | GuildNameplateTaken | 409 | Guild nameplate already in use. |
| `DirtyAdorableQuillshot` | GuildNameplateProfane | 400 | Guild nameplate contains profanity. |
| `OccupiedAdorableQuillshot` | YouAlreadyInAGuild | 409 | Unable to create guild. You are already in a guild. |
| `ClonedAdorableQuillshot` | TargetAlreadyInYourGuild | 409 | |
| `RedundantAdorableQuillshot` | TargetAlreadyHasGuildInvite | 409 | |
| `StuffedAdorableQuillshot` | GuildIsFull | 409 | |
| `UninvitedAdorableQuillshot` | GuildInviteNotFound | 404 | |
| `ChiefAdorableQuillshot` | GuildLeaderCannotLeaveGuild | 409 | |
| `DocileAdorableQuillshot` | InvalidGuildRank | 400 | |
| `""` (empty) | Unknown | as fits | Unable to create guild. |

The seventeen code strings sit together in the executable (B, file offsets `0x447b950` to
`0x447bca0`), in the same order as the error enum in the SDK (K). The pairing comes from the mapper
(B, H). The name rules come from the texts above and from the client's own length limits (4 and 15
for names, 2 and 6 for nameplates, B). The executable also holds older texts with other limits ("4-32"
and "2-7"); they belong to the unused v1 code.

### Name and nameplate rules

Checked in this order; the first failure decides.

1. The caller (for a create, the leader) is not already in a guild: `Occupied`.
2. Name: 4 to 15 English letters and digits, nothing else (a space is invalid): `Obedient`.
3. Name: at most 6 digits: `Numbered`.
4. Name: at most 6 of the same letter in a row, regardless of case: `Lettered`.
5. Name: no word from the deny list (G): `Nasty`.
6. Name: not taken, regardless of case (G): `Seized`.
7. Nameplate: empty, or 2 to 6 English letters and digits: `Dutiful`. An empty nameplate is allowed
   (the client skips its own check when it is empty, B), and several guilds may have none.
8. Nameplate: no word from the deny list: `Dirty`.
9. Nameplate: not taken, regardless of case: `Captured`.

The client never calls the profanity service (the cooked config turns it off), so the server keeps a
short built-in deny list; `GUILD_NAME_DENYLIST` adds words (see
[Configuration]({{ config_page.url | relative_url }})).

### The routes

| Route (endpoint key) | Caller | What it does | Conf |
|:---------------------|:-------|:-------------|:-----|
| `GET /guild` (`GuildEndpoint_v2`) | the client, at login, at each world load and after every guild action (L: 34 calls in 8 logins) | the caller's guild, or 204 | H |
| `GET /guild/invite/player` (`GuildViewInvitesEndpoint_v2`) | the same moments | the caller's open invites: `{id, guild_id, guild_name, inviter_account_id}` | H |
| `POST /guild/validate` (`GuildCreateValidateEndpoint_v2`) | the client, while typing in CREATE A GUILD (L: 2 calls) | `{leader_account_id, name, nameplate}`: checks the rules | H |
| `POST /guild` (`GuildEndpoint_v2`) | the **game server**, after `ServerCreateGuild` (L: 1 call) | the create; answers the new guild, which the client applies straight away | H |
| `DELETE /guild/:guildId` (`GuildDisbandEndpoint_v2`) | DISBAND GUILD, leader only | removes the guild | H |
| `PUT /guild/invite/:accountId` (`GuildInviteEndpoint_v2`) | the add-member box, "Invite to Guild" in any player's menu | invites; Leader or Officer | H |
| `POST /guild/invite/accept/:guild_invite_id` | Accept Guild Invite | joins as a Member | H |
| `DELETE /guild/invite/:guild_invite_id` | Decline Guild Invite | removes the invite | H |
| `DELETE /guild/player` (`GuildLeaveEndpoint_v2`) | Leave Guild | leaves; not the leader | H |
| `DELETE /guild/player/:accountId` (`GuildKickEndpoint_v2`) | Kick From Guild, leader only | removes a member | H |
| `PUT /guild/rank/:accountId/:rank` (`GuildChangeRankEndpoint_v2`) | Promote To Guild Officer (`officer`), Demote To Guild Member (`member`), Promote To Guild Leader (`leader`) | changes a rank; `leader` hands the guild over | H (the route), M (the old leader becoming an Officer is our choice) |

The guild object in the replies is `{id, name, nameplate, leader_account_id, members: [{phx_account_id,
rank}], maximum_guild_members}` (B `0x140b13de0`, K `FGuildData`). The exact checks and codes of each
route are on [HTTP API]({{ api_page.url | relative_url }}#guilds).

### Creating a guild through the game server

Because the game server only passes on the leader id the client put in the RPC, the metagame must not
simply trust it (G):

- `POST /guild` accepts only the game-server key, only from this machine. A player's token alone is
  refused.
- A player token the game server forwards is read if valid and ignored otherwise. The shared login
  check would fail with a server error on a stale token there, so the guild create has its own.
- The leader must have validated a name in the last 15 minutes, or been heard from in the last minute
  (party poll, heartbeat). In normal play both are true: the widget validates while the player types,
  and the client polls its party every 10 seconds in Ramsgate. Otherwise the create is refused and
  logged as "no recent validate or activity".
- At most one new guild per leader per 10 minutes, and an admin can disband any guild.

### Storage, limits and permissions

Guilds, members and invites are stored in SQLite (migration `0013_guilds`, three new tables; see
[Files and data]({{ files_page.url | relative_url }})), so a guild survives restarts and an invite waits
for a player who is offline.

| Limit | Value |
|:------|:------|
| Members per guild | `GUILD_MAX_MEMBERS`, default 100 (the client takes whatever number we send) |
| Invite lifetime | `GUILD_INVITE_TTL_DAYS`, default 7 |
| Open invites per guild | 50 |
| Invites sent per inviter | 30 per hour |
| Open invites per player | 20; the oldest is dropped |
| Guilds created per leader | 1 per 10 minutes |

| Action | Who |
|:-------|:----|
| Read your guild and your invites | you |
| Invite | Leader, Officer |
| Accept, decline | the invited player |
| Leave | Member, Officer |
| Kick, change ranks, disband | Leader |

A block in either direction refuses a guild invite. A player in another guild can be invited but must
leave that guild before accepting (the client says so itself, B).

**Nothing is pushed.** Other members and invitees see a change at their next `GET /guild` (login,
world load, or their own guild action). The panels do not refresh themselves (B).

## Testing without the game {#testing-without-the-game}

The fixes are tested over HTTP against the real metagame, with the client's own bodies and headers:

- **A model of the client** (`UndauntedMetagame/test/socialclient.ts`) reimplements the parse rules
  above: the mapping parser, the user-info cache with its first-reply-wins key, the toolkit's Epic id
  check, the Phoenix envelope, the guild error mapping, the friends list and the party invitations.
  Fed the replies our server sent on 22 September 2026, it reproduces what the players saw: the array
  mapping maps nothing, and the old user-info reply leaves the invite's sender invalidated. That checks
  the model, and guards against the same mistakes coming back.
- **The social flows** (`test/socialflow.test.ts`): Add Friends by name through the whole chain, a
  pending request seen at the other player's login, blocked players, a received party invite whose
  sender is set up, accept, every party member resolving to their own name, the leader queueing with
  every member expected exactly once, user info filed under the right id in any order, the name form of
  `/accountinfo/public`, the mapping details, both rollback switches, and the new friend limits.
- **Guilds** (`test/guildhttp.test.ts`): every route and error code, the game server's create and its
  checks, invites, expiry, the limits, ranks and hand-over, kick, leave and disband (including the
  route order), a restart, permissions and `GUILDS=0`. Each reply is checked as exact JSON and through
  the model.

## Open questions, and the live test

To be checked in the next two-player test, after a deploy and with body logging on for the session:

1. Does the `/accountinfo/public` fix alone make received party invites show? The log should show the
   invite poll, then `accountinfo/public by <recipient> for <sender> -> found`.
2. Where does an incoming friend request appear, and is that section hidden while empty?
3. Does the Block menu reach our friends routes at all (a `POST` or `PUT .../blocklist/...` line)?
4. What does the guild validate send as `leader_account_id`, and does the game server's `POST /guild`
   carry the player's token? (The create's log line says "with the player's token" when it does.)
5. Does `GET /guild` run at every world load (34 calls in 8 logins suggest so)?
6. Nobody should be kicked from a party after a minute (no `DELETE /party/member/<id>` or
   `/party/leader/<id>` lines).

Rollback switches, if a fix disturbs something: `ACCOUNTINFO_PUBLIC_LEGACY=1`, `ACCOUNT_MAPPING=0`
and `GUILDS=0` (see [Configuration]({{ config_page.url | relative_url }})).

## Deferred {#deferred}

| Item | Why |
|:-----|:----|
| **Online status and chat** (an XMPP server) | Online status, EPIC FRIENDS, "In Ramsgate", party, guild and area chat, whispers, and friend requests showing without a new login all ride on XMPP. The launcher already points the game's chat connection at port 61099; nothing listens there yet (roadmap 3.10). It must never echo a player's own presence back (see [Parties](#parties)). |
| Recent players from the friends service | Never called live; the in-game Recent Players list is kept in the character data. |
| Other friends routes (settings sources, delete all, email lookups) | Never called live. |
| Listing sent party invites | The client might misread them as received. |
| Party finder, console sessions, Phoenix's presence socket | Never called; polling carries all party state. |
| Voice | Vivox is gone; guild voice is not implemented in 1.4.4 itself. |
| Linked Slayers (My Links) | Never called live. |
| The v1 guild API | Never called by 1.4.4. |

The [2.1.1 standalone attempt]({{ awakening_page.url | relative_url }}) describes the same Phoenix
services from the final client, including the wrapped and flat reply forms.
[Join as a friend]({{ friends_page.url | relative_url }}) explains to players what works today.
