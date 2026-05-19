import packageJson from '../package.json';

export interface VersionOption {
  label: string;
  value: string;
}

/**
 * Extracts versions from package.json.remote_binary entries.
 * Ignores addon installers and non-ReShade binaries.
 */
export function getVersionOptions(): VersionOption[] {
  const entries = (packageJson as any)?.remote_binary ?? [];
  const versionSet = new Set<string>();

  for (const entry of entries) {
    const name: string = entry?.name ?? '';
    // Match 'reshade_X.Y.Z.exe' but NOT 'reshade_X.Y.Z_addon.exe'
    const match = name.match(/^reshade_(\d+\.\d+\.\d+)\.exe$/i);
    if (match) {
      versionSet.add(match[1]);
    }
  }

  // Sort descending by version number
  const versions = Array.from(versionSet).sort((a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const da = pa[i] ?? 0;
      const db = pb[i] ?? 0;
      if (da !== db) return db - da;
    }
    return 0;
  });

  return versions.map((v) => ({
    label: `ReShade ${v}`,
    value: v,
  }));
}
