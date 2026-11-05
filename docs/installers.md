# Installers, and what a release needs by hand

Folio installs from six places. Four take a release as it is on GitHub, and two are files the release
workflow adds to it. This page says what each is, where it lives, how it's tested, and what Samyak does by
hand at each release, including the steps for sending Folio to winget. [DESIGN.md](../DESIGN.md) §130 and
§131 have the reasons, and [verifying-releases.md](verifying-releases.md) says how a person checks what
they downloaded.

| Installer | File | What it installs | Tested by |
|:--|:--|:--|:--|
| winget | `packaging/winget/manifests/s/samyyy2423/Folio/<version>/` | `folio-windows.exe`, as the command `folio` | the schema, the URL and sum, `winget validate` and `winget install` |
| Scoop | `packaging/scoop/folio.json` | `folio-windows.exe`, as `folio.exe` | the schema, the URL and sum, `scoop install`, checkver and autoupdate |
| install.ps1 | `packaging/install.ps1` | `folio-windows.exe`, checked against `SHA256SUMS.txt`, into `%LOCALAPPDATA%\Programs\Folio`, on the user's PATH | the real release, in PowerShell 7 and 5.1, and a wrong sum refused |
| install.sh | `packaging/install.sh` | `folio-linux`, checked against `SHA256SUMS.txt`, into `~/.local/bin`, on PATH | the real release on Ubuntu and Alpine, and a wrong sum refused |
| .deb | `packaging/debian/build-deb.sh` | `folio-linux` as `/usr/bin/folio` | installed, run and removed on Debian 12 and 13 and Ubuntu 22.04 and 24.04 |
| Docker | `packaging/docker/Dockerfile` | `folio-linux` as `/usr/bin/folio` on distroless | a program run, built, and using C's library and OpenSSL |

CI tests them in `.github/workflows/packaging.yml`, on every change to them, and `packaging.test.js` (part of
`npm test`) checks what it can without the network.

## Each release

A release is still made by hand: `folio-windows.exe`, `folio-linux` and `SHA256SUMS.txt`, uploaded to a new
GitHub release. What changes:

1. **Build the two programs with the script**, from the commit to be tagged, with `package.json` already at
   the new version:

   ```bash
   packaging/release-build.sh dist
   ```

   It makes folio with Node.js, has it build itself and the Windows folio, checks each is the same bytes, and
   writes `dist/folio-linux`, `dist/folio-windows.exe` and `dist/SHA256SUMS.txt`. (v1.11.0's programs were
   built without `--include folio-debugger.folio`, so they aren't the bytes its tag builds; the script can't
   leave it out.)
2. **Publish the release** with those three files. The `release` workflow then starts by itself. It builds
   folio again from the tag, and stops before signing anything if the release's files aren't those bytes, or
   aren't the fixed point on Linux and on Windows. Then it adds `folio_<version>_amd64.deb`,
   `folio-<version>.cdx.json` (the SBOM) and a `.sig`, `.pem` and `.sigstore.json` for every file, attests
   them, and pushes `ghcr.io/samyyy2423/folio:<version>` and `:latest`.
3. **The first time only:** check the image's package is public, as GitHub can make a new package private.
   On the repository's page, open Packages, then `folio`. If it says Private, go to Package settings and
   change its visibility to public, so `docker pull` works without signing in.
4. **Scoop:** people install from `packaging/scoop/folio.json` on `main`, so it has to name the new release.
   The run's `manifests` artifact has the new `scoop/folio.json`. Put it in a pull request, or write it here
   with `node packaging/manifests.mjs <version> <folio-windows.exe's SHA-256> <the day>`. Scoop's own
   `checkver.ps1 -App folio -Dir packaging/scoop -Update` writes the same.
5. **winget:** send the new version, as below. The `manifests` artifact has its three files.

If a release's run fails (a network failure, say), re-run its failed jobs from the Actions tab. To do a
release's run again from the start, use **Run workflow** on the release's tag (Use workflow from: Tags) with
**dry-run** off. It replaces what it uploaded before. Run on a tag with dry-run on, it checks that release's
files and signs nothing that counts.

