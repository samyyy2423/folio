# folio in a container: the release's folio-linux, byte for byte, as /usr/bin/folio. Built from a folder that
# holds folio-linux:
#
#     docker build -f packaging/docker/Dockerfile -t folio <folder with folio-linux>
#     docker run --rm -v "$PWD:/work" --user "$(id -u):$(id -g)" folio run hello.folio
#
# folio is one static program, so it needs no system at all; the base is distroless's, which adds only glibc,
# OpenSSL 3, CA certificates and time zones, for the programs folio builds that load a C library (a secure
# connection loads OpenSSL). There's no shell, package manager, git or curl: folio add and folio search need
# git and curl, so fetch packages outside, or COPY --from this image into one that has them. The base is
# pinned by its digest, for the same image from the same folio-linux; DESIGN.md says how it's updated.
FROM gcr.io/distroless/base-debian13:nonroot@sha256:9039a88709bcc2bacf5a2faac331d65dd6840f763f225ad9594cc0c67bcd0fba

ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Folio" \
      org.opencontainers.image.description="A programming language that reads like plain English" \
      org.opencontainers.image.url="https://github.com/samyyy2423/folio" \
      org.opencontainers.image.source="https://github.com/samyyy2423/folio" \
      org.opencontainers.image.documentation="https://github.com/samyyy2423/folio#readme" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

COPY --chmod=0755 folio-linux /usr/bin/folio
WORKDIR /work
ENTRYPOINT ["/usr/bin/folio"]
