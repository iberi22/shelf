#!/run/current-system/sw/bin/bash
# Playwright wrapper for NixOS — uses system chromium with correct libraries
# Usage: ./playwright-nixos.sh test [args...]

set -euo pipefail

# Extract LD_LIBRARY_PATH from the system chromium wrapper
RUNPATH=$(readelf -d /nix/store/amd7xq874b4zny0mhbvvhm24799zfxdb-chromium-unwrapped-150.0.7871.181/libexec/chromium/chromium 2>/dev/null | grep "RUNPATH" | sed 's/.*\[//;s/\].*//')

# Use only compatible libraries (glibc-2.40)
# These are from the system chromium's own RUNPATH which works
COMPATIBLE_LIBS="/nix/store/y3z5sr16sxd50bgcn2zkn46afn8fy0na-glib-2.88.1/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/zcajrvygvxxl7jk34964ljc0lz5rwyd4-nspr-4.39/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/s0h8ra4wcl1nbxracs4hm4qc6czllx6y-nss-3.112.5/lib64"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/6yi3mn5dkpih069v2lfisvfwqvmarbxb-at-spi2-core-2.60.4/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/vmmqppngzwlvhbpfxirmzibai8zbxrd8-dbus-1.16.2-lib/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/45naqds5dkzsmmrh61wbxbfci73san7n-libx11-1.8.13/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/3by4hkcmnxv7sb15z9s0v0gzali66pvl-libxcomposite-0.4.7/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/sbms9ld5wxl0r6c5vqbwf58wsx9higql-libxdamage-1.1.7/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/f5b3j7k2lrm9fpb5h3phm4ahf1pi9h2s-libxext-1.3.7/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/rrflw83s4x5rq6ma494dh1xdgs0a6aqg-libxfixes-6.0.2/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/m5ikb8j00nc9591p8ls752fn89wbwaz8-libxrandr-1.5.5/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/kzym5fa5jsw2ykpxlmdy9sswh5g81kxj-mesa-libgbm-26.1.3/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/g264nm7psb4b9w31kqxqfnysv376hc9n-expat-2.8.2/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/2chpcgwndk5iphqgwf9r7x4yjysmkd2z-libxcb-1.17.0/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/bn21gzsggp8dvzfizi3nhhmz0s555ybq-libxkbcommon-1.13.2/lib"
COMPATIBLE_LIBS="$COMPATIBLE_LIBS:/nix/store/35b7pci9f1308g1n297y1kca9k8rl461-alsa-lib-1.2.13/lib"

export LD_LIBRARY_PATH="$COMPATIBLE_LIBS${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

cd ~/proyectosSWAL/shelf/apps/shelf-inventory
exec npx playwright "$@"
