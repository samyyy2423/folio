#!/bin/sh
# Makes a release's folio-linux, folio-windows.exe and SHA256SUMS.txt from this checkout, as DESIGN.md says a
# release is made, and checks the fixed point on the way: Node.js makes the first folio from the source, that
# folio builds itself into the same bytes, and it builds the Windows folio into the bytes Node.js makes of it.
# (That the Windows folio builds itself and the Linux one byte for byte is checked on Windows, by the release
# workflow.)
#
#     packaging/release-build.sh <folder>
#
# Given a release's files too, it checks they're the same bytes, so a release made by hand is one this source
# makes:
#
#     packaging/release-build.sh <folder> <folder with the release's files>
set -eu

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
    echo "usage: $0 <folder> [folder with a release's files to compare]" >&2
    exit 2
fi
mkdir -p "$1"
out=$(cd "$1" && pwd)
release=
if [ $# -eq 2 ]; then release=$(cd "$2" && pwd); fi
cd "$(dirname "$0")/.."
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
self="folio.folio --allow-read --allow-write --allow-run --include folio-debugger.folio --include package.json"

node bootstrap.mjs linux
mv folio "$work/folio-first"

# folio, built by the folio Node.js made, must be the same bytes
# shellcheck disable=SC2086 # $self is words
"$work/folio-first" build $self
cmp folio "$work/folio-first" || { echo "folio built itself into different bytes from the ones Node.js made" >&2; exit 1; }
mv folio "$out/folio-linux"

# shellcheck disable=SC2086
"$work/folio-first" build $self --target windows
mv folio.exe "$out/folio-windows.exe"
node bootstrap.mjs windows
cmp folio.exe "$out/folio-windows.exe" || { echo "folio built the Windows folio into different bytes from the ones Node.js made" >&2; exit 1; }
rm folio.exe

# as the releases have them: the Windows program's sum, then Linux's
(cd "$out" && sha256sum folio-windows.exe folio-linux > SHA256SUMS.txt)
cat "$out/SHA256SUMS.txt"

if [ -n "$release" ]; then
    (cd "$release" && sha256sum -c SHA256SUMS.txt) || { echo "the release's files don't match its SHA256SUMS.txt" >&2; exit 1; }
    for file in folio-linux folio-windows.exe; do
        if ! cmp "$out/$file" "$release/$file"; then
            echo "the release's $file isn't what this source builds: it must be made with folio build $self" >&2
            exit 1
        fi
    done
    echo "the release's folio-linux and folio-windows.exe are the bytes this source builds"
fi
