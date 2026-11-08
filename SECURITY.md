# Security

## Reporting a vulnerability

Please don't open a public issue for a security problem. Report it privately, through GitHub:

**[Report a vulnerability](https://github.com/samyyy2423/folio/security/advisories/new)** (the repository's
Security tab, then "Report a vulnerability").

Say what's wrong, which version of folio (and Windows or Linux) it's in, and how to make it happen: a Folio
program, the commands, and what it did that it shouldn't. If you can't use GitHub's form, open an issue that
asks for a private way to send a report, with no details in it.

What happens then:

- You'll get a reply within 7 days, saying whether it's a vulnerability and what comes next.
- A fix comes in a patch release of every version that's still covered (below), as soon as it's ready, with
  a GitHub security advisory and a CVE where one fits. You're named in it, unless you'd rather not be.
- Please keep it private until the fix is out, or for 90 days, whichever comes first. If it's being used
  against people already, say so, and it'll go faster.

A problem in a package someone else wrote goes to that package's author. Once it's fixed, or if the author
doesn't answer, an advisory about it can go in the package index, so `folio audit` finds it: see
[Advisories](#advisories-and-folio-audit).

## Supported versions

| Version | Security fixes |
|:--|:--|
| 1.11, the newest | yes |
| 1.10 | until 90 days after 1.11 came out (until 2027-02-02) |
| 1.9 and older | no: update to 1.11, which runs every 1.x program |

[VERSIONING.md](VERSIONING.md) has the rule behind this: the newest minor release gets every fix, the one
before it security fixes for 90 days, and once 2.0 is out, the last 1.x gets them for a year.

## Checking a download

Each release has `folio-windows.exe`, `folio-linux` and `SHA256SUMS.txt`, and its notes give the same sums.
Check one with `sha256sum folio-linux` (or `certutil -hashfile folio-windows.exe SHA256` on Windows). That
says the download arrived whole, not who made it.

**Signed releases.** From the release after 1.11.0, the release workflow signs every file of a release with
[Sigstore](https://www.sigstore.dev/), keyless: each file has a `.sigstore.json` bundle, a `.sig` and a
`.pem` beside it, and the certificate names `.github/workflows/release.yml` in samyyy2423/folio, on the
release's tag. GitHub also attests where each file was built, and the release has an SBOM
(`folio-<version>.cdx.json`, CycloneDX) of what's built into folio. Check a file with either:

```text
cosign verify-blob folio-linux --bundle folio-linux.sigstore.json \
  --certificate-identity https://github.com/samyyy2423/folio/.github/workflows/release.yml@refs/tags/v1.12.0 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify folio-linux --repo samyyy2423/folio --source-ref refs/tags/v1.12.0
```

[docs/verifying-releases.md](docs/verifying-releases.md) has the rest: cosign 2 and 3, the `.sig` and
`.pem` alone, the Docker image, the .deb, and the SBOM. The workflow signs a release only after building
folio from the tag's source and finding the release's programs are those same bytes, and that each builds
itself and the other into the same bytes, on Linux and on Windows; it signs nothing for a release whose
programs aren't what its source builds. (With cosign 2, add `--new-bundle-format` to the command above.)

You can also make folio yourself and compare: `node bootstrap.mjs` makes folio from the source, and that folio
builds itself into exactly the bytes of the release, on Windows or Linux:

```text
folio build folio.folio --allow-read --allow-write --allow-run --include folio-debugger.folio --include package.json
```

`packaging/release-build.sh dist` does all of it, the Windows program included. 1.11.0's programs were
built without `--include folio-debugger.folio` or `--include package.json` (which `folio --version` reads, from
the release after 1.11.0), so for 1.11.0 leave both out.

## The permission model

A program folio builds asks before it does anything outside itself, the way Deno does. It's the `--allow`
flags that decide what it may do without asking.

### What asks

| A program wants to | Flag that allows it |
|:--|:--|
| read a file or a folder | `--allow-read`, or `--allow-read=data,notes.txt` for only those |
| write or remove a file | `--allow-write`, or `--allow-write=out` |
| read a site, or send to one | `--allow-net`, or `--allow-net=example.com` for only that host |
| start another program (`run program`) | `--allow-run` |
| call a C library (`use the library`), or reach memory by its address (memory.folio's `take`, `block_at` and the rest) | `--allow-libraries` |
| all of these | `--allow-all` |

Without the flag, a person at a terminal is asked, once for each file, site, program or library (`a` says
yes to all of them). Anywhere else, in a script, a service or a pipe, the answer is no. A no is a mistake
the program can catch. The flags given to `folio build` are built into the program; `folio run`, `folio test`
and the others take them for that run.

### What it protects against

With no flags, a Folio program you didn't write can't, without someone saying yes at a terminal:

- read or change any file, list any folder, or remove anything;
- go online, or send anything anywhere;
- start a program, or load a library that could;
- reach memory by its address, which could change what the flags allow. Folio's own loops in machine code
  (`use the library "folio"`) need no flag, and take only the lists and bytes they're given.

With flags that name what they allow, it stays inside them:

- **Files** are checked where they really are, once `..`, symbolic links and junctions are followed: with
  `--allow-read=data`, neither `data/../secret.txt` nor a link in `data` that leads out of it can be read,
  and a folder named `data-old` isn't `data`.
- **Sites** are checked by their host, exactly: `--allow-net=example.com` doesn't allow
  `example.com.evil.net`, and an address written oddly (`a.com@b.com`, a backslash) matches no host. A site
  that sends the program on to another address is asked about again there, ten moves at most.
- **`use`** reads only files in the program's own folder or the folders inside it, never `../x`, a file
  from the top of a disk, or a link that leads out, so building a program can't read your other files into
  its mistakes.
- **On Windows**, folio and the programs it builds load their DLLs only from System32, so a `winhttp.dll`
  left in Downloads beside them can't run inside them; `run program "git"` never runs a `git.exe` beside the
  program or in the current folder; and an argument to a `.bat` or `.cmd` file can't slip in a command.
- **Questions** show a file's name with anything that could move the cursor or turn the text around
  replaced by `?`, so a name can't hide what it is.

### What it doesn't protect against

- **A C library, and a program the program starts, can do anything you can.** They run outside Folio, so the
  flags don't reach them. `--allow-libraries` and `--allow-run` are as good as `--allow-all`; give them only
  to a program you trust.
- **What a flag allows, it allows completely.** A program with `--allow-read` and `--allow-net` can send any
  file it can read to any site. Name what's needed (`--allow-read=data`, `--allow-net=api.example.com`)
  rather than allowing everything.
- **It isn't a limit on resources.** A program can use all the memory and time it's given, loop for ever,
  or fill the disk where it may write. Run untrusted code with the system's own limits too.
- **It doesn't guard against another program on the same computer** changing a folder while a Folio program
  checks it, or reading what a Folio program writes.
- **It doesn't clean a program's own output.** What `say` writes goes to the terminal as it is, terminal
  control sequences included.
- **Code from packages runs as part of the program**, with all the permissions the program has. Checking a
  package's sums and signatures (below) says you got the code that was pinned and who signed it, not that
  the code is safe.
- **Built programs load at a fixed address** (no ASLR). They never run their data or change their code, and
  Folio checks every item number and every value's kind, so this matters only if the runtime itself has a
  bug.
- **The playground** runs a shared link's code as soon as it opens, in a worker that can't reach the page,
  and with no files but those picked for it.
- **folio itself** is built with `--allow-read --allow-write --allow-run`: `folio run`, `folio add` and the rest
  read and write in the folder they're run in, and start git, curl and the programs they build.

## Packages

A package is a Git repository that folio clones, and its code runs with the program's permissions, so it's
worth knowing what you get.

- **Pinned.** `folio.packages` keeps each package's exact commit, so `folio get` fetches the same code
  everywhere, and nothing changes until you run `folio update`.
- **Checked.** `folio.sums` keeps the SHA-256 of each package's files at that commit. `folio add` and `folio
  update` write it, and `folio get` checks it: a package changed in `packages/` (by hand, or in a cached
  folder) is named, with the files that changed, and one that comes back different from where it was
  fetched isn't kept. A package's own `folio.sums` is checked for the packages it brings with it. Commit
  `folio.sums` with `folio.packages`.
- **Signed, when you ask.** `folio add`, `get` and `update` with `--signed` take only a package whose
  commit, or the tag it was asked for at, has a signature `git verify-commit` or `git verify-tag` accepts:
  from a key in your GPG keyring, or, for SSH signatures, in the file git's `gpg.ssh.allowedSignersFile`
  names. Which keys to trust is yours to set up in git; folio goes by what git says.
- **Same everywhere.** folio checks a package out with its line ends as committed and a symbolic link as a
  small file holding where it points, whatever the system or your git settings, so its files and their sum
  are the same on Windows and Linux, and a link in a package can't point `use` at a file outside it.
- **Kept to packages/.** folio takes a `folio.packages` line, a program's own or a package's, only if its name
  is a package's name, so its folder is in `packages/` and nowhere else; where it comes from and its version
  don't start with `-`, so git can't take them for its options; and its commit is a commit. It runs git with
  no hooks, no fsmonitor and no `ext::`, so a package's `.git` can't make it run a command. A `packages/`
  folder you got some other way, in a zip say, is trusted as it is, as git reads its `.git/config`: delete it
  and let `folio get` fetch it. (Before the release after 1.11.0, a `folio.packages` could do both: see
  [DESIGN.md](DESIGN.md) §152.)

### Advisories and folio audit

The package index can list advisories: known problems in packages, each saying which commits it's about.
`folio audit` checks every package in `folio.packages` against them, and ends with 1 if any is about the
commit a package is at, so it can run in CI:

```text
$ folio audit
greeter at 3f2a9c1: FOLIO-2026-1 (high): greet() runs any text it's given as a command
  fixed at 8b1d2e0: folio update greeter takes its newest
  https://github.com/someone/greeter/security/advisories/1
1 advisory is about these packages
```

An advisory is added to the index by a pull request to
[folio-packages](https://github.com/samyyy2423/folio-packages), in its `advisories` list:

```json
{
  "id": "FOLIO-2026-1",
  "package": "greeter",
  "introduced": "<the first commit with the problem, or \"0\" for all of them>",
  "fixed": "<the commit that fixed it>",
  "severity": "high",
  "about": "greet() runs any text it's given as a command",
  "link": "https://..."
}
```

`commits`, a list of commits, can name them one by one instead, and an advisory with neither is about every
commit, for a package that should never be used. [SPEC.md](SPEC.md), section 10.4, has the details.
