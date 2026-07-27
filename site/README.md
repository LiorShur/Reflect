# /site — public docs (served by GitHub Pages)

The public-facing website. Serves the privacy policy, terms of use, and
support page for the app stores + in-app links.

Internal design specs stay in `/docs`. GitHub Pages serves **only this
folder**.

## Enable GitHub Pages (one-time setup)

1. Push this folder to `main` (already done).
2. GitHub repo → **Settings** → **Pages**.
3. **Build and deployment** → **Source** → **Deploy from a branch**.
4. **Branch** → `main` → **/site** → **Save**.
5. Wait ~1–2 min for the first build. Site publishes at
   `https://liorshur.github.io/Reflect/` (or your configured custom
   domain).

The privacy policy will then be reachable at:
`https://liorshur.github.io/Reflect/privacy`

That is the URL to paste into:
- Google Play Console → App content → Privacy policy
- Apple App Store Connect → App information → Privacy policy URL
- The in-app "By continuing you agree to…" line (once we wire it up)

## What's here

| File | Purpose |
|---|---|
| `_config.yml` | Jekyll theme + site metadata |
| `index.md` | Landing page |
| `privacy.md` | Privacy policy — **TEMPLATE PENDING LAWYER REVIEW** |
| `terms.md` | Terms of use — **TEMPLATE PENDING LAWYER REVIEW** |
| `support.md` | Support / contact / safety resources |

## Fill-in-the-blanks before publishing

The privacy and terms pages contain **REPLACE WITH …** placeholders and
"internal notes" at the bottom that must be addressed:

- Contact email
- Jurisdiction / governing law
- Age gate (18+ per current draft; check legal for your regions)
- Resources URL (once the in-app resources screen exists)
- Anthropic zero-retention API tier confirmation

**Do not publish** with the placeholders still in the text. Do not remove
the "TEMPLATE PENDING LAWYER REVIEW" banners without a lawyer's sign-off.

## Local preview

Optional — GitHub Pages will render the site on push, but if you want a
local preview:

```
gem install bundler
cd site
bundle init
bundle add jekyll
bundle exec jekyll serve
# Site at http://localhost:4000
```

## Custom domain (later)

If you get a brand domain:
1. Add a `CNAME` file to this folder containing just your domain
   (e.g. `reflect.app`).
2. Configure DNS: `CNAME` `www` → `liorshur.github.io`, or `A` records
   for apex domains per GitHub's docs.
3. Repo Settings → Pages → Custom domain → enter domain → Save.
4. Update the URLs in this README + in the app-store listings.
