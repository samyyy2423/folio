#!/bin/sh
# Installs folio on Linux (x86-64) from a release on GitHub: it downloads folio-linux and the release's
# SHA256SUMS.txt, checks the one against the other, and puts folio on your PATH. It needs no root.
#
#     curl -fsSL https://raw.githubusercontent.com/samyyy2423/folio/main/packaging/install.sh | sh
#     curl -fsSL https://raw.githubusercontent.com/samyyy2423/folio/main/packaging/install.sh | sh -s -- --version 1.11.0
#
#   --version 1.11.0     that release (else the latest); or FOLIO_VERSION
#   --dir <folder>       put folio there (else ~/.local/bin, or /usr/local/bin as root); or FOLIO_INSTALL_DIR
#   --no-modify-path     leave the shell's startup files alone; or FOLIO_NO_MODIFY_PATH=1
#
# FOLIO_RELEASES_URL says where the releases are, for a mirror or a test; else GitHub's. To check who made the
# download, not only that it arrived whole, see docs/verifying-releases.md.
set -eu

say() { printf '%s\n' "$*"; }
fail() { printf 'folio install: %s\n' "$*" >&2; exit 1; }

# a file from the web (or file://, for a test) into a file
fetch() {
    case $1 in
        https://*) proto="=https" ;;
        *) proto="all" ;;
    esac
    if command -v curl > /dev/null 2>&1; then
        curl -fsSL --proto "$proto" --proto-redir "$proto" --retry 3 -o "$2" "$1"
    elif command -v wget > /dev/null 2>&1; then
        wget -q -O "$2" "$1"
    else
        fail "this needs curl or wget to download folio"
    fi
}

# a file's SHA-256, in lowercase hex
sha256() {
    if command -v sha256sum > /dev/null 2>&1; then
        sha256sum "$1" | cut -d ' ' -f 1
    elif command -v shasum > /dev/null 2>&1; then
        shasum -a 256 "$1" | cut -d ' ' -f 1
    elif command -v openssl > /dev/null 2>&1; then
        openssl dgst -sha256 -r "$1" | cut -d ' ' -f 1
    else
        fail "this needs sha256sum, shasum or openssl to check the download"
    fi
}

# adds the folder to PATH in a startup file, once; says whether it did
add_to_path() {
    file=$1
    line=$2
    if [ -f "$file" ] && grep -qxF "$line" "$file"; then
        return 1
    fi
    printf '\n# folio, put on PATH by its installer\n%s\n' "$line" >> "$file"
    say "added folio's folder to PATH in $file"
}

main() {
    version=${FOLIO_VERSION:-}
    dir=${FOLIO_INSTALL_DIR:-}
    modify_path=yes
    if [ "${FOLIO_NO_MODIFY_PATH:-}" = 1 ]; then modify_path=no; fi
    releases=${FOLIO_RELEASES_URL:-https://github.com/samyyy2423/folio/releases}

    while [ $# -gt 0 ]; do
        case $1 in
            --version) [ $# -ge 2 ] || fail "--version needs a version, like --version 1.11.0"; version=$2; shift 2 ;;
            --version=*) version=${1#--version=}; shift ;;
            --dir) [ $# -ge 2 ] || fail "--dir needs a folder"; dir=$2; shift 2 ;;
            --dir=*) dir=${1#--dir=}; shift ;;
            --no-modify-path) modify_path=no; shift ;;
            -h | --help) say "usage: install.sh [--version 1.11.0] [--dir <folder>] [--no-modify-path]"; return 0 ;;
            *) fail "I don't know '$1': the options are --version, --dir and --no-modify-path" ;;
        esac
    done

    case $(uname -s) in
        Linux) ;;
        *) fail "this installs folio on Linux; on Windows use install.ps1 (docs/installers.md), and elsewhere build folio from the source with node bootstrap.mjs" ;;
    esac
    case $(uname -m) in
        x86_64 | amd64) ;;
        *) fail "folio's Linux releases are for x86-64, and this is $(uname -m); build folio from the source with node bootstrap.mjs" ;;
    esac

    version=${version#v}
    if [ -n "$version" ]; then
        case $version in
            *[!0-9A-Za-z.-]* | .* | -*) fail "'$version' isn't a version like 1.11.0" ;;
        esac
        from="$releases/download/v$version"
        which="folio $version"
    else
        from="$releases/latest/download"
        which="the latest folio"
    fi

    home=${HOME:-}
    if [ -z "$dir" ]; then
        if [ "$(id -u)" = 0 ]; then
            dir=/usr/local/bin
        elif [ -n "$home" ]; then
            dir="$home/.local/bin"
        else
            fail "HOME is not set, so say where to put folio with --dir"
        fi
    fi
    case $dir in
        /*) ;;
        *) dir="$PWD/$dir" ;;
    esac

    work=$(mktemp -d)
    trap 'rm -rf "$work"' EXIT
    trap 'exit 1' INT TERM
    say "downloading $which from $from"
    fetch "$from/folio-linux" "$work/folio-linux" || fail "couldn't download $from/folio-linux"
    fetch "$from/SHA256SUMS.txt" "$work/SHA256SUMS.txt" || fail "couldn't download $from/SHA256SUMS.txt"

    expected=$(awk '$2 == "folio-linux" || $2 == "*folio-linux" { print tolower($1) }' "$work/SHA256SUMS.txt" | head -n 1)
    case $expected in
        [0-9a-f]*) [ ${#expected} -eq 64 ] || fail "SHA256SUMS.txt's sum for folio-linux isn't a SHA-256" ;;
        *) fail "SHA256SUMS.txt has no sum for folio-linux" ;;
    esac
    actual=$(sha256 "$work/folio-linux")
    if [ "$actual" != "$expected" ]; then
        fail "folio-linux's SHA-256 is $actual, but SHA256SUMS.txt says $expected: the download isn't the release's, so nothing was installed"
    fi
    say "checked: its SHA-256 is $actual, as SHA256SUMS.txt says"

    mkdir -p "$dir" || fail "couldn't make $dir"
    # in beside the old one, then renamed over it, so a folio that's running carries on
    cp "$work/folio-linux" "$dir/.folio-new.$$" || fail "couldn't write to $dir: choose another folder with --dir"
    chmod 0755 "$dir/.folio-new.$$"
    mv -f "$dir/.folio-new.$$" "$dir/folio"
    say "installed $which as $dir/folio"

    case ":${PATH:-}:" in
        *":$dir:"*) say "run: folio run hello.folio"; return 0 ;;
    esac
    if [ "$modify_path" = no ] || [ -z "$home" ]; then
        say "$dir isn't on your PATH: add it, or run $dir/folio"
        return 0
    fi
    shown=$dir
    case $dir in
        "$home"/*) shown="\$HOME/${dir#"$home"/}" ;;
    esac
    line="export PATH=\"$shown:\$PATH\""
    shell=$(basename "${SHELL:-sh}")
    add_to_path "$home/.profile" "$line" || true
    if [ -f "$home/.bashrc" ] || [ "$shell" = bash ]; then add_to_path "$home/.bashrc" "$line" || true; fi
    if [ -f "$home/.zshrc" ] || [ "$shell" = zsh ]; then add_to_path "$home/.zshrc" "$line" || true; fi
    if [ -d "$home/.config/fish" ] || [ "$shell" = fish ]; then
        mkdir -p "$home/.config/fish/conf.d"
        add_to_path "$home/.config/fish/conf.d/folio.fish" "fish_add_path -g '$dir'" || true
    fi
    say "open a new terminal for PATH to have it, or run: $line"
}

main "$@"
