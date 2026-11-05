# Checking a download

From the release after 1.11.0, every file of a release is signed with [Sigstore](https://www.sigstore.dev/),
and GitHub attests where it was built. Both say the same thing: these bytes came from
[`release.yml`](../.github/workflows/release.yml) in samyyy2423/folio, running on this release's tag. Neither
needs a key you have to find and trust; the signature names the workflow, and a public log keeps a record
of each one.

Each file `F` of a release (`folio-linux`, `folio-windows.exe`, `SHA256SUMS.txt`, the .deb and the SBOM) has
three files beside it:

| File | What it is |
|:--|:--|
| `F.sigstore.json` | everything needed to check `F`: the signature, the certificate and the log's proof of it |
| `F.sig` | the signature alone, in base64 |
| `F.pem` | the certificate alone: who signed, as Sigstore's Fulcio checked it |

`folio-<version>.cdx.json` is the release's SBOM: what's built into each program.

The commands below are for 1.12.0. Put in the version you downloaded, in the tag and the file names.

## With cosign

Install [cosign](https://docs.sigstore.dev/cosign/system_config/installation/) (2.x or 3.x). Then, for
`folio-linux` (any other file is the same):

```bash
cosign verify-blob folio-linux \
  --bundle folio-linux.sigstore.json \
  --certificate-identity https://github.com/samyyy2423/folio/.github/workflows/release.yml@refs/tags/v1.12.0 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

With cosign 2.x, add `--new-bundle-format`. It says `Verified OK`, or why not. It checks, with no other
download:

- that the signature is of these bytes;
- that Sigstore's Fulcio gave the certificate to GitHub Actions, for exactly that workflow on exactly that
  tag. A copy of the workflow in another repository, or a run on a branch (as a dry run is), has another
  identity and fails;
- that the signature is in Sigstore's public transparency log, Rekor, from while the certificate was good.

On Windows, in PowerShell, it's the same command on one line, or with `` ` `` at the ends of the lines in
place of `\`.

With cosign 2.x, the signature and certificate on their own work too. cosign then finds the log's record
online:

```bash
cosign verify-blob folio-linux \
  --signature folio-linux.sig --certificate folio-linux.pem \
  --certificate-identity https://github.com/samyyy2423/folio/.github/workflows/release.yml@refs/tags/v1.12.0 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

`openssl x509 -in folio-linux.pem -noout -text` shows the certificate: the workflow, the commit and the tag are
in its extensions.

## With GitHub's CLI

[`gh`](https://cli.github.com/) checks GitHub's attestation of where a file was built, which GitHub keeps
for the repository. Use a recent `gh`: older ones lack `--source-ref`.

```bash
gh attestation verify folio-linux --repo samyyy2423/folio \
  --source-ref refs/tags/v1.12.0 \
  --signer-workflow samyyy2423/folio/.github/workflows/release.yml
```

It shows the build's provenance (SLSA): the repository, the commit, the workflow and the run. The two programs
also have their SBOM attested. To see it:

```bash
gh attestation verify folio-linux --repo samyyy2423/folio --predicate-type https://cyclonedx.org/bom --format json
```

## The Docker image

The image is signed and attested by its digest:

```bash
cosign verify ghcr.io/samyyy2423/folio:1.12.0 \
  --certificate-identity https://github.com/samyyy2423/folio/.github/workflows/release.yml@refs/tags/v1.12.0 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify oci://ghcr.io/samyyy2423/folio:1.12.0 --repo samyyy2423/folio
```

Its `/usr/bin/folio` is the release's `folio-linux`, byte for byte.

## The .deb

Check `folio_1.12.0_amd64.deb` as any other file, before installing it. The `folio` inside it is the release's
`folio-linux`:

```bash
dpkg-deb --fsys-tarfile folio_1.12.0_amd64.deb | tar -xO ./usr/bin/folio | sha256sum
```

gives the same sum as `folio-linux` in `SHA256SUMS.txt`.

## The SBOM

`folio-1.12.0.cdx.json` is [CycloneDX](https://cyclonedx.org/) 1.6, which most SBOM tools read. It lists each
of the release's files with its SHA-256 and SHA-512, and what each program is built from. That's the Folio
source files `folio.folio` is compiled with, the files of the standard library and of the page
`folio build --web` writes, each with its sum at the release's commit, and the DejaVu letters in
`machine.folio`, under their own license. folio links no library, so the list is complete, and the SBOM says
so. For example, with `jq`:

```bash
jq -r '.components[] | [.name, .type, (.hashes[0].content // "")] | @tsv' folio-1.12.0.cdx.json
```

## The sums alone

`SHA256SUMS.txt` has the two programs' SHA-256s, as every release has. `sha256sum -c SHA256SUMS.txt
--ignore-missing` (or `certutil -hashfile folio-windows.exe SHA256` on Windows) checks the download arrived
whole. On its own it doesn't say who made it: anyone who could change the program could change the sums.
Its own signature does, so check `SHA256SUMS.txt` with cosign, and then the programs with it.
[install.sh and install.ps1](installers.md) check the sum and nothing more.

## Build it yourself

The strongest check needs no one's signature. folio builds itself into the same bytes, so the release's
programs are what its source makes. With [Node.js](https://nodejs.org/) 22:

```bash
git clone --branch v1.12.0 https://github.com/samyyy2423/folio.git && cd folio
packaging/release-build.sh dist
cmp dist/folio-linux /path/to/downloaded/folio-linux && cmp dist/folio-windows.exe /path/to/downloaded/folio-windows.exe
```

The script makes folio from the source with Node.js, has that folio build itself and the Windows folio, and
checks each step gives the same bytes. The release workflow does the same, on Linux and on Windows, before it
signs anything.

**Releases up to 1.11.0** have only `SHA256SUMS.txt`. 1.11.0's two programs were built without
`--include folio-debugger.folio`, so they're what `folio build folio.folio --allow-read --allow-write --allow-run`
makes of the v1.11.0 source, not what `node bootstrap.mjs` makes. To rebuild them, use that command, with
folio from `node bootstrap.mjs` at the v1.11.0 tag. (Without the debugger built in, their `folio debug` needs
`folio-debugger.folio` in the folder it's run in.)

## What this proves, and what it doesn't

- A good signature and attestation say the file is what samyyy2423/folio's release workflow signed for that
  tag, and the workflow signs only what it built from the tag's source. They don't say the source is free of
  bugs, or that no one with write access to the repository changed it. The tag's commit, in the certificate,
  is where to look.
- The log's record is public, so a signature made by anyone who got hold of the workflow would be there to
  see.
- They don't cover a program folio builds. That's yours to sign, with `folio build --sign`.
