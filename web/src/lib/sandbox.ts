// Modo sandbox no site público: /?sandbox=1 liga (fica na sessão), /?sandbox=0 desliga.
const KEY = 'arq.sandbox';

function readSandbox(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('sandbox');
    if (q === '1') sessionStorage.setItem(KEY, '1');
    if (q === '0') sessionStorage.removeItem(KEY);
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const SANDBOX = readSandbox();

export function exitSandbox() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.location.href = '/';
}
