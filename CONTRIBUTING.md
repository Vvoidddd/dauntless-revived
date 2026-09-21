# Contributing to Dauntless Revived

Thanks for wanting to help keep Dauntless playable. This is a small hobby project, so the rules
are short.

🇫🇮 [Suomeksi alempana](#suomeksi)

1. **Start with a Discussion.** Before you write code, open a
   [Discussion](https://github.com/mixutin/dauntless-revived/discussions) that says what you want to
   change and why. Check [ROADMAP.md](ROADMAP.md) first: much of the work is already planned, and
   each step has an id (such as `1.9` or `2.7`). Mention the id if there is one.
2. **Test on a throwaway account.** Never try a new server response on a real player's account
   first. A wrong response shape can crash the 1.4.4 client ("Trying to resize TArray to an invalid
   size") or damage a save. Back up the database before anything that migrates it.
3. **Never commit secrets or game files.** That means no account or server keys, no `.env` files,
   no databases, backups or logs, and nothing from the game: executables, paks, assets or its
   config. If you commit something like that by accident, say so in the pull request, and rotate
   any key it exposed.
4. **Keep pull requests small and focused.** Say what you changed, how you tested it, and which
   roadmap step it belongs to. If you change `ROADMAP.md`, run `node tools/sync-roadmap.js` so the
   docs site copy matches. Update the docs when behaviour changes.
5. **License.** This project is AGPL-3.0-only, like upstream Undaunted. By contributing, you agree
   that your contribution is licensed under the same terms. Keep existing copyright and license
   notices.
6. **Security problems** go through
   [private vulnerability reporting](https://github.com/mixutin/dauntless-revived/security/advisories/new),
   not issues or pull requests. See [SECURITY.md](SECURITY.md).
7. **Be kind.** See the [Code of Conduct](CODE_OF_CONDUCT.md).

If a problem is in upstream Undaunted's code and not in a change this fork made, consider
contributing the fix to [Undaunted](https://github.com/SyST3MDeV/Undaunted) as well.

---

## Suomeksi

Kiitos, että haluat auttaa pitämään Dauntlessin pelattavana. Säännöt ovat lyhyet:

1. **Aloita keskustelusta.** Ennen kuin kirjoitat koodia, avaa keskustelu
   [keskustelupalstalla](https://github.com/mixutin/dauntless-revived/discussions) ja kerro, mitä
   haluat muuttaa. Katso ensin tehtävälista [ROADMAP.md](ROADMAP.md): moni asia on jo suunniteltu.
2. **Kokeile erillisellä testitilillä.** Älä kokeile uutta palvelimen vastausta kenenkään oikealla
   tilillä. Väärin muotoiltu vastaus voi kaataa pelin tai rikkoa tallennuksen. Ota varmuuskopio
   tietokannasta ennen muutoksia.
3. **Älä koskaan lisää projektiin salaisuuksia tai pelin tiedostoja.** Ei avaimia, ei
   `.env`-tiedostoja, ei tietokantoja, varmuuskopioita tai lokeja, eikä mitään pelistä.
4. **Tee pieniä muutoksia kerrallaan.** Kerro, mitä muutit ja miten kokeilit sitä.
5. **Lisenssi.** Projekti käyttää AGPL-3.0-only-lisenssiä. Kun lähetät muutoksen, se julkaistaan
   samalla lisenssillä.
6. **Tietoturva-aukoista** ilmoitetaan yksityisesti, ks. [SECURITY.md](SECURITY.md).
7. **Ole ystävällinen.** Ks. [käytösohjeet](CODE_OF_CONDUCT.md).
