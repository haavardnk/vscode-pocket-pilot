const HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com']);
const DOMAINS = ['.push.apple.com', '.notify.windows.com'];

export function allowedEndpoint(endpoint: string): boolean {
  const url = URL.parse(endpoint);
  if (!url || url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  return HOSTS.has(url.hostname) || DOMAINS.some((domain) => url.hostname.endsWith(domain));
}
