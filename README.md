# job-postings-channel

> ## Credit: all listings come from [Simplify](https://simplify.jobs)
>
> Simplify and its community of contributors find, verify and maintain every listing this bot posts, in two open repositories:
>
> - [SimplifyJobs/Summer2027-Internships](https://github.com/SimplifyJobs/Summer2027-Internships)
> - [SimplifyJobs/New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions)

A scheduled GitHub Actions job that checks the SimplifyJobs listing files on GitHub and posts newly added software internship (2027 terms) and new grad listings to Discord. Internships and new grad roles each go to their own channel webhook.

## How it decides what is new

- Each source is fetched with `If-None-Match`. A 304 response skips the source.
- A listing is a candidate when it matches the source filter and was posted within the last 3 days.
- The first run for a source is a seed run. It posts nothing and records every candidate id as seen.
- Later runs post candidates whose id is not in the seen set, oldest first, at most 30 per source per run. Candidates over the cap are not marked seen and post on the next run.
- Seen ids older than 3 days are dropped, so state stays small.
- If a source fails, its state is left untouched so the next run retries it. The other source still advances, and the job is marked failed.

## How it runs

`.github/workflows/post-listings.yml` runs at :08 and :38 of every hour, a few minutes after upstream's half-hourly update. GitHub can delay scheduled runs when it is busy.

State is one file, `state.bin`, on a separate `state` branch. Each run checks that branch out, runs `node src/main.ts .state/state.bin`, and commits the file back if it changed. Keeping it off `main` keeps the history readable.

`state.bin` is a compact binary file: 20 bytes per posted listing, plus each source's id and etag. The layout is documented at the top of `src/state.ts`. To read it as JSON:

```
git fetch origin state
git show origin/state:state.bin > state.bin
npm run state:dump state.bin
```

To run it by hand, open the Actions tab, pick "Post new listings", and press "Run workflow". A manual run does exactly what a scheduled run does, including posting to Discord.

## Setup

1. Create the `state` branch once:

   ```
   git switch --orphan state
   printf "\001\000" > state.bin
   git add state.bin
   git commit -m "Start with empty state"
   git push -u origin state
   git switch main
   ```

2. Add the two webhook URLs as Actions secrets:

   ```
   gh secret set DISCORD_WEBHOOK_INTERNSHIPS
   gh secret set DISCORD_WEBHOOK_NEW_GRAD
   ```

To start over, delete `state.bin` on the `state` branch. The next run seeds silently.

## Local run

Needs Node 22.6 or newer. Copy `.env.example` to `.env`, fill in both webhook URLs, then:

```
npm install
npm start
```

This keeps its own `state.bin` in the project folder, separate from the `state` branch. Pointing it at the real webhooks while the workflow is live posts every listing twice.

Run `npm test` for the unit tests and `npx tsc --noEmit` for type checking.

## Changing sources

- To add a repo, add one row to `SOURCES` in `src/sources.ts` with an id, webhook variable name, raw `listings.json` URL, embed color, and a `matches` function. A new webhook variable also needs a line in the workflow's `env` block.
- To change which categories count as software, edit `SOFTWARE_CATEGORIES` at the top of `src/sources.ts`.
- To change the internship term year, edit `INTERNSHIP_TERM_YEAR` in the same file.
- The window and the per-source cap are `WINDOW_SECONDS` and `MAX_POSTS_PER_SOURCE` in `src/select.ts`.

## Branch protection

Two repository rulesets guard the branches.

- `main` only changes through a pull request with one approving review. Force pushes and deletion are blocked, and nobody is exempt.
- `state` can only be pushed by a deploy key. The workflow holds the private half in the `STATE_DEPLOY_KEY` secret and uses it for the state checkout. GitHub does not allow the built-in Actions token on a ruleset's bypass list, which is why a deploy key is used. The job's own token is read-only.

To rotate the key, generate a new pair with `ssh-keygen -t ed25519`, add the public half under Settings, Deploy keys with write access, set the private half as the `STATE_DEPLOY_KEY` secret, and delete the old deploy key.
