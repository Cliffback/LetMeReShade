#!/usr/bin/env python3
"""
Scrapes reshade.me for the latest ReShade version and updates package.json,
main.py, and reshade-install.sh with new version entries.

Keeps up to MAX_VERSIONS versions (newest first), pruning the oldest.
Exits 0 if changes were made, 1 if already up to date.
"""

import hashlib
import json
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

MAX_VERSIONS = 3
RESHADE_URL = "https://reshade.me"
RESHADE_DOWNLOAD_PATTERN = "https://reshade.me/downloads/ReShade_Setup_{version}.exe"
RESHADE_ADDON_PATTERN = "https://reshade.me/downloads/ReShade_Setup_{version}_Addon.exe"

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PACKAGE_JSON = REPO_ROOT / "package.json"
MAIN_PY = REPO_ROOT / "main.py"
INSTALL_SH = REPO_ROOT / "defaults" / "assets" / "reshade-install.sh"


def fetch_latest_version() -> str:
    """Scrape reshade.me homepage to find the latest version number."""
    req = urllib.request.Request(RESHADE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="replace")

    match = re.search(r"ReShade_Setup_(\d+\.\d+\.\d+)\.exe", html)
    if not match:
        print("ERROR: Could not find ReShade version on reshade.me")
        sys.exit(2)
    return match.group(1)


def get_existing_reshade_versions(pkg: dict) -> list[str]:
    """Extract version numbers from existing reshade remote_binary entries."""
    versions = set()
    for entry in pkg.get("remote_binary", []):
        name = entry.get("name", "")
        m = re.match(r"^reshade_(\d+\.\d+\.\d+)\.exe$", name, re.IGNORECASE)
        if m:
            versions.add(m.group(1))
    return sorted(versions, key=version_key, reverse=True)


def version_key(v: str) -> tuple[int, ...]:
    """Convert version string to tuple for sorting."""
    return tuple(int(x) for x in v.split("."))


def download_and_hash(url: str) -> str:
    """Download a file and return its sha256 hex digest."""
    print(f"  Downloading {url} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    sha = hashlib.sha256()
    with urllib.request.urlopen(req, timeout=120) as resp:
        with tempfile.NamedTemporaryFile() as tmp:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                sha.update(chunk)
                tmp.write(chunk)
    digest = sha.hexdigest()
    print(f"  SHA256: {digest}")
    return digest


def build_reshade_entries(version: str) -> list[dict]:
    """Create the two remote_binary entries for a given version."""
    std_url = RESHADE_DOWNLOAD_PATTERN.format(version=version)
    addon_url = RESHADE_ADDON_PATTERN.format(version=version)

    std_hash = download_and_hash(std_url)
    addon_hash = download_and_hash(addon_url)

    return [
        {
            "name": f"reshade_{version}.exe",
            "url": std_url,
            "sha256hash": std_hash,
        },
        {
            "name": f"reshade_{version}_addon.exe",
            "url": addon_url,
            "sha256hash": addon_hash,
        },
    ]


def update_package_json(pkg: dict, versions_to_keep: list[str]) -> dict:
    """
    Update remote_binary in package.json:
    - Keep only ReShade entries for versions_to_keep
    - Keep all non-ReShade entries
    - Order: ReShade entries (newest first), then non-ReShade entries
    """
    non_reshade = []
    reshade_by_version: dict[str, list[dict]] = {}

    for entry in pkg.get("remote_binary", []):
        name = entry.get("name", "")
        m = re.match(r"^reshade_(\d+\.\d+\.\d+)(?:_addon)?\.exe$", name, re.IGNORECASE)
        if m:
            v = m.group(1)
            reshade_by_version.setdefault(v, []).append(entry)
        else:
            non_reshade.append(entry)

    # Build new reshade entries list
    new_reshade = []
    for v in versions_to_keep:
        if v in reshade_by_version:
            # Keep existing entries (preserves hashes)
            new_reshade.extend(reshade_by_version[v])
        else:
            # New version, download and create entries
            new_reshade.extend(build_reshade_entries(v))

    pkg["remote_binary"] = new_reshade + non_reshade
    return pkg


def update_default_version_in_file(path: Path, patterns: list[tuple[str, str]], new_version: str):
    """Replace version defaults in a file using regex patterns."""
    content = path.read_text()
    original = content
    for pattern, replacement in patterns:
        content = re.sub(pattern, replacement.format(version=new_version), content)
    if content != original:
        path.write_text(content)
        print(f"  Updated {path.relative_to(REPO_ROOT)}")


def main():
    print("Fetching latest ReShade version from reshade.me ...")
    latest = fetch_latest_version()
    print(f"Latest version: {latest}")

    pkg = json.loads(PACKAGE_JSON.read_text())
    existing = get_existing_reshade_versions(pkg)
    print(f"Existing versions in package.json: {existing}")

    if existing and existing[0] == latest:
        print("Already up to date. No changes needed.")
        sys.exit(1)

    # Determine versions to keep: latest + existing, capped at MAX_VERSIONS
    all_versions = sorted(
        set([latest] + existing), key=version_key, reverse=True
    )
    versions_to_keep = all_versions[:MAX_VERSIONS]
    print(f"Versions to keep: {versions_to_keep}")

    pruned = set(existing) - set(versions_to_keep)
    if pruned:
        print(f"Pruning old versions: {sorted(pruned)}")

    # Update package.json
    print("Updating package.json ...")
    pkg = update_package_json(pkg, versions_to_keep)
    PACKAGE_JSON.write_text(json.dumps(pkg, indent=2) + "\n")
    print("  Updated package.json")

    # Update default version in main.py
    print("Updating default version references ...")
    update_default_version_in_file(
        MAIN_PY,
        [
            # 'RESHADE_VERSION': 'X.Y.Z'  or  'RESHADE_VERSION': 'latest'
            (
                r"('RESHADE_VERSION':\s*')[^']+(')",
                "'RESHADE_VERSION': '{version}'",
            ),
            # version: str = "X.Y.Z"  or  version: str = "latest"
            (
                r'(version:\s*str\s*=\s*")[^"]+(")',
                'version: str = "{version}"',
            ),
        ],
        latest,
    )

    # Update default version in reshade-install.sh
    update_default_version_in_file(
        INSTALL_SH,
        [
            # RESHADE_VERSION=${RESHADE_VERSION:-"X.Y.Z"}
            (
                r'(RESHADE_VERSION=\$\{RESHADE_VERSION:-")[^"]+("\})',
                'RESHADE_VERSION=${{RESHADE_VERSION:-"{version}"}}',
            ),
        ],
        latest,
    )

    print(f"\nDone. Updated to ReShade {latest}.")
    sys.exit(0)


if __name__ == "__main__":
    main()
