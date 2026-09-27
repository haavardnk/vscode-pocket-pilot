export interface CloudflaredRelease {
  version: string;
  url: string;
  sha256: string;
  archive: boolean;
}

const VERSION = '2026.9.3';

const ASSETS: Readonly<Record<string, { file: string; sha256: string }>> = {
  'darwin-arm64': {
    file: 'cloudflared-darwin-arm64.tgz',
    sha256: '587c2cfb1c230fe36c7fa7727da78be459dae028cabe8c001291999350f07095'
  },
  'darwin-x64': {
    file: 'cloudflared-darwin-amd64.tgz',
    sha256: 'd1155d0837487f261183b15c1eab6c4ebcad9dc49b94675f1524c3564cea3977'
  },
  'linux-arm64': {
    file: 'cloudflared-linux-arm64',
    sha256: 'aaeb2d7d0da3614634c7e03ab13487a1522c2e79165ed2929cfe23d5e95b326d'
  },
  'linux-x64': {
    file: 'cloudflared-linux-amd64',
    sha256: '77e26d8d900e0b8469f416239d14b5f296525fdf79fee6f511ef55609e3fbac2'
  },
  'win32-x64': {
    file: 'cloudflared-windows-amd64.exe',
    sha256: 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2'
  }
};

export function cloudflaredRelease(platform: string, arch: string): CloudflaredRelease | null {
  const asset = ASSETS[`${platform}-${arch}`];
  if (!asset) return null;
  return {
    version: VERSION,
    url: `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/${asset.file}`,
    sha256: asset.sha256,
    archive: asset.file.endsWith('.tgz')
  };
}
