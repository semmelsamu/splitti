#!/bin/sh
# Runs the app as the owner of the mounted data folder, so the database and the
# receipt images on the host belong to the user who cloned the repo, not to root.
set -e

if [ "$(id -u)" = "0" ]; then
    mkdir -p "$DATA_DIR"
    owner_uid="$(stat -c %u "$DATA_DIR")"
    owner_gid="$(stat -c %g "$DATA_DIR")"
    if [ "$owner_uid" != "0" ]; then
        exec setpriv --reuid="$owner_uid" --regid="$owner_gid" --clear-groups "$@"
    fi
fi

exec "$@"
