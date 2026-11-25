#!/bin/bash
# Run as root with verified official Debian rootfs and Node archives. No host package upgrades.
set -euo pipefail
if test "$#" -ne 3; then echo 'Usage: prepare-converter-runtime.sh DEBIAN_ROOTFS.tar.gz NODE.tar.xz SHA256SUMS' >&2; exit 2; fi
runtime=/opt/seal-office-converter/runtime
test "$(readlink -m "$runtime")" = /opt/seal-office-converter/runtime
test ! -e "$runtime"
rootfs=$(readlink -f "$1")
node=$(readlink -f "$2")
checks=$(readlink -f "$3")
cd "$(dirname "$checks")"
test "$(dirname "$rootfs")" = "$PWD"
test "$(dirname "$node")" = "$PWD"
sha256sum -c "$checks"
test "$(basename "$rootfs")" != "$(basename "$node")"
awk -v name="$(basename "$rootfs")" '$2==name || $2=="*"name {found=1} END {exit !found}' "$checks"
awk -v name="$(basename "$node")" '$2==name || $2=="*"name {found=1} END {exit !found}' "$checks"
install -d -m 755 "$runtime"
tar -xzf "$rootfs" -C "$runtime"
install -d -m 755 "$runtime/usr/local/node" "$runtime/proc" "$runtime/dev"
install -d -m 1777 "$runtime/tmp"
tar -xJf "$node" --strip-components=1 -C "$runtime/usr/local/node"
for entry in null:3 zero:5 random:8 urandom:9; do
  name=${entry%:*}; minor=${entry#*:}
  test -e "$runtime/dev/$name" || mknod -m 666 "$runtime/dev/$name" c 1 "$minor"
done
cp /etc/resolv.conf "$runtime/etc/resolv.conf"
# CentOS rootfs hosts can supply trust roots before apt installs ca-certificates.
if test -f /etc/pki/tls/certs/ca-bundle.crt; then
  install -d -m 755 "$runtime/etc/ssl/certs"
  cp /etc/pki/tls/certs/ca-bundle.crt "$runtime/etc/ssl/certs/ca-certificates.crt"
fi
printf '#!/bin/sh\nexit 101\n' > "$runtime/usr/sbin/policy-rc.d"
chmod 755 "$runtime/usr/sbin/policy-rc.d"
mount -t proc proc "$runtime/proc"
trap 'umount /opt/seal-office-converter/runtime/proc' EXIT
chroot "$runtime" /usr/bin/env DEBIAN_FRONTEND=noninteractive /usr/bin/apt-get -o Acquire::Retries=3 update
chroot "$runtime" /usr/bin/env DEBIAN_FRONTEND=noninteractive /usr/bin/apt-get -o Acquire::Retries=3 install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress fonts-noto-cjk fonts-liberation ca-certificates
chroot "$runtime" /usr/local/node/bin/node --version
chroot "$runtime" /usr/bin/soffice --version
chroot "$runtime" /usr/bin/apt-get clean
umount "$runtime/proc"
trap - EXIT
