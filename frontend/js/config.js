const API_BASE_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'))
    ? 'http://127.0.0.1:5050'
    : 'https://kiosk-hisobot-adminka.onrender.com';
