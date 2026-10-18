#!/usr/bin/env python3
"""Administrator-run TFHC route installation; never touches application data."""
import datetime
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

TARGET = Path('/etc/nginx/sites-available/staging.utilityhub.ng')
MARKER = '# TFHC production route (managed)'


def install():
    if os.geteuid() != 0:
        raise RuntimeError('Administrator access required')
    snippet = Path(__file__).with_name('nginx-tfhc.conf').read_text()
    original = TARGET.read_text()
    if MARKER in original:
        raise RuntimeError('Route already installed; review before modifying')
    if re.search(r'location\s+[^\n{]*\/tfhc', original):
        raise RuntimeError('Existing TFHC route requires manual review')
    # Fail closed unless the known host has one unambiguous TLS listener.
    listeners = list(re.finditer(r'^([ \t]*)listen\s+443\s+ssl\s*;', original, re.M))
    if len(listeners) != 1 or not re.search(r'server_name\s+staging\.utilityhub\.ng\s*;', original):
        raise RuntimeError('Unexpected host configuration')
    point = listeners[0].start()
    updated = original[:point] + MARKER + '\n' + snippet + '\n' + original[point:]
    subprocess.run(['/usr/sbin/nginx', '-t'], check=True)
    backup = TARGET.with_name(TARGET.name + '.tfhc-backup-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    shutil.copy2(TARGET, backup)
    descriptor, temporary = tempfile.mkstemp(prefix='.tfhc-', dir=TARGET.parent)
    try:
        with os.fdopen(descriptor, 'w') as stream:
            stream.write(updated)
            stream.flush()
            os.fsync(stream.fileno())
        shutil.copymode(TARGET, temporary)
        os.replace(temporary, TARGET)
        try:
            subprocess.run(['/usr/sbin/nginx', '-t'], check=True)
            subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        except BaseException:
            shutil.copy2(backup, TARGET)
            subprocess.run(['/usr/sbin/nginx', '-t'], check=True)
            subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
            raise
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('TFHC route installed; existing routes retained. Backup:', backup)


if __name__ == '__main__':
    install()