### A dry run

**Run workflow** on any branch, with dry-run on (the default), does all of it into the run's artifacts:
`dist` (the programs, sums, .deb and SBOM), `signatures`, `image` (the image, from `docker save`) and
`manifests`. It signs with [Sigstore's staging instance](https://docs.sigstore.dev/), which is kept for trying
things, so nothing reaches the log people verify against. It doesn't attest, push or upload. A push that
changes `packaging/`, `release.yml` or `bootstrap.mjs` does one too.

## Sending Folio to winget

winget's packages are pull requests to [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs),
each adding one version's manifests. For 1.11.0 the manifests are here already, in
`packaging/winget/manifests/s/samyyy2423/Folio/1.11.0/`. They're written to schema 1.28.0, the one winget-pkgs'
pull request checklist asks for, and CI checks them against it.

On Windows, with winget up to date (Microsoft Store, App Installer, or `winget upgrade Microsoft.AppInstaller`):

1. **Test them.** In a terminal opened as administrator, turn on local manifests once:

   ```powershell
   winget settings --enable LocalManifestFiles
   ```

   Then, in an ordinary terminal, from this repository:

   ```powershell
   winget validate --manifest packaging\winget\manifests\s\samyyy2423\Folio\1.11.0
   winget install --manifest packaging\winget\manifests\s\samyyy2423\Folio\1.11.0
   folio
   winget uninstall --manifest packaging\winget\manifests\s\samyyy2423\Folio\1.11.0
   ```

   `folio` should start the Folio shell in a new terminal (`quit` ends it).
2. **Fork** [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) on GitHub. It's large, so
   clone only the folder you need:

   ```bash
   git clone --filter=blob:none --sparse https://github.com/<you>/winget-pkgs.git
   cd winget-pkgs
   git sparse-checkout set manifests/s/samyyy2423
   git switch -c samyyy2423.Folio-1.11.0
   ```

3. **Copy the folder in**, as it is: `packaging/winget/manifests/s/samyyy2423/Folio/1.11.0` from here to
   `manifests/s/samyyy2423/Folio/1.11.0` there. Commit and push:

   ```bash
   git add manifests/s/samyyy2423/Folio/1.11.0
   git commit -m "New package: samyyy2423.Folio version 1.11.0"
   git push -u origin samyyy2423.Folio-1.11.0
   ```

4. **Open the pull request** to microsoft/winget-pkgs' `master`, titled
   `New package: samyyy2423.Folio version 1.11.0`, and fill in its template's checklist. The Microsoft CLA bot
   asks you to sign the Contributor License Agreement once.
5. **Wait for the checks.** winget's pipeline downloads `folio-windows.exe`, checks its SHA-256, scans it,
   installs it in a sandbox, and then a moderator merges it. If a label like `Needs-Author-Feedback` appears,
   the bot's comment says what to change. A new package takes days. Once it's merged,
   `winget install samyyy2423.Folio` works for everyone.

For each later release, the steps are the same with the `manifests` artifact's
`winget/manifests/s/samyyy2423/Folio/<version>/` and the title `New version: samyyy2423.Folio version <version>`.
Microsoft's [wingetcreate](https://github.com/microsoft/winget-create) can do steps 2 to 4 in one command
(`wingetcreate update samyyy2423.Folio --version <version> --urls <folio-windows.exe's URL> --submit`), with a
GitHub token of your own.

## Scoop

`scoop install https://raw.githubusercontent.com/samyyy2423/folio/main/packaging/scoop/folio.json` installs
folio from the manifest on `main`, and `scoop update folio` takes a newer one once `main` has it. The manifest's
`checkver` finds the latest release on GitHub, and `autoupdate` says where its program and sum are, so
Scoop's `checkver.ps1 -Update`, or a bucket's update bot, writes the next version by itself. To put Folio in a
bucket such as [ScoopInstaller/Main](https://github.com/ScoopInstaller/Main), send them this file. Their
[contributing guide](https://github.com/ScoopInstaller/.github/blob/main/.github/CONTRIBUTING.md) says what
they take.
