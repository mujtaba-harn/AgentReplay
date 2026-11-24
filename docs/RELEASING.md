# Releasing to npm

Releases are built and staged by GitHub Actions (`.github/workflows/release.yml`), never from a
laptop, and go live only after the owner approves them on npmjs.com.
Every release carries npm **provenance**: a public record linking the package to the exact commit
and workflow that built it.

## One-time setup (owner)

1. Create an account on [npmjs.com](https://www.npmjs.com/signup) and turn on two-factor
   authentication (Account → Two-Factor Authentication → "Authorization and writes").
2. Give GitHub permission to publish, for the **first** release only:
   1. On npm: Access Tokens → Generate New Token → **Granular Access Token**. Expiry 7 days;
      Packages and scopes: **Read and write (stage only)**, all packages.
   2. On GitHub: the repo → Settings → Secrets and variables → Actions → New repository secret.
      Name `NPM_TOKEN`, value: the token.
3. After the first release, switch to **trusted publishing**, which needs no token at all:
   1. On npm: the `crafter-replay` package → Settings → Trusted Publisher → GitHub Actions.
      Organization or user `mujtaba-harn`, repository `crafter-replay`, workflow file
      `release.yml`.
   2. Delete the `NPM_TOKEN` secret on GitHub and revoke the token on npm.

## Every release

1. Set the new version in `packages/cli/package.json` (for example `0.1.1`) and commit.
2. Tag that commit with the same version and push the tag:
   `git tag v0.1.1 && git push origin v0.1.1`.
3. Watch the **Release** workflow on GitHub. It runs check, test, build and the packed-CLI smoke
   test, refuses a tag that doesn't match the package version, then **stages** the version on npm.
4. Approve it: sign in to npmjs.com → Staged Packages → `crafter-replay` → approve with your
   two-factor code. Only then does the version go live.
5. Check from a fresh folder: `npx crafter-replay@0.1.1 --version`.

A version number can only be published once. If a release is broken, fix it and publish the next
version; don't try to replace it.
