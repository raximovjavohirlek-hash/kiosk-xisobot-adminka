const API_BASE_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'))
    ? 'http://127.0.0.1:5050'
    : 'https://kiosk-xisobot-adminka.onrender.com';

function getApiUrl(path) {
    if (!path) return API_BASE_URL;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const cleanBase = API_BASE_URL.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    return cleanBase + cleanPath;
}
