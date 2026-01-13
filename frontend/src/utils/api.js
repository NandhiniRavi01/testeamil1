export function getApiBaseUrl() {
  try {
    let raw = (process.env.REACT_APP_API_URL || '').trim();
    if (!raw) return 'https://emailagent.cubegtp.com/api';

    // Ensure no trailing slash
    const trimSlash = (s) => s.replace(/\/+$/, '');

    // Already absolute
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return trimSlash(raw);
    }

    // Starts with ":port"
    if (raw.startsWith(':')) {
      const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || 'localhost';
      return `https://${host}${trimSlash(raw)}`;
    }

    // Just a port number like "5000"
    if (/^\d+$/.test(raw)) {
      const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || 'localhost';
      return `https://${host}:${raw}`;
    }

    // Host:port like "localhost:5000" or "127.0.0.1:5000"
    if (/^[^/]+:\d+$/.test(raw)) {
      return `http://${trimSlash(raw)}`;
    }

    // Path starting with slash: use current origin
    if (raw.startsWith('/')) {
      if (typeof window !== 'undefined' && window.location) {
        return trimSlash(`${window.location.origin}${raw}`);
      }
      return `https://emailagent.cubegtp.com${trimSlash(raw)}`;
    }

    // Fallback: return as-is
    return trimSlash(raw);
  } catch (e) {
    return 'https://emailagent.cubegtp.com';
  }
}




