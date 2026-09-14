function intVal(val) {
    if (val === null || val === undefined) return 0;
    const n = parseInt(val, 10);
    return isNaN(n) ? 0 : n;
}

function formatMln(num) {
    if (!num || isNaN(num)) return '0 mln';
    const absNum = Math.abs(num);
    if (absNum >= 1_000_000_000) {
        return `${(num / 1_000_000_000).toFixed(2)} mlrd`;
    } else if (absNum >= 1_000_000) {
        return `${(num / 1_000_000).toFixed(1)} mln`;
    } else {
        return `${(num / 1_000).toFixed(1)} ming`;
    }
}

function getShortCurrencyLabel(num) {
    if (!num || isNaN(num) || num === 0) return '';
    return `(${formatMln(num)})`;
}

function formatCurrency(num, plain = false) {
    if (num === undefined || num === null || isNaN(num)) return "0 so'm";
    const formatted = Math.round(num).toLocaleString('uz-UZ') + " so'm";
    if (plain) return formatted;
    const shortLabel = getShortCurrencyLabel(num);
    return shortLabel ? `${formatted} ${shortLabel}` : formatted;
}

function isCurrentUserAdmin() {
    const authUserStr = localStorage.getItem('auth_user');
    if (authUserStr) {
        try {
            const u = JSON.parse(authUserStr);
            if (u && u.role === 'admin') return true;
        } catch (e) {}
    }
    if (sessionStorage.getItem('kiosk-admin-auth') === 'true') {
        return true;
    }
    return false;
}

function getAdminAuthToken() {
    return sessionStorage.getItem('kiosk-admin-token') || localStorage.getItem('auth_token') || '';
}

function authHeaders(extra = {}) {
    const token = getAdminAuthToken();
    return token ? { ...extra, 'Authorization': `Bearer ${token}` } : extra;
}

async function downloadWithAuth(url, fallbackFilename) {
    const resp = await fetch(url, { headers: authHeaders() });
    if (!resp.ok) {
        let message = "Faylni yuklab bo'lmadi.";
        try {
            const errData = await resp.json();
            if (errData && errData.error) message = errData.error;
        } catch (e) {}
        throw new Error(message);
    }
    const disposition = resp.headers.get('Content-Disposition') || '';
    let filename = fallbackFilename;
    if (disposition) {
        const rfcMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (rfcMatch) {
            try {
                filename = decodeURIComponent(rfcMatch[1]);
            } catch (e) {
                filename = fallbackFilename;
            }
        } else {
            const stdMatch = disposition.match(/filename="?([^";]+)"?/i);
            if (stdMatch) {
                filename = stdMatch[1];
            }
        }
    }
    const blob = await resp.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
}

document.addEventListener('DOMContentLoaded', () => {
    let trendChartInstance = null;
    let comparisonChartInstance = null;
    let directorHorizontalChartInstance = null;
    let directorShareChartInstance = null;

    let fullBackendStats = null;
    let currentStats = null; // Active period stats
    let currentMappings = {};
    let currentSortMode = 'summa'; // 'summa' | 'soni' | 'name'
    let currentSelectedPeriod = 'latest';

    // Executive Toast Notification System
    function showToast(type = 'info', title = '', message = '') {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast-card ${type}`;

        let iconClass = 'fa-solid fa-circle-info';
        if (type === 'success') iconClass = 'fa-solid fa-circle-check';
        else if (type === 'error') iconClass = 'fa-solid fa-circle-exclamation';
        else if (type === 'warning') iconClass = 'fa-solid fa-triangle-exclamation';

        toast.innerHTML = `
            <div class="toast-icon"><i class="${iconClass}"></i></div>
            <div class="toast-content">
                <div class="toast-title">${title || (type === 'success' ? 'Muvaffaqiyatli' : 'Xabarnoma')}</div>
                <div class="toast-desc">${message}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
            <div class="toast-progress"></div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 4000);
    }

    // DOM Elements
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const uploadSpinner = document.getElementById('uploadSpinner');
    const dropzoneContent = dropzone ? dropzone.querySelector('.dropzone-content') : null;
    const refreshBtn = document.getElementById('refreshBtn');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = document.getElementById('themeIcon');
    const themeText = document.getElementById('themeText');
    const periodSelect = document.getElementById('periodSelect');
    const tvModeBtn = document.getElementById('tvModeBtn');
    const shareUrlBtn = document.getElementById('shareUrlBtn');
    const shareModal = document.getElementById('shareModal');
    const closeShareModalBtn = document.getElementById('closeShareModalBtn');
    const okShareModalBtn = document.getElementById('okShareModalBtn');

    // Rahbariyat Dashboard Real KPI Elements
    const dirKpiNetRevenue = document.getElementById('dirKpiNetRevenue');
    const dirKpiTotalTickets = document.getElementById('dirKpiTotalTickets');
    const dirKpiTopStationName = document.getElementById('dirKpiTopStationName');
    const dirKpiTopStationShare = document.getElementById('dirKpiTopStationShare');
    const dirKpiTopStationSum = document.getElementById('dirKpiTopStationSum');
    const dirKpiPaymentRatio = document.getElementById('dirKpiPaymentRatio');
    const dirKpiPaymentOnline = document.getElementById('dirKpiPaymentOnline');
    const dirKpiPaymentTerminal = document.getElementById('dirKpiPaymentTerminal');
    const directorAiText = document.getElementById('directorAiText');
    const directorMatrixTableBody = document.getElementById('directorMatrixTableBody');

    // Tables & Controls
    const stationCardsGrid = document.getElementById('stationCardsGrid');
    const dailyTableBody = document.getElementById('dailyTableBody');

    // Admin Center Elements
    const mappingEditorGrid = document.getElementById('mappingEditorGrid');
    const saveMappingsTabBtn = document.getElementById('saveMappingsTabBtn');
    const uploadLogsTableBody = document.getElementById('uploadLogsTableBody');

    const sortSegmentButtons = document.querySelectorAll('.sort-btn');

    // Comparison Elements
    const compBaseMonth = document.getElementById('compBaseMonth');
    const compTargetMonth = document.getElementById('compTargetMonth');
    const momRevGrowth = document.getElementById('momRevGrowth');
    const momRevBadge = document.getElementById('momRevBadge');
    const momRevSub = document.getElementById('momRevSub');
    const momTicketGrowth = document.getElementById('momTicketGrowth');
    const momTicketBadge = document.getElementById('momTicketBadge');
    const momTicketSub = document.getElementById('momTicketSub');
    const momTopStation = document.getElementById('momTopStation');
    const momTopStationSub = document.getElementById('momTopStationSub');
    const momAvgPriceGrowth = document.getElementById('momAvgPriceGrowth');
    const momAvgPriceSub = document.getElementById('momAvgPriceSub');
    const executiveSummaryText = document.getElementById('executiveSummaryText');
    const comparisonTableBody = document.getElementById('comparisonTableBody');

    // Station Analytics Modal Elements
    const stationDetailModal = document.getElementById('stationDetailModal');
    const closeStationModalBtn = document.getElementById('closeStationModalBtn');
    const closeStationModalFooterBtn = document.getElementById('closeStationModalFooterBtn');
    const modalStationTitle = document.getElementById('modalStationTitle');
    const modalStationRankBadge = document.getElementById('modalStationRankBadge');
    const modalStationSubtitle = document.getElementById('modalStationSubtitle');
    const modalStSumma = document.getElementById('modalStSumma');
    const modalStShare = document.getElementById('modalStShare');
    const modalStTickets = document.getElementById('modalStTickets');
    const modalStPaymentRatio = document.getElementById('modalStPaymentRatio');
    const modalStPaymentSub = document.getElementById('modalStPaymentSub');
    const modalStPeakDate = document.getElementById('modalStPeakDate');
    const modalStPeakSum = document.getElementById('modalStPeakSum');
    const modalStTotalDaysCount = document.getElementById('modalStTotalDaysCount');
    const modalStationDailyBody = document.getElementById('modalStationDailyBody');

    const modalStationMonthSelect = document.getElementById('modalStationMonthSelect');
    const exportStationExcelBtn = document.getElementById('exportStationExcelBtn');
    let currentActiveModalStation = '';
    let currentSelectedModalMonth = '2026-08';
    let monthlyReportsData = {};

    function closeStationModal() {
        if (stationDetailModal) stationDetailModal.style.display = 'none';
    }

    if (closeStationModalBtn) closeStationModalBtn.addEventListener('click', closeStationModal);
    if (closeStationModalFooterBtn) closeStationModalFooterBtn.addEventListener('click', closeStationModal);
    
    if (modalStationMonthSelect) {
        modalStationMonthSelect.addEventListener('change', (e) => {
            currentSelectedModalMonth = e.target.value;
            renderStationModalForMonth(currentActiveModalStation, currentSelectedModalMonth);
        });
    }

    if (exportStationExcelBtn) {
        exportStationExcelBtn.addEventListener('click', async () => {
            if (!currentActiveModalStation) return;
            showToast('info', 'Excel Yuklanmoqda...', `${currentActiveModalStation} kassa (${currentSelectedModalMonth}) hisoboti yuklanmoqda`);
            try {
                const url = getApiUrl(`/api/export-station-excel/${encodeURIComponent(currentActiveModalStation)}?month=${currentSelectedModalMonth}`);
                await downloadWithAuth(url, `${currentActiveModalStation}.xlsx`);
            } catch (err) {
                showToast('error', 'Xatolik', err.message || "Faylni yuklab bo'lmadi.");
            }
        });
    }
    if (stationDetailModal) {
        stationDetailModal.addEventListener('click', (e) => {
            if (e.target === stationDetailModal) closeStationModal();
        });
    }

    function populateModalMonthSelect(activeCode = 'ytd') {
        if (!modalStationMonthSelect) return;
        modalStationMonthSelect.innerHTML = '';
        
        const monthNamesMap = {
            "ytd": "Shu Yil Boshidan (YTD)",
            "all": "Barcha Oylar Birgalikda",
            "2026-08": "Avgust 2026",
            "2026-07": "Iyul 2026",
            "2026-06": "Iyun 2026",
            "2026-05": "May 2026",
            "2026-04": "Aprel 2026",
            "2026-03": "Mart 2026",
            "2026-02": "Fevral 2026",
            "2026-01": "Yanvar 2026"
        };

        const keys = ["ytd", "all"];
        const monthlyKeys = Object.keys(monthlyReportsData).length > 0 ? Object.keys(monthlyReportsData).sort().reverse() : ["2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01"];
        keys.push(...monthlyKeys);

        keys.forEach(ym => {
            const opt = document.createElement('option');
            opt.value = ym;
            opt.textContent = monthNamesMap[ym] || ym;
            if (ym === activeCode) opt.selected = true;
            modalStationMonthSelect.appendChild(opt);
        });
    }

    function openStationDetailsModal(stansiyaName) {
        currentActiveModalStation = stansiyaName;
        currentSelectedModalMonth = currentSelectedPeriod || 'ytd';
        populateModalMonthSelect(currentSelectedModalMonth);
        renderStationModalForMonth(stansiyaName, currentSelectedModalMonth);
        if (stationDetailModal) stationDetailModal.style.display = 'flex';
    }

    function renderStationModalForMonth(stansiyaName, monthCode) {
        let statsObj = currentStats || fullBackendStats;
        if (monthCode === 'ytd' && fullBackendStats && fullBackendStats.ytd_data) {
            statsObj = fullBackendStats.ytd_data;
        } else if (monthCode === 'all' && fullBackendStats && fullBackendStats.overall_data) {
            statsObj = fullBackendStats.overall_data;
        } else if (monthlyReportsData && monthlyReportsData[monthCode]) {
            statsObj = monthlyReportsData[monthCode];
        }
        if (!statsObj || !statsObj.stations) return;

        const stations = statsObj.stations;
        const stationIdx = stations.findIndex(s => s.stansiya === stansiyaName);
        if (stationIdx === -1) {
            if (modalStationDailyBody) {
                modalStationDailyBody.innerHTML = '<tr><td colspan="5" class="empty-row">Ushbu oyda ushbu kassa bo\'yicha ma\'lumot topilmadi</td></tr>';
            }
            return;
        }

        const st = stations[stationIdx];
        const rank = stationIdx + 1;
        const dailyList = st.daily_breakdown || [];

        // Header
        if (modalStationTitle) modalStationTitle.textContent = st.stansiya;
        if (modalStationRankBadge) {
            let rankClass = 'rank-default';
            if (rank === 1) rankClass = 'rank-1';
            else if (rank === 2) rankClass = 'rank-2';
            else if (rank === 3) rankClass = 'rank-3';
            modalStationRankBadge.className = `rank-badge ${rankClass}`;
            modalStationRankBadge.textContent = `${rank}-O'rin`;
        }
        if (modalStationSubtitle) modalStationSubtitle.textContent = `Barcha ${stations.length} kassa ichida ${rank}-o'rinni egallab turibdi`;

        // Mini KPIs
        const avgCheck = st.soni_val > 0 ? Math.round(st.summa_val / st.soni_val) : 0;
        if (modalStSumma) modalStSumma.textContent = formatCurrency(st.summa_val);
        if (modalStShare) modalStShare.textContent = `${st.share_percent}% umumiy ulush`;
        if (modalStTickets) modalStTickets.textContent = `${st.soni_val.toLocaleString('uz-UZ')} ta`;
        
        const summary = statsObj.director_summary || fullBackendStats.director_summary || {};
        const onPct = summary.online_percent || 33.9;
        const termPct = summary.terminal_percent || 66.1;
        if (modalStPaymentRatio) modalStPaymentRatio.textContent = `${onPct}% / ${termPct}%`;
        if (modalStPaymentSub) modalStPaymentSub.textContent = `Online: ${onPct}% | Terminal: ${termPct}%`;

        // Peak Sales Day for this Station
        let peakDay = { date: '-', tickets: 0, summa: 0 };
        if (dailyList.length > 0) {
            peakDay = dailyList.reduce((max, d) => (d.summa > max.summa ? d : max), dailyList[0]);
        }
        if (modalStPeakDate) modalStPeakDate.textContent = peakDay.summa > 0 ? peakDay.date : 'Yo\'q';
        if (modalStPeakSum) modalStPeakSum.textContent = peakDay.summa > 0 ? `${Math.round(peakDay.summa).toLocaleString('uz-UZ')} so'm (${peakDay.tickets} ta)` : 'Sotuv bo\'lmagan';
        if (modalStTotalDaysCount) modalStTotalDaysCount.textContent = `Jami ${dailyList.length} kunlik ko'rsatkichlar`;

        // Render Daily Sales Table Body
        if (modalStationDailyBody) {
            modalStationDailyBody.innerHTML = '';
            if (dailyList.length === 0) {
                modalStationDailyBody.innerHTML = '<tr><td colspan="5" class="empty-row">Kunlik ma\'lumot topilmadi</td></tr>';
            } else {
                dailyList.forEach(day => {
                    const tr = document.createElement('tr');
                    const dayAvgP = day.tickets > 0 ? Math.round(day.summa / day.tickets) : 0;
                    const isPeak = day.date === peakDay.date && day.summa > 0;

                    let statusBadge = `<span class="badge-subtle badge-cyan" style="padding: 3px 8px; font-size: 11px;">🟢 Faol</span>`;
                    if (day.summa === 0) {
                        statusBadge = `<span class="badge-subtle" style="padding: 3px 8px; font-size: 11px; opacity: 0.5;">⚪️ Yo'q</span>`;
                    } else if (isPeak) {
                        statusBadge = `<span class="badge-subtle badge-emerald" style="padding: 3px 8px; font-size: 11px; font-weight: 800;">🔥 Rekord</span>`;
                    }

                    tr.innerHTML = `
                        <td><strong>${day.date}</strong></td>
                        <td style="text-align: right;"><span class="number-cell-tickets" style="font-size: 12px; padding: 3px 8px;">${day.tickets.toLocaleString('uz-UZ')} ta</span></td>
                        <td style="text-align: right;"><span class="number-cell-summa" style="font-size: 12px; padding: 3px 8px;">${Math.round(day.summa).toLocaleString('uz-UZ')} so'm</span></td>
                        <td style="text-align: right;"><span class="number-cell-avg" style="font-size: 12px; padding: 3px 8px;">${Math.round(dayAvgP).toLocaleString('uz-UZ')} so'm</span></td>
                        <td style="text-align: center;">${statusBadge}</td>
                    `;
                    if (isPeak) {
                        tr.style.background = 'rgba(16, 185, 129, 0.08)';
                    }
                    modalStationDailyBody.appendChild(tr);
                });
            }
        }

        if (stationDetailModal) stationDetailModal.style.display = 'flex';
    }

    // Admin Auth State
    let isAdminLoggedIn = sessionStorage.getItem('kiosk-admin-auth') === 'true' && !!sessionStorage.getItem('kiosk-admin-token');
    const adminAuthBtn = document.getElementById('adminAuthBtn');
    const adminLoginModal = document.getElementById('adminLoginModal');
    const adminPasswordInput = document.getElementById('adminPasswordInput');
    const adminLoginError = document.getElementById('adminLoginError');
    const submitAdminLoginBtn = document.getElementById('submitAdminLoginBtn');
    const closeAdminModalBtn = document.getElementById('closeAdminModalBtn');
    const cancelAdminModalBtn = document.getElementById('cancelAdminModalBtn');

    // Theme Toggle Logic
    const savedTheme = localStorage.getItem('kiosk-theme') || 'dark';
    setTheme(savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
            const newTheme = isDark ? 'light' : 'dark';
            setTheme(newTheme);
        });
    }

    // Smooth TV Mode Auto-Scroll Engine
    let tvScrollTimer = null;
    let tvDirection = 1;
    let tvIsPausing = false;

    function startTvAutoScroll() {
        stopTvAutoScroll();
        tvDirection = 1;
        tvIsPausing = false;

        tvScrollTimer = setInterval(() => {
            if (tvIsPausing) return;

            const scrollPos = window.scrollY;
            const windowHeight = window.innerHeight;
            const fullHeight = document.documentElement.scrollHeight;

            if (tvDirection === 1) {
                if (scrollPos + windowHeight >= fullHeight - 15) {
                    tvIsPausing = true;
                    setTimeout(() => {
                        tvDirection = -1;
                        tvIsPausing = false;
                    }, 2500);
                } else {
                    window.scrollBy({ top: 1.5, behavior: 'instant' });
                }
            } else {
                if (scrollPos <= 15) {
                    tvIsPausing = true;
                    setTimeout(() => {
                        tvDirection = 1;
                        tvIsPausing = false;
                    }, 2500);
                } else {
                    window.scrollBy({ top: -1.5, behavior: 'instant' });
                }
            }
        }, 25);
    }

    function stopTvAutoScroll() {
        if (tvScrollTimer) {
            clearInterval(tvScrollTimer);
            tvScrollTimer = null;
        }
    }

    if (tvModeBtn) {
        tvModeBtn.addEventListener('click', () => {
            document.body.classList.toggle('tv-mode');
            const isTv = document.body.classList.contains('tv-mode');
            tvModeBtn.innerHTML = isTv ? '<i class="fa-solid fa-compress"></i> Oddiy Rejim' : '<i class="fa-solid fa-tv"></i> TV Rejim';
            if (isTv) {
                startTvAutoScroll();
                showToast('info', 'TV Rejim Yoqildi', "Ma'lumotlar yuqoridan pastga va pastdan yuqoriga sekin avto-skroll qilmoqda.");
            } else {
                stopTvAutoScroll();
                showToast('info', 'Oddiy Rejim', "Avto-skroll to'xtatildi.");
            }
        });
    }

    // Share Modal
    if (shareUrlBtn) {
        shareUrlBtn.addEventListener('click', () => {
            if (shareModal) shareModal.style.display = 'flex';
        });
    }
    if (closeShareModalBtn) closeShareModalBtn.addEventListener('click', () => { if (shareModal) shareModal.style.display = 'none'; });
    if (okShareModalBtn) okShareModalBtn.addEventListener('click', () => { if (shareModal) shareModal.style.display = 'none'; });

    function setTheme(theme) {
        if (theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            if (themeIcon) themeIcon.className = 'fa-solid fa-sun';
            if (themeText) themeText.textContent = 'Quyoshli';
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (themeIcon) themeIcon.className = 'fa-solid fa-moon';
            if (themeText) themeText.textContent = 'Tungi';
        }
        localStorage.setItem('kiosk-theme', theme);
        if (currentStats) {
            const sortedStations = getSortedStations();
            renderDirectorDashboard(currentStats, sortedStations);
            renderTrendChart(currentStats.daily_trend);
            renderComparisonView();
        }
    }

    function handleUnauthorizedAccess(msg) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        sessionStorage.removeItem('kiosk-admin-auth');
        sessionStorage.removeItem('kiosk-admin-token');

        const systemLoginGateModal = document.getElementById('systemLoginGateModal');
        const systemLoginError = document.getElementById('systemLoginError');
        const appContainer = document.getElementById('appContainer');

        if (appContainer) appContainer.style.display = 'none';
        if (systemLoginGateModal) systemLoginGateModal.style.display = 'flex';

        if (systemLoginError) {
            if (msg) {
                systemLoginError.textContent = msg;
                systemLoginError.style.display = 'block';
            } else {
                systemLoginError.style.display = 'none';
            }
        }
    }

    function checkAppAuthentication() {
        const token = localStorage.getItem('auth_token') || sessionStorage.getItem('kiosk-admin-token');
        const userStr = localStorage.getItem('auth_user');
        const systemLoginGateModal = document.getElementById('systemLoginGateModal');
        const systemLoginError = document.getElementById('systemLoginError');
        const appContainer = document.getElementById('appContainer');
        const logoutBtn = document.getElementById('logoutBtn');
        const adminTabBtn = document.querySelector('.tab-btn[data-tab="tab-admin"]');

        if (!token || !userStr) {
            if (appContainer) appContainer.style.display = 'none';
            if (systemLoginGateModal) systemLoginGateModal.style.display = 'flex';
            if (systemLoginError) systemLoginError.style.display = 'none';
            return false;
        }

        let user;
        try {
            user = JSON.parse(userStr);
        } catch (e) {
            handleUnauthorizedAccess("Avtorizatsiya ma'lumotlari yaroqsiz.");
            return false;
        }

        if (systemLoginGateModal) systemLoginGateModal.style.display = 'none';
        if (appContainer) appContainer.style.display = 'block';

        if (logoutBtn) logoutBtn.style.display = 'inline-flex';

        const userRoleBadge = document.getElementById('userRoleBadge');
        if (userRoleBadge) {
            userRoleBadge.innerHTML = `<i class="fa-solid fa-user-shield"></i> ${user.name || user.username} (${user.role === 'admin' ? 'Admin' : 'Foydalanuvchi'})`;
        }

        if (adminTabBtn) {
            adminTabBtn.style.display = (user.role === 'admin') ? 'inline-flex' : 'none';
        }
        const headerUploadBtn = document.getElementById('headerUploadBtn');
        if (headerUploadBtn) {
            headerUploadBtn.style.display = (user.role === 'admin') ? 'inline-flex' : 'none';
        }

        try {
            fetchStats();
            if (user.role === 'admin') {
                populateOverrideDropdowns();
                fetchUsers();
                fetchOverrides();
                fetchMappings();
            }
        } catch (err) {
            console.error('[Dashboard Init Error]:', err);
        }
        return true;
    }

    // System Mandatory Login Form Handler
    const systemLoginForm = document.getElementById('systemLoginForm');
    const systemUsernameInput = document.getElementById('systemUsernameInput');
    const systemPasswordInput = document.getElementById('systemPasswordInput');
    const systemLoginError = document.getElementById('systemLoginError');
    const systemLoginGateModal = document.getElementById('systemLoginGateModal');

    if (systemUsernameInput) {
        systemUsernameInput.addEventListener('input', () => {
            if (systemLoginError) systemLoginError.style.display = 'none';
        });
    }
    if (systemPasswordInput) {
        systemPasswordInput.addEventListener('input', () => {
            if (systemLoginError) systemLoginError.style.display = 'none';
        });
    }

    if (systemLoginForm) {
        systemLoginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (systemLoginError) systemLoginError.style.display = 'none';

            const username = systemUsernameInput ? systemUsernameInput.value.trim() : '';
            const password = systemPasswordInput ? systemPasswordInput.value.trim() : '';

            if (!username || !password) {
                if (systemLoginError) {
                    systemLoginError.textContent = "Login va parol kiritilishi shart!";
                    systemLoginError.style.display = 'block';
                }
                return;
            }

            const submitBtn = document.getElementById('systemLoginSubmitBtn');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tekshirilmoqda...';
            }

            fetch(getApiUrl('/api/auth/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
            .then(res => {
                if (!res.ok && res.status >= 500) {
                    throw new Error("Server vaqtincha javob bermayapti. Render bepul serveri uyg'onayotgan bo'lishi mumkin, 15-20 soniya kuting.");
                }
                return res.json();
            })
            .then(data => {
                if (data.success && data.token) {
                    localStorage.setItem('auth_token', data.token);
                    localStorage.setItem('auth_user', JSON.stringify(data.user));
                    sessionStorage.setItem('kiosk-admin-auth', 'true');
                    sessionStorage.setItem('kiosk-admin-token', data.token);

                    if (systemLoginGateModal) systemLoginGateModal.style.display = 'none';
                    if (systemLoginError) systemLoginError.style.display = 'none';
                    const appContainer = document.getElementById('appContainer');
                    if (appContainer) appContainer.style.display = 'block';

                    showToast('success', 'Xush Kelibsiz!', data.message || 'Tizimga kirdingiz');
                    checkAppAuthentication();
                } else {
                    if (systemLoginError) {
                        systemLoginError.textContent = data.error || "Login yoki parol noto'g'ri!";
                        systemLoginError.style.display = 'block';
                    }
                }
            })
            .catch(err => {
                if (systemLoginError) {
                    const msg = String(err && err.message ? err.message : err);
                    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
                        systemLoginError.textContent = "Server uyg'onmoqda (Render free tier). Iltimos, 15-20 soniya kutib qayta 'Kirish' tugmasini bosing.";
                    } else {
                        systemLoginError.textContent = "Ulanishda xatolik: " + msg;
                    }
                    systemLoginError.style.display = 'block';
                }
            })
            .finally(() => {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Kirish';
                }
            });
        });
    }

    // Logout Handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            handleUnauthorizedAccess('Tizimdan muvaffaqiyatli chiqdingiz.');
            showToast('info', 'Tizimdan Chiqildi', 'Sessiya yakunlandi.');
        });
    }

    // Toggle Password Visibility Handlers (Global Delegation)
    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.toggle-password-btn, .btn-toggle-pwd');
        if (!toggleBtn) return;
        e.preventDefault();
        e.stopPropagation();
        const wrapper = toggleBtn.closest('.password-input-wrapper') || toggleBtn.parentElement;
        if (!wrapper) return;
        const input = wrapper.querySelector('input');
        if (!input) return;
        const icon = toggleBtn.querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            if (icon) {
                icon.className = 'fa-solid fa-eye-slash';
                icon.style.color = 'var(--accent-cyan)';
            }
        } else {
            input.type = 'password';
            if (icon) {
                icon.className = 'fa-solid fa-eye';
                icon.style.color = '';
            }
        }
    });

    // Tab Switching Logic
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTabName = btn.getAttribute('data-tab');

            if (targetTabName === 'tab-admin' && !isCurrentUserAdmin()) {
                showToast('warning', 'Ruxsat Etilmagan', 'Admin bo\'limiga kirish uchun administrator roli talab etiladi.');
                return;
            }

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetTab = document.getElementById(targetTabName);
            if (targetTab) {
                targetTab.classList.add('active');
                if (targetTabName === 'tab-admin') {
                    fetchUsers();
                    fetchOverrides();
                    fetchUploadLogs();
                    fetchMappings();
                }
            }
        });
    });

    // Admin Center Sub-Navigation
    const adminSubnavBtns = document.querySelectorAll('.admin-subnav-btn');
    const adminSubsections = document.querySelectorAll('.admin-subsection');

    adminSubnavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetSubtab = btn.getAttribute('data-subtab');
            adminSubnavBtns.forEach(b => b.classList.remove('active'));
            adminSubsections.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            const targetSection = document.getElementById(targetSubtab);
            if (targetSection) targetSection.classList.add('active');

            if (targetSubtab === 'admin-override') {
                populateOverrideDropdowns(fullBackendStats);
                fetchOverrides();
            }
        });
    });

    // Business Sort Handlers
    sortSegmentButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const sortMode = btn.getAttribute('data-sort');
            setSortMode(sortMode);
        });
    });

    function setSortMode(mode) {
        currentSortMode = mode;

        sortSegmentButtons.forEach(btn => {
            if (btn.getAttribute('data-sort') === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        if (currentStats) {
            const sortedStations = getSortedStations();
            renderDirectorDashboard(currentStats, sortedStations);
            renderStationCards(sortedStations, currentStats.total_summa);
        }
    }

    function getSortedStations(statsObj = currentStats) {
        if (!statsObj || !statsObj.stations) return [];
        const stations = [...statsObj.stations];

        if (currentSortMode === 'soni') {
            return stations.sort((a, b) => b.soni_val - a.soni_val);
        } else if (currentSortMode === 'name') {
            return stations.sort((a, b) => a.stansiya.localeCompare(b.stansiya, 'uz'));
        } else {
            return stations.sort((a, b) => b.summa_val - a.summa_val);
        }
    }

    // Refresh Action
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchStats();
            fetchUploadLogs();
        });
    }

    // Excel Download Action
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            let period = currentSelectedPeriod || 'all';
            if (period === 'latest') {
                if (fullBackendStats && fullBackendStats.available_months && fullBackendStats.available_months.length > 0) {
                    period = fullBackendStats.available_months[0].code;
                } else {
                    period = '2026-08';
                }
            }
            let displayName = period;
            if (period === 'ytd') displayName = '2026 YTD';
            else if (period === 'all') displayName = 'Barcha Oylar';
            else if (fullBackendStats && fullBackendStats.available_months) {
                const found = fullBackendStats.available_months.find(m => m.code === period);
                if (found) displayName = found.name;
            }

            const downloadUrl = getApiUrl(`/api/download?period=${encodeURIComponent(period)}`);
            try {
                showToast('info', 'Excel Hisobot', `${displayName} hisoboti tayyorlanmoqda va yuklanmoqda...`);
                await downloadWithAuth(downloadUrl, `Kiosk_Hisobot_${period}.xlsx`);
            } catch (err) {
                showToast('error', 'Xatolik', err.message || "Faylni yuklab bo'lmadi.");
            }
        });
    }

    // Period Select Listener
    if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
            currentSelectedPeriod = e.target.value;
            applyPeriodFilter();
        });
    }

    // Comparison Select Listeners
    if (compBaseMonth) compBaseMonth.addEventListener('change', () => renderComparisonView());
    if (compTargetMonth) compTargetMonth.addEventListener('change', () => renderComparisonView());

    // Admin Save Mappings Listener
    if (saveMappingsTabBtn) {
        saveMappingsTabBtn.addEventListener('click', () => {
            saveMappings();
        });
    }




    function renderDashboard(stats) {
        fullBackendStats = stats;
        populatePeriodDropdowns(stats);
        populateOverrideDropdowns(stats);
        fetchOverrides();
        applyPeriodFilter();
    }





    // ==========================================
    // MANUAL STATION SALES OVERRIDE LOGIC (MONTH + DAY)
    // ==========================================
    const overrideForm = document.getElementById('overrideForm');
    const overrideYmSelect = document.getElementById('overrideYmSelect');
    const overrideDaySelect = document.getElementById('overrideDaySelect');
    const overrideEmailSelect = document.getElementById('overrideEmailSelect');
    const overrideTicketsInput = document.getElementById('overrideTicketsInput');
    const overrideSummaInput = document.getElementById('overrideSummaInput');
    const overridesTableBody = document.getElementById('overridesTableBody');

    const KIOSK_STATIONS_LIST = [
        { email: "toshkent.shimoliykiosk@railway.uz", name: "Тошкент Марказий" },
        { email: "kiosk@axonlogic.uz", name: "Тошкент Жанубий" },
        { email: "samarqandkiosk@railway.uz", name: "Самарқанд" },
        { email: "urganchkiosk@railway.uz", name: "Урганч" },
        { email: "khivakiosk@railway.uz", name: "Хива" },
        { email: "navoiykiosk@railway.uz", name: "Навои" },
        { email: "buxorokiosk@railway.uz", name: "Бухоро" },
        { email: "qongirotkiosk@railway.uz", name: "Қўнғирод" },
        { email: "nukuskiosk@railway.uz", name: "Нукус" },
        { email: "andijonkiosk@railway.uz", name: "Андижон" },
        { email: "qoqonkiosk@railway.uz", name: "Қўқон" },
        { email: "margilonkiosk@railway.uz", name: "Марғилон" },
        { email: "namangankiosk@railway.uz", name: "Наманган" },
        { email: "termizkiosk@railway.uz", name: "Термиз" },
        { email: "qarshikiosk@railway.uz", name: "Қарши" }
    ];

    function populateDaysForSelectedMonth() {
        if (!overrideDaySelect) return;
        const ym = overrideYmSelect ? overrideYmSelect.value : '2026-08';
        const currentSelected = overrideDaySelect.value;
        overrideDaySelect.innerHTML = '<option value="ALL">Barcha kunlar (Oylik jami)</option>';

        if (ym && ym.includes('-')) {
            const parts = ym.split('-');
            const year = parseInt(parts[0], 10) || 2026;
            const month = parseInt(parts[1], 10) || 1;
            if (year > 2000 && month >= 1 && month <= 12) {
                const daysInMonth = new Date(year, month, 0).getDate();
                for (let d = 1; d <= daysInMonth; d++) {
                    const dStr = String(d).padStart(2, '0');
                    const mStr = String(month).padStart(2, '0');
                    const dateFormatted = `${dStr}.${mStr}.${year}`;
                    const opt = document.createElement('option');
                    opt.value = dateFormatted;
                    opt.textContent = `${dateFormatted} - (${d}-kun)`;
                    overrideDaySelect.appendChild(opt);
                }
            }
        }
        if (currentSelected) overrideDaySelect.value = currentSelected;
    }

    if (overrideYmSelect) {
        overrideYmSelect.addEventListener('change', () => {
            populateDaysForSelectedMonth();
        });
    }

    function populateOverrideDropdowns(stats) {
        if (overrideYmSelect) {
            const MONTH_NAMES = {
                '01': 'Yanvar', '02': 'Fevral', '03': 'Mart', '04': 'Aprel',
                '05': 'May', '06': 'Iyun', '07': 'Iyul', '08': 'Avgust',
                '09': 'Sentabr', '10': 'Oktabr', '11': 'Noyabr', '12': 'Dekabr'
            };

            const now = new Date();
            const curY = now.getFullYear();
            const curM = String(now.getMonth() + 1).padStart(2, '0');
            const curCode = `${curY}-${curM}`;
            const curName = `${MONTH_NAMES[curM] || curM} ${curY}`;

            let availableMonths = [];
            const src = (stats && stats.available_months && stats.available_months.length > 0)
                ? stats.available_months
                : (fullBackendStats && fullBackendStats.available_months && fullBackendStats.available_months.length > 0)
                    ? fullBackendStats.available_months
                    : [];

            if (src.length > 0) {
                availableMonths = src.map(m => ({ ...m }));
            }

            // Always ensure the current real calendar month (e.g. Sentabr 2026) is available at the top!
            if (!availableMonths.some(m => m.code === curCode)) {
                availableMonths.unshift({ code: curCode, name: curName });
            }

            // Fallback past months if empty
            const fallbackList = [
                { code: '2026-09', name: 'Sentabr 2026' },
                { code: '2026-08', name: 'Avgust 2026' },
                { code: '2026-07', name: 'Iyul 2026' },
                { code: '2026-06', name: 'Iyun 2026' },
                { code: '2026-05', name: 'May 2026' },
                { code: '2026-04', name: 'Aprel 2026' },
                { code: '2026-03', name: 'Mart 2026' },
                { code: '2026-02', name: 'Fevral 2026' },
                { code: '2026-01', name: 'Yanvar 2026' }
            ];
            fallbackList.forEach(fb => {
                if (!availableMonths.some(m => m.code === fb.code)) {
                    availableMonths.push(fb);
                }
            });

            const previousVal = overrideYmSelect.value;
            overrideYmSelect.innerHTML = '';
            availableMonths.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.code;
                opt.textContent = m.name;
                overrideYmSelect.appendChild(opt);
            });

            if (previousVal && availableMonths.some(m => m.code === previousVal)) {
                overrideYmSelect.value = previousVal;
            } else if (availableMonths.some(m => m.code === curCode)) {
                overrideYmSelect.value = curCode;
            } else if (availableMonths.length > 0) {
                overrideYmSelect.value = availableMonths[0].code;
            }

            populateDaysForSelectedMonth();
        }

        if (overrideEmailSelect) {
            overrideEmailSelect.innerHTML = '';
            if (currentMappings && Object.keys(currentMappings).length > 0) {
                Object.entries(currentMappings).forEach(([email, meta]) => {
                    const opt = document.createElement('option');
                    opt.value = email;
                    opt.textContent = `${meta.station || email} (${email})`;
                    overrideEmailSelect.appendChild(opt);
                });
            } else {
                KIOSK_STATIONS_LIST.forEach(st => {
                    const opt = document.createElement('option');
                    opt.value = st.email;
                    opt.textContent = `${st.name} (${st.email})`;
                    overrideEmailSelect.appendChild(opt);
                });
            }
        }
    }

    function fetchOverrides() {
        if (!overridesTableBody) return;
        fetch(getApiUrl('/api/admin/overrides'), {
            headers: authHeaders()
        })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.overrides) {
                renderOverridesTable(data.overrides);
            }
        })
        .catch(err => console.log('fetchOverrides error:', err));
    }

    function renderOverridesTable(overrides) {
        if (!overridesTableBody) return;
        overridesTableBody.innerHTML = '';
        if (overrides.length === 0) {
            overridesTableBody.innerHTML = '<tr><td colspan="7" class="empty-row">Qo\'lda kiritilgan tahrirlar yo\'q</td></tr>';
            return;
        }

        overrides.forEach(ov => {
            const tr = document.createElement('tr');
            const dayBadge = (!ov.day_str || ov.day_str === 'ALL')
                ? '<span class="card-badge" style="background: rgba(255,255,255,0.08);">Barcha kunlar (Oylik)</span>'
                : `<strong style="color: var(--accent-cyan);"><i class="fa-solid fa-calendar-day"></i> ${ov.day_str}</strong>`;

            tr.innerHTML = `
                <td><strong>${ov.ym}</strong></td>
                <td>${dayBadge}</td>
                <td>${ov.station_name || ov.email}</td>
                <td><span class="number-cell-tickets">${ov.override_tickets !== null && ov.override_tickets !== undefined ? ov.override_tickets.toLocaleString('uz-UZ') + ' ta' : 'Asl'}</span></td>
                <td><span class="number-cell-summa">${ov.override_summa !== null && ov.override_summa !== undefined ? Math.round(ov.override_summa).toLocaleString('uz-UZ') + " so'm" : 'Asl'}</span></td>
                <td style="font-size: 12px; opacity: 0.8;">${ov.updated_at || '-'}</td>
                <td>
                    <button class="btn-icon-only btn-sm" style="color: var(--accent-rose);" onclick="deleteOverride('${ov.ym}', '${ov.email}', '${ov.day_str || 'ALL'}')" title="Tahrirni bekor qilish">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;
            overridesTableBody.appendChild(tr);
        });
    }

    window.deleteOverride = function(ym, email, day_str = 'ALL') {
        const desc = (day_str && day_str !== 'ALL') ? `${day_str} sanasi` : `${ym} oyi`;
        if (!confirm(`${desc} uchun ushbu kassa tahririni bekor qilmoqchimisiz?`)) return;
        fetch(getApiUrl('/api/admin/overrides'), {
            method: 'DELETE',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ ym, email, day_str })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast('success', 'Bekor qilindi', data.message);
                fetchOverrides();
                if (data.stats) renderDashboard(data.stats);
            } else {
                showToast('error', 'Xatolik', data.error);
            }
        })
        .catch(err => showToast('error', 'Xatolik', err.message));
    };

    if (overrideForm) {
        overrideForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const ym = overrideYmSelect ? overrideYmSelect.value : '';
            const day_str = overrideDaySelect ? overrideDaySelect.value : 'ALL';
            const email = overrideEmailSelect ? overrideEmailSelect.value : '';
            const tickets = overrideTicketsInput ? overrideTicketsInput.value : '';
            const summa = overrideSummaInput ? overrideSummaInput.value : '';

            if (!ym || !email || !tickets) {
                showToast('warning', 'Ogohlantirish', "Hisobot oyi, kassa hamda chiptalar sonini kiriting!");
                return;
            }

            fetch(getApiUrl('/api/admin/override-station'), {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ ym, day_str, email, tickets, summa })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showToast('success', 'Muvaffaqiyatli Saqlandi!', data.message);
                    if (overrideTicketsInput) overrideTicketsInput.value = '';
                    if (overrideSummaInput) overrideSummaInput.value = '';
                    fetchOverrides();
                    if (data.stats) renderDashboard(data.stats);
                } else {
                    showToast('error', 'Xatolik', data.error);
                }
            })
            .catch(err => showToast('error', 'Xatolik', err.message));
        });
    }

    // ==========================================
    // USER MANAGEMENT LOGIC
    // ==========================================
    function fetchUsers() {
        const usersTableBody = document.getElementById('usersTableBody');
        if (!usersTableBody) return;
        fetch(getApiUrl('/api/users'), { headers: authHeaders() })
            .then(res => {
                if (res.status === 401) return handleUnauthorizedAccess();
                return res.json();
            })
            .then(data => {
                if (data && data.success && data.users) {
                    usersTableBody.innerHTML = data.users.map(u => {
                        const regionLabel = u.region
                            ? ((currentMappings[u.region] && currentMappings[u.region].station) || u.region)
                            : (u.role === 'admin' ? "Barchasi" : "Cheklanmagan");
                        const isMaster = (u.username === 'admin' || u.username.toLowerCase() === 'javohir');
                        const isActive = u.is_active !== false;
                        const statusBadge = isActive
                            ? `<span class="badge badge-emerald" style="padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;">Faol</span>`
                            : `<span class="badge badge-rose" style="padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;">Nofaol</span>`;

                        const actionButtons = isMaster
                            ? '<span style="font-size:11px; color:var(--text-secondary);">(Bosh Admin)</span>'
                            : `
                                <div style="display: flex; align-items: center; gap: 4px;">
                                    <button class="btn-icon-only btn-sm" style="color:${isActive ? 'var(--accent-amber)' : 'var(--accent-emerald)'}; padding: 2px 6px;" title="${isActive ? 'Faolsizlantirish' : 'Faollashtirish'}" onclick="toggleUserStatus('${u.username}', ${isActive ? 'false' : 'true'})">
                                        <i class="fa-solid ${isActive ? 'fa-ban' : 'fa-check'}"></i>
                                    </button>
                                    <button class="btn-icon-only btn-sm" style="color:var(--accent-cyan); padding: 2px 6px;" title="Parolni o'zgartirish" onclick="promptResetPassword('${u.username}')">
                                        <i class="fa-solid fa-key"></i>
                                    </button>
                                    <button class="btn-icon-only btn-sm" style="color:var(--accent-rose); padding: 2px 6px;" title="O'chirish" onclick="deleteUserAccount('${u.username}')">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </div>
                            `;

                        return `
                        <tr>
                            <td><strong>${u.username}</strong></td>
                            <td>${u.name || '-'}</td>
                            <td>
                                <span class="badge ${u.role === 'admin' ? 'badge-amber' : 'badge-cyan'}" style="padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;">
                                    ${u.role === 'admin' ? 'Administrator' : 'Foydalanuvchi'}
                                </span>
                            </td>
                            <td>${regionLabel}</td>
                            <td>${statusBadge}</td>
                            <td>${actionButtons}</td>
                        </tr>
                    `;
                    }).join('');
                }
            })
            .catch(err => console.error("fetchUsers error:", err));
    }

    const newRoleSelect = document.getElementById('newRoleSelect');
    const newRegionGroup = document.getElementById('newRegionGroup');
    function updateRegionGroupVisibility() {
        if (!newRoleSelect || !newRegionGroup) return;
        newRegionGroup.style.display = (newRoleSelect.value === 'admin') ? 'none' : 'block';
    }
    if (newRoleSelect) {
        newRoleSelect.addEventListener('change', updateRegionGroupVisibility);
        updateRegionGroupVisibility();
    }

    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('newUsernameInput');
            const passwordInput = document.getElementById('newPasswordInput');
            const nameInput = document.getElementById('newNameInput');
            const roleSelect = document.getElementById('newRoleSelect');
            const regionSelect = document.getElementById('newRegionSelect');

            const username = usernameInput ? usernameInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value.trim() : '';
            const name = nameInput ? nameInput.value.trim() : '';
            const role = roleSelect ? roleSelect.value : 'user';
            const region = (role === 'user' && regionSelect) ? regionSelect.value.trim() : '';

            if (!username || !password) {
                showToast('warning', 'Ogohlantirish', 'Login va parol kiritilishi shart!');
                return;
            }

            fetch(getApiUrl('/api/users'), {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ username, password, name, role, region })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showToast('success', 'Foydalanuvchi Qo\'shildi', data.message);
                    addUserForm.reset();
                    updateRegionGroupVisibility();
                    fetchUsers();
                } else {
                    showToast('error', 'Xatolik', data.error || 'Qo\'shishda xatolik yuz berdi');
                }
            })
            .catch(err => showToast('error', 'Xatolik', err.message));
        });
    }

    window.toggleUserStatus = function(username, newStatus) {
        const actionText = newStatus ? "faollashtirmoqchimisiz" : "faolsizlantirmoqchimisiz";
        if (!confirm(`Haqiqatan ham '${username}' hisobini ${actionText}?`)) return;
        fetch(getApiUrl(`/api/users/${username}`), {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ is_active: newStatus })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast('success', 'Muvaffaqiyatli', data.message);
                fetchUsers();
            } else {
                showToast('error', 'Xatolik', data.error);
            }
        })
        .catch(err => showToast('error', 'Xatolik', err.message));
    };

    window.promptResetPassword = function(username) {
        const newPassword = prompt(`'${username}' uchun yangi parolni kiriting:`);
        if (!newPassword || !newPassword.trim()) return;
        fetch(getApiUrl(`/api/users/${username}`), {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ password: newPassword.trim() })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast('success', 'Parol O\'zgartirildi', data.message);
            } else {
                showToast('error', 'Xatolik', data.error);
            }
        })
        .catch(err => showToast('error', 'Xatolik', err.message));
    };

    window.deleteUserAccount = function(username) {
        if (!confirm(`Haqiqatan ham '${username}' foydalanuvchisini o'chirmoqchimisiz?`)) return;
        fetch(getApiUrl(`/api/users/${username}`), {
            method: 'DELETE',
            headers: authHeaders()
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast('success', 'O\'chirildi', data.message);
                fetchUsers();
            } else {
                showToast('error', 'Xatolik', data.error);
            }
        })
        .catch(err => showToast('error', 'Xatolik', err.message));
    };

    // Perform mandatory authentication check on startup
    checkAppAuthentication();

    // Drag & Drop Handling
    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                handleFileUpload(e.dataTransfer.files[0]);
            }
        });

        dropzone.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
                const fi = document.getElementById('fileInput');
                if (fi) fi.click();
            }
        });
    }

    window.triggerExcelUpload = function() {
        const adminTabBtn = document.querySelector('.tab-btn[data-tab="tab-admin"]');
        if (adminTabBtn) adminTabBtn.click();
        const logsSubnavBtn = document.querySelector('.admin-subnav-btn[data-subtab="admin-logs"]');
        if (logsSubnavBtn) logsSubnavBtn.click();
        setTimeout(() => {
            const fi = document.getElementById('fileInput');
            if (fi) fi.click();
        }, 100);
    };

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0]);
            }
        });
    }

    const backupDbBtn = document.getElementById('backupDbBtn');
    if (backupDbBtn) {
        backupDbBtn.addEventListener('click', async () => {
            try {
                showToast('info', 'Zaxira', 'Ma\'lumotlar bazasi yuklab olinmoqda...');
                await downloadWithAuth(getApiUrl('/api/admin/backup-db'), 'kiosk_data_backup.db');
            } catch (err) {
                showToast('error', 'Xatolik', err.message || 'Zaxirani yuklab bo\'lmadi');
            }
        });
    }

    const restoreDbFileInput = document.getElementById('restoreDbFileInput');
    if (restoreDbFileInput) {
        restoreDbFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!confirm(`Haqiqatan ham '${file.name}' zaxirasidan ma'lumotlar bazasini qayta tiklamoqchimisiz?`)) {
                restoreDbFileInput.value = '';
                return;
            }
            const formData = new FormData();
            formData.append('file', file);
            showToast('info', 'Tiklanmoqda', 'Baza qayta tiklanmoqda...');
            try {
                const res = await fetch(getApiUrl('/api/admin/restore-db'), {
                    method: 'POST',
                    headers: authHeaders(),
                    body: formData
                });
                const data = await res.json();
                if (data.success) {
                    showToast('success', 'Muvaffaqiyatli', data.message || 'Baza muvaffaqiyatli tiklandi!');
                    fetchStats();
                    fetchUploadLogs();
                } else {
                    showToast('error', 'Xatolik', data.error || 'Tiklashda xatolik yuz berdi');
                }
            } catch (err) {
                showToast('error', 'Xatolik', err.message || 'Tiklashda xatolik yuz berdi');
            } finally {
                restoreDbFileInput.value = '';
            }
        });
    }

    function handleFileUpload(file) {
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            showToast('warning', 'Fayl Formati Xato', 'Iltimos, faqat Excel fayllarini (.xlsx, .xls) yuklang!');
            return;
        }

        if (dropzoneContent) dropzoneContent.style.display = 'none';
        if (uploadSpinner) uploadSpinner.style.display = 'flex';

        fallbackFormDataUpload(file);
    }

    function fallbackFormDataUpload(file) {
        const formData = new FormData();
        formData.append('file', file);

        fetch(getApiUrl('/api/upload'), {
            method: 'POST',
            headers: authHeaders(),
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (uploadSpinner) uploadSpinner.style.display = 'none';
            if (dropzoneContent) dropzoneContent.style.display = 'block';

            if (data.status === 'success' || data.success) {
                renderDashboard(data.stats);
                fetchUploadLogs();
                showToast('success', 'Muvaffaqiyatli', data.message || 'Hisobot muvaffaqiyatli shakllantirildi!');
            } else {
                showToast('error', 'Yuklashda Xatolik', data.message || data.error || 'Noma\'lum xatolik');
            }
        })
        .catch(err => {
            if (uploadSpinner) uploadSpinner.style.display = 'none';
            if (dropzoneContent) dropzoneContent.style.display = 'block';
            showToast('error', 'Server Xatoligi', 'Fayl yuklashda server xatoligi yuz berdi!');
            console.error(err);
        });
    }

    function fetchStats() {
        fetch(getApiUrl('/api/stats'), { headers: authHeaders() })
            .then(res => {
                if (res.status === 401) {
                    handleUnauthorizedAccess("Avtorizatsiya muddati tugadi. Qaytadan kirishingiz so'raladi.");
                    throw new Error("401 Unauthorized");
                }
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    if (data.monthly_reports) {
                        monthlyReportsData = data.monthly_reports;
                    }
                    renderDashboard(data.stats);
                } else if (data.error) {
                    showToast('error', 'Xatolik', data.error);
                }
            })
            .catch(err => console.error("fetchStats error:", err));
    }

    function fetchMappings() {
        fetch(getApiUrl('/api/mappings'), { headers: authHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    currentMappings = data.mappings;
                    renderSettingsGrid(data.mappings);
                    populateRegionSelect(data.mappings);
                }
            });
    }

    function populateRegionSelect(mappings) {
        const regionSelect = document.getElementById('newRegionSelect');
        if (!regionSelect) return;
        const current = regionSelect.value;
        regionSelect.innerHTML = '<option value="">Barcha kassalar (cheklanmagan)</option>';
        Object.entries(mappings || {}).forEach(([email, meta]) => {
            const opt = document.createElement('option');
            opt.value = email;
            opt.textContent = (meta && meta.station) ? meta.station : email;
            regionSelect.appendChild(opt);
        });
        regionSelect.value = current;
    }

    function fetchUploadLogs() {
        fetch(getApiUrl('/api/upload-logs'), { headers: authHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    renderUploadLogs(data.logs);
                }
            });
    }

    function saveMappings() {
        const inputs = mappingEditorGrid.querySelectorAll('.input-control');
        const newMap = {};

        inputs.forEach(ipt => {
            const email = ipt.getAttribute('data-email');
            const field = ipt.getAttribute('data-field');
            if (!newMap[email]) {
                newMap[email] = { ...currentMappings[email] };
            }
            if (field === 'station') {
                newMap[email].station = ipt.value.trim();
            } else if (field === 'col_soni') {
                newMap[email].col_soni = parseInt(ipt.value) || 0;
            } else if (field === 'col_summa') {
                newMap[email].col_summa = parseInt(ipt.value) || 0;
            }
        });

        fetch(getApiUrl('/api/mappings'), {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(newMap)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                currentMappings = newMap;
                showToast('success', 'Saqlandi', data.message || 'Pochta biriktirmalari saqlandi!');
                fetchStats();
            } else {
                showToast('error', 'Saqlashda Xatolik', 'Sozlamalarni saqlashda xatolik yuz berdi!');
            }
        });
    }

    function populatePeriodDropdowns(stats) {
        const availableMonths = stats.available_months || [];
        
        if (periodSelect) {
            periodSelect.innerHTML = '';
            
            // 1. Year To Date (YTD) - Default & Primary Option
            const ytdYear = (stats.ytd_data && stats.ytd_data.year) ? stats.ytd_data.year : '2026';
            const optYtd = document.createElement('option');
            optYtd.value = 'ytd';
            optYtd.textContent = `Shu Yil Boshidan Beri (${ytdYear} YTD)`;
            periodSelect.appendChild(optYtd);

            // 2. All Months Combined (Total)
            const optAll = document.createElement('option');
            optAll.value = 'all';
            optAll.textContent = "Barcha Oylar Birgalikda (Jami Yillik)";
            periodSelect.appendChild(optAll);

            // 3. Latest Month
            if (availableMonths.length > 0) {
                const optLatest = document.createElement('option');
                optLatest.value = 'latest';
                optLatest.textContent = `Hozirgi Oy (${availableMonths[0].name})`;
                periodSelect.appendChild(optLatest);
            }

            // 4. Individual Months
            availableMonths.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.code;
                opt.textContent = m.name;
                periodSelect.appendChild(opt);
            });

            periodSelect.value = currentSelectedPeriod || 'ytd';
        }

        // Comparison Selectors
        if (compBaseMonth && compTargetMonth) {
            compBaseMonth.innerHTML = '';
            compTargetMonth.innerHTML = '';

            availableMonths.forEach(m => {
                const opt1 = document.createElement('option');
                opt1.value = m.code;
                opt1.textContent = m.name;
                compBaseMonth.appendChild(opt1);

                const opt2 = document.createElement('option');
                opt2.value = m.code;
                opt2.textContent = m.name;
                compTargetMonth.appendChild(opt2);
            });

            if (availableMonths.length >= 2) {
                compBaseMonth.value = availableMonths[1].code; // Older month
                compTargetMonth.value = availableMonths[0].code; // Recent month
            } else if (availableMonths.length === 1) {
                compBaseMonth.value = availableMonths[0].code;
                compTargetMonth.value = availableMonths[0].code;
            }
        }
    }

    function computeExecutiveSummary(statsObj, periodTitle) {
        if (!statsObj) return {};
        const tSum = statsObj.total_summa || 0;
        const tTix = statsObj.total_tickets || 0;
        const avgP = tTix > 0 ? Math.round(tSum / tTix) : 0;

        const dTrend = statsObj.daily_trend || [];
        const dLen = dTrend.length;
        const dAvgS = dLen > 0 ? Math.round(tSum / dLen) : 0;

        let peakDay = { date: '-', summa: 0, tickets: 0 };
        if (dTrend.length > 0) {
            peakDay = dTrend.reduce((max, d) => ((d.summa || 0) > (max.summa || 0) ? d : max), dTrend[0]);
        }

        const stations = statsObj.stations || [];
        const topSt = stations.length > 0 ? stations[0] : { stansiya: 'Noma\'lum', summa_val: 0, share_percent: 0 };
        const secSt = stations.length > 1 ? stations[1] : { stansiya: '-', summa_val: 0, share_percent: 0 };

        let onlineSum = 0;
        let terminalSum = 0;
        dTrend.forEach(item => {
            onlineSum += item.online_tickets || 0;
            terminalSum += item.terminal_tickets || 0;
        });
        const grandPayTickets = onlineSum + terminalSum || 1;
        const onlinePct = parseFloat(((onlineSum / grandPayTickets) * 100).toFixed(1));
        const terminalPct = parseFloat((100 - onlinePct).toFixed(1));

        return {
            net_revenue: tSum,
            total_tickets: tTix,
            overall_avg_price: avgP,
            daily_avg_revenue: dAvgS,
            daily_avg_tickets: dLen > 0 ? Math.round(tTix / dLen) : 0,
            peak_date: peakDay.date || '-',
            peak_day_revenue: peakDay.summa || 0,
            top_station: topSt.stansiya,
            top_station_summa: topSt.summa_val || 0,
            top_station_share: topSt.share_percent || 0,
            second_station: secSt.stansiya,
            second_station_summa: secSt.summa_val || 0,
            online_percent: onlinePct,
            terminal_percent: terminalPct,
            period_name: periodTitle,
            ai_recommendation: `Hurmatli Rahbariyat, <strong>${periodTitle}</strong> bo'yicha kiosklar orqali jami <strong>${Math.round(tSum).toLocaleString('uz-UZ')} so'm</strong> tushum hamda <strong>${tTix.toLocaleString('uz-UZ')} ta</strong> chipta sotildi. Bitta chiptaning o'rtacha narxi <strong>${Math.round(avgP).toLocaleString('uz-UZ')} so'mni</strong> va kunlik o'rtacha tushum <strong>${Math.round(dAvgS).toLocaleString('uz-UZ')} so'mni</strong> tashkil etdi. Eng savdoli kassa <strong>${topSt.stansiya}</strong> bo'lib, uning umumiy tushumdagi ulushi <strong>${topSt.share_percent}%</strong> ni tashkil qiladi. Eng yuqori kunlik savdo ko'rsatkichi <strong>${peakDay.date}</strong> sanasida (<strong>${Math.round(peakDay.summa || 0).toLocaleString('uz-UZ')} so'm</strong>) qayd etilgan.`
        };
    }

    function computeDateRange(stats, periodKey) {
        let validDates = [];
        if ((periodKey === 'ytd' || periodKey === 'all') && fullBackendStats && fullBackendStats.monthly_data) {
            Object.keys(fullBackendStats.monthly_data).forEach(mk => {
                const mObj = fullBackendStats.monthly_data[mk];
                (mObj.daily_trend || []).forEach(d => {
                    if (d && d.date && d.date !== '-') validDates.push(d.date);
                });
            });
        }

        if (validDates.length === 0 && stats && stats.daily_trend) {
            stats.daily_trend.forEach(d => {
                if (d && d.date && d.date !== '-') validDates.push(d.date);
            });
        }

        const parseDmY = (str) => {
            if (!str || typeof str !== 'string') return 0;
            const parts = str.trim().split('.');
            if (parts.length === 3) {
                return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
            }
            return 0;
        };

        validDates.sort((a, b) => parseDmY(a) - parseDmY(b));

        let startDate = "";
        let endDate = "";
        let rangeText = "";
        if (validDates.length > 0) {
            startDate = validDates[0];
            endDate = validDates[validDates.length - 1];
            rangeText = startDate === endDate ? `${startDate} kuni` : `${startDate} dan ${endDate} gacha`;
        }
        return { startDate, endDate, rangeText };
    }

    function updateMatrixTableHeader(stats, periodKey, periodTitle) {
        const matrixDateRangeText = document.getElementById('matrixDateRangeText');
        const matrixMonthBadge = document.getElementById('matrixMonthBadge');
        const matrixSubtitleDateRange = document.getElementById('matrixSubtitleDateRange');

        let monthName = "Sentabr 2026 oyi";
        if (periodKey === 'ytd') {
            const yr = (fullBackendStats && fullBackendStats.ytd_data && fullBackendStats.ytd_data.year) ? fullBackendStats.ytd_data.year : '2026';
            monthName = `${yr}-yil boshidan beri (YTD)`;
        } else if (periodKey === 'all') {
            monthName = "Barcha oylar birgalikda";
        } else if (periodKey === 'latest' && fullBackendStats && fullBackendStats.available_months && fullBackendStats.available_months.length > 0) {
            monthName = `${fullBackendStats.available_months[0].name} oyi`;
        } else if (fullBackendStats && fullBackendStats.available_months) {
            const mMatch = fullBackendStats.available_months.find(m => m.code === periodKey);
            monthName = mMatch ? `${mMatch.name} oyi` : (periodTitle || "Hisobot Davri");
        } else if (periodTitle) {
            monthName = periodTitle;
        }

        const dateInfo = computeDateRange(stats, periodKey);

        if (matrixDateRangeText) {
            matrixDateRangeText.textContent = dateInfo.rangeText || "01.09.2026 dan 12.09.2026 gacha";
        }
        if (matrixMonthBadge) {
            matrixMonthBadge.textContent = monthName;
        }
        if (matrixSubtitleDateRange) {
            matrixSubtitleDateRange.textContent = dateInfo.rangeText ? `(${dateInfo.rangeText})` : "";
        }
    }

    function applyPeriodFilter() {
        if (!fullBackendStats) return;

        let periodTitle = "Tanlangan Davr";

        if (currentSelectedPeriod === 'ytd') {
            currentStats = fullBackendStats.ytd_data || fullBackendStats.overall_data;
            periodTitle = `${fullBackendStats.ytd_data?.year || '2026'}-yil boshidan beri (YTD)`;
        } else if (currentSelectedPeriod === 'all' && fullBackendStats.overall_data) {
            currentStats = fullBackendStats.overall_data;
            periodTitle = "Barcha Oylar Birgalikda (Jami Yillik)";
        } else if (currentSelectedPeriod === 'latest' && fullBackendStats.available_months && fullBackendStats.available_months.length > 0) {
            const latestCode = fullBackendStats.available_months[0].code;
            currentStats = fullBackendStats.monthly_data ? (fullBackendStats.monthly_data[latestCode] || fullBackendStats) : fullBackendStats;
            periodTitle = `${fullBackendStats.available_months[0].name} oyi`;
        } else if (fullBackendStats.monthly_data && fullBackendStats.monthly_data[currentSelectedPeriod]) {
            currentStats = fullBackendStats.monthly_data[currentSelectedPeriod];
            const mMatch = (fullBackendStats.available_months || []).find(m => m.code === currentSelectedPeriod);
            periodTitle = mMatch ? `${mMatch.name} oyi` : currentSelectedPeriod;
        } else {
            currentStats = fullBackendStats;
            periodTitle = "Hisobot Davri";
        }

        if (currentStats && (!currentStats.director_summary || !currentStats.director_summary.period_name)) {
            currentStats.director_summary = computeExecutiveSummary(currentStats, periodTitle);
        }

        const dateInfo = computeDateRange(currentStats, currentSelectedPeriod);
        const periodBadges = document.querySelectorAll('.active-period-badge-label');
        periodBadges.forEach(el => { 
            el.textContent = dateInfo.rangeText ? `${periodTitle} (${dateInfo.rangeText})` : periodTitle; 
        });

        const sortedStations = getSortedStations();
        renderDirectorDashboard(currentStats, sortedStations);
        renderStationCards(sortedStations, currentStats.total_summa);
        renderDailyTable(currentStats.daily_trend || []);
        renderTrendChart(currentStats.daily_trend || []);
        renderComparisonView();
    }

    /* RAHBARIYAT DASHBOARD RENDERER (PURE BUSINESS METRICS) */
    function renderDirectorDashboard(stats, sortedStations) {
        if (!stats) return;
        const summary = stats.director_summary || {};
        const stations = sortedStations || getSortedStations(stats);

        // Update Matrix Table Header (Date Range & Month)
        updateMatrixTableHeader(stats, currentSelectedPeriod, summary.period_name);

        // Real Executive KPIs
        if (dirKpiNetRevenue) dirKpiNetRevenue.textContent = formatCurrency(summary.net_revenue || stats.total_summa || 0);
        if (dirKpiTotalTickets) dirKpiTotalTickets.textContent = `${(summary.total_tickets || stats.total_tickets || 0).toLocaleString('uz-UZ')} ta`;

        // Card 3: Eng Yuqori Savdoli Kassa (har doim summa bo'yicha, sort rejimidan qat'i nazar)
        const revenueSorted = [...(stats.stations || [])].sort((a, b) => b.summa_val - a.summa_val);
        const topSt = revenueSorted.length > 0 ? revenueSorted[0] : null;
        if (dirKpiTopStationName) dirKpiTopStationName.textContent = topSt ? topSt.stansiya : (summary.top_station || '-');
        if (dirKpiTopStationShare) {
            const shPct = topSt ? topSt.share_percent : (summary.top_station_share || 0);
            dirKpiTopStationShare.innerHTML = `<i class="fa-solid fa-crown"></i> ${shPct}% ulush`;
        }
        if (dirKpiTopStationSum) {
            const sumVal = topSt ? topSt.summa_val : (summary.top_station_summa || 0);
            dirKpiTopStationSum.textContent = formatCurrency(sumVal);
        }

        // Card 4: To'lov Turlari Nisbati (Online / Terminal)
        let onlineSum = 0;
        let terminalSum = 0;
        let uzcardSum = 0;
        let humoSum = 0;
        (currentStats && currentStats.daily_trend ? currentStats.daily_trend : (stats.daily_trend || [])).forEach(item => {
            onlineSum += item.online_tickets || 0;
            terminalSum += item.terminal_tickets || 0;
            uzcardSum += item.uzcard_tickets || 0;
            humoSum += item.humo_tickets || 0;
        });
        const grandPayTickets = onlineSum + terminalSum || 1;
        const onlinePct = ((onlineSum / grandPayTickets) * 100).toFixed(1);
        const terminalPct = ((terminalSum / grandPayTickets) * 100).toFixed(1);

        if (dirKpiPaymentRatio) dirKpiPaymentRatio.textContent = `${onlinePct}% / ${terminalPct}%`;
        if (dirKpiPaymentOnline) dirKpiPaymentOnline.innerHTML = `<i class="fa-solid fa-globe"></i> Online: ${onlineSum.toLocaleString()} ta (${onlinePct}%)`;
        if (dirKpiPaymentTerminal) {
            let termLabel = `Terminal: ${terminalSum.toLocaleString()} ta`;
            if (uzcardSum > 0 || humoSum > 0) {
                termLabel += ` (Uzcard: ${uzcardSum.toLocaleString()}, Humo: ${humoSum.toLocaleString()})`;
            }
            dirKpiPaymentTerminal.textContent = termLabel;
        }

        if (directorAiText) {
            directorAiText.innerHTML = summary.ai_recommendation || "Ma'lumotlar tahlil qilinmoqda...";
        }

        // Render Rahbariyat Matrix Table & Tfoot Totals
        const directorMatrixTableFoot = document.getElementById('directorMatrixTableFoot');
        if (directorMatrixTableBody) {
            directorMatrixTableBody.innerHTML = '';
            if (directorMatrixTableFoot) directorMatrixTableFoot.innerHTML = '';

            if (stations.length === 0) {
                directorMatrixTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Ma&#39;lumot topilmadi</td></tr>';
            } else {
                const totalNetSum = summary.net_revenue || stats.total_summa || 1;
                let grandTickets = 0;
                let grandSumma = 0;

                stations.forEach((st, idx) => {
                    grandTickets += st.soni_val || 0;
                    grandSumma += st.summa_val || 0;

                    const tr = document.createElement('tr');
                    tr.className = 'clickable-station-row';
                    tr.title = `${st.stansiya} kassa ma'lumotlarini ochish uchun bosing`;
                    tr.onclick = () => openStationDetailsModal(st.stansiya);
                    const sharePct = ((st.summa_val / totalNetSum) * 100).toFixed(1);
                    const avgP = st.soni_val > 0 ? Math.round(st.summa_val / st.soni_val) : 0;

                    let rankBadgeHtml = `<span class="rank-badge rank-default">${idx + 1}</span>`;
                    if (idx === 0) rankBadgeHtml = `<span class="rank-badge rank-1" title="1-O'rin"><i class="fa-solid fa-medal"></i> 1</span>`;
                    else if (idx === 1) rankBadgeHtml = `<span class="rank-badge rank-2" title="2-O'rin"><i class="fa-solid fa-medal"></i> 2</span>`;
                    else if (idx === 2) rankBadgeHtml = `<span class="rank-badge rank-3" title="3-O'rin"><i class="fa-solid fa-medal"></i> 3</span>`;

                    tr.innerHTML = `
                        <td style="text-align: center;">${rankBadgeHtml}</td>
                        <td>
                            <div class="st-cell">
                                <div class="st-icon"><i class="fa-solid fa-train-subway"></i></div>
                                <span class="st-name">${st.stansiya}</span>
                            </div>
                        </td>
                        <td style="text-align: right;">
                            <span class="number-cell-tickets">${st.soni_val.toLocaleString('uz-UZ')} ta</span>
                        </td>
                        <td style="text-align: right;">
                            <span class="number-cell-summa">${Math.round(st.summa_val).toLocaleString('uz-UZ')} so'm</span>
                        </td>
                        <td style="text-align: right;">
                            <span class="number-cell-avg">${Math.round(avgP).toLocaleString('uz-UZ')} so'm</span>
                        </td>
                        <td>
                            <div class="share-cell">
                                <span class="share-pct-badge">${sharePct}%</span>
                                <div class="matrix-progress-track">
                                    <div class="matrix-progress-fill" style="width: ${Math.min(sharePct * 2.8, 100)}%;"></div>
                                </div>
                            </div>
                        </td>
                    `;
                    directorMatrixTableBody.appendChild(tr);
                });

                // Render Highlighted JAMI Total Row
                if (directorMatrixTableFoot) {
                    const grandAvgP = grandTickets > 0 ? Math.round(grandSumma / grandTickets) : 0;
                    const trFoot = document.createElement('tr');
                    trFoot.className = 'matrix-total-row';
                    trFoot.innerHTML = `
                        <td style="text-align: center;"><span class="rank-badge total-badge" title="Jami"><i class="fa-solid fa-calculator"></i></span></td>
                        <td>
                            <div class="st-cell">
                                <div class="st-icon total-icon"><i class="fa-solid fa-sigma"></i></div>
                                <strong>JAMI (Barcha ${stations.length} Kassa)</strong>
                            </div>
                        </td>
                        <td style="text-align: right;">
                            <span class="number-cell-tickets total">${grandTickets.toLocaleString('uz-UZ')} ta</span>
                        </td>
                        <td style="text-align: right;">
                            <span class="number-cell-summa total">${Math.round(grandSumma).toLocaleString('uz-UZ')} so'm</span>
                        </td>
                        <td style="text-align: right;">
                            <span class="number-cell-avg total">${Math.round(grandAvgP).toLocaleString('uz-UZ')} so'm</span>
                        </td>
                        <td>
                            <div class="share-cell">
                                <span class="share-pct-badge total">100.0%</span>
                                <div class="matrix-progress-track">
                                    <div class="matrix-progress-fill total" style="width: 100%;"></div>
                                </div>
                            </div>
                        </td>
                    `;
                    directorMatrixTableFoot.appendChild(trFoot);
                }
            }
        }

        renderDirectorHorizontalChart(stations);
        renderDirectorShareChart(stations);
    }

    /* HORIZONTAL BAR CHART FOR RAHBARIYAT DASHBOARD */
    function renderDirectorHorizontalChart(stations) {
        const ctx = document.getElementById('directorHorizontalChart');
        if (!ctx) return;

        if (directorHorizontalChartInstance) {
            directorHorizontalChartInstance.destroy();
        }

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const textColor = isLight ? '#475569' : '#94a3b8';
        const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';

        // stations kelayotganda allaqachon joriy sort rejimi bo'yicha tartiblangan
        const labels = stations.map((s, i) => `${i + 1}. ${s.stansiya}`);
        const data = currentSortMode === 'soni' ? stations.map(s => s.soni_val) : stations.map(s => s.summa_val);
        const labelText = currentSortMode === 'soni' ? 'Sotilgan Chiptalar Soni' : 'Tushum Summasi (So\'m)';

        const chartCtx = ctx.getContext('2d');
        const gradient = chartCtx.createLinearGradient(0, 0, 400, 0);
        gradient.addColorStop(0, '#38bdf8');
        gradient.addColorStop(1, '#3b82f6');

        directorHorizontalChartInstance = new Chart(chartCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: labelText,
                    data: data,
                    backgroundColor: gradient,
                    borderColor: '#38bdf8',
                    borderWidth: 1,
                    borderRadius: 6,
                    barThickness: 18
                }]
            },
            options: {
                indexAxis: 'y', // HORIZONTAL BAR CHART
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.95)',
                        titleColor: isLight ? '#0f172a' : '#f8fafc',
                        bodyColor: isLight ? '#334155' : '#e2e8f0',
                        borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                if (currentSortMode === 'soni') {
                                    return ` Chiptalar: ${context.raw.toLocaleString('uz-UZ')} ta`;
                                }
                                return ` Tushum: ${context.raw.toLocaleString('uz-UZ')} so'm (${formatMln(context.raw)})`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: textColor,
                            font: { family: 'Plus Jakarta Sans', size: 11 },
                            callback: function(val) {
                                if (currentSortMode === 'soni') return val;
                                return (val / 1000000).toFixed(0) + ' M';
                            }
                        },
                        grid: { color: gridColor }
                    },
                    y: {
                        ticks: {
                            color: textColor,
                            font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' }
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    /* DOUGHNUT CHART FOR MARKET SHARE DISTRIBUTION */
    function renderDirectorShareChart(stations) {
        const ctx = document.getElementById('directorShareChart');
        if (!ctx) return;

        if (directorShareChartInstance) {
            directorShareChartInstance.destroy();
        }

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const textColor = isLight ? '#475569' : '#94a3b8';

        const top6 = [...stations].sort((a, b) => b.summa_val - a.summa_val).slice(0, 6);
        const others = [...stations].sort((a, b) => b.summa_val - a.summa_val).slice(6);
        const othersSum = others.reduce((acc, curr) => acc + curr.summa_val, 0);

        const labels = top6.map(s => s.stansiya);
        const data = top6.map(s => s.summa_val);
        if (othersSum > 0) {
            labels.push("Boshqa Kassalar");
            data.push(othersSum);
        }

        directorShareChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#38bdf8', '#34d399', '#a78bfa', '#fbbf24', '#f43f5e', '#60a5fa', '#64748b'
                    ],
                    borderWidth: 2,
                    borderColor: isLight ? '#ffffff' : '#111827'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.label}: ${formatMln(context.raw)} so'm`;
                            }
                        }
                    }
                }
            }
        });
    }

    /* ADMIN SETTINGS GRID */
    function renderSettingsGrid(mappings) {
        if (!mappingEditorGrid) return;
        mappingEditorGrid.innerHTML = '';

        for (const [email, meta] of Object.entries(mappings)) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><i class="fa-solid fa-envelope" style="color: var(--accent-violet); margin-right: 6px;"></i>${email}</td>
                <td><input type="text" class="input-control" data-email="${email}" data-field="station" value="${meta.station}"></td>
                <td><input type="number" class="input-control" data-email="${email}" data-field="col_soni" value="${meta.col_soni}"></td>
                <td><input type="number" class="input-control" data-email="${email}" data-field="col_summa" value="${meta.col_summa}"></td>
            `;
            mappingEditorGrid.appendChild(tr);
        }
    }

    function renderUploadLogs(logs) {
        if (!uploadLogsTableBody) return;
        uploadLogsTableBody.innerHTML = '';

        if (!logs || logs.length === 0) {
            uploadLogsTableBody.innerHTML = '<tr><td colspan="9" class="empty-row">Audit tarixi topilmadi</td></tr>';
            return;
        }

        logs.forEach((log, idx) => {
            const tr = document.createElement('tr');
            const totalRows = (log.total_rows || log.rows || 0).toLocaleString();
            const relRows = log.relevant_rows !== undefined ? log.relevant_rows.toLocaleString() : '-';
            const newTix = log.new_tickets !== undefined ? log.new_tickets.toLocaleString() : '-';
            const dupTix = log.duplicate_tickets !== undefined ? log.duplicate_tickets.toLocaleString() : '-';
            const totSum = (log.total_amount || 0) > 0 ? (Math.round(log.total_amount).toLocaleString() + " so'm") : '-';
            const isSuccess = log.status && log.status.toLowerCase().includes('muvaffaq');
            const statusClass = isSuccess ? 'status-badge' : 'badge badge-rose';
            const statusIcon = isSuccess ? 'fa-check' : 'fa-triangle-exclamation';

            tr.innerHTML = `
                <td><strong>${idx + 1}</strong></td>
                <td><i class="fa-solid fa-file-excel" style="color: var(--accent-emerald); margin-right: 6px;"></i> <strong>${log.filename}</strong></td>
                <td><strong>${totalRows}</strong></td>
                <td>${relRows}</td>
                <td><strong style="color: var(--accent-cyan);">${newTix}</strong></td>
                <td><span style="color: var(--accent-amber);">${dupTix}</span></td>
                <td>${totSum}</td>
                <td style="font-size: 12px; color: var(--text-secondary);">${log.timestamp}</td>
                <td><span class="${statusClass}" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px;"><i class="fa-solid ${statusIcon}"></i> ${log.status}</span></td>
            `;
            uploadLogsTableBody.appendChild(tr);
        });
    }

    function renderStationCards(stations, totalSumma) {
        if (!stationCardsGrid) return;
        stationCardsGrid.innerHTML = '';

        stations.forEach(item => {
            const card = document.createElement('div');
            card.className = 'station-card glass-card clickable-station-card';
            card.title = `${item.stansiya} kassa ma'lumotlarini ochish uchun bosing`;
            card.onclick = () => openStationDetailsModal(item.stansiya);
            const pct = totalSumma > 0 ? ((item.summa_val / totalSumma) * 100).toFixed(1) : 0;

            card.innerHTML = `
                <div class="st-card-header">
                    <span class="st-name"><i class="fa-solid fa-train-subway" style="color: var(--accent-cyan)"></i> ${item.stansiya}</span>
                    <span class="badge-percent">${pct}%</span>
                </div>
                <div class="st-metrics" style="margin-top: 14px;">
                    <div class="st-metric-item">
                        <span class="st-metric-label">Chiptalar</span>
                        <span class="st-metric-value" style="color: var(--accent-cyan);">${item.soni_val.toLocaleString()} ta</span>
                    </div>
                    <div class="st-metric-item">
                        <span class="st-metric-label">Tushum Summasi</span>
                        <span class="st-metric-value" style="color: var(--accent-emerald);">${formatMln(item.summa_val)} so'm</span>
                    </div>
                </div>
                <div class="progress-bar-bg" style="margin-top: 12px;">
                    <div class="progress-bar-fill" style="width: ${Math.min(pct * 3, 100)}%;"></div>
                </div>
            `;
            stationCardsGrid.appendChild(card);
        });
    }

    function renderDailyTable(dailyTrend) {
        if (!dailyTableBody) return;
        dailyTableBody.innerHTML = '';

        if (!dailyTrend || dailyTrend.length === 0) {
            dailyTableBody.innerHTML = '<tr><td colspan="5" class="empty-row">Kunlik ma&#39;lumot topilmadi</td></tr>';
            return;
        }

        dailyTrend.forEach(item => {
            const tr = document.createElement('tr');
            const onTix = item.online_tickets || 0;
            const onSum = item.online_summa || 0;
            const termTix = item.terminal_tickets || 0;
            const termSum = item.terminal_summa || 0;
            const uzTix = item.uzcard_tickets || 0;
            const huTix = item.humo_tickets || 0;
            const kassaTix = item.kassa_tickets || 0;
            const payTotal = onTix + termTix + kassaTix || item.tickets || 1;

            const onlinePct = (onTix / payTotal * 100).toFixed(1);
            const terminalPct = (termTix / payTotal * 100).toFixed(1);

            let tooltipDetail = `Online: ${onTix.toLocaleString()} ta (${(onSum / 1000000).toFixed(1)}M so'm) | Terminal: ${termTix.toLocaleString()} ta (${(termSum / 1000000).toFixed(1)}M so'm)`;
            if (uzTix > 0 || huTix > 0) {
                tooltipDetail += ` [Uzcard Terminal: ${uzTix.toLocaleString()} ta | Humo Terminal: ${huTix.toLocaleString()} ta]`;
            }

            tr.innerHTML = `
                <td><strong>${item.date}</strong></td>
                <td><strong>${item.tickets.toLocaleString('uz-UZ')} ta</strong></td>
                <td><strong style="color: var(--accent-emerald);">${Math.round(item.summa).toLocaleString('uz-UZ')} so'm</strong></td>
                <td>
                    <div class="payment-type-cell" title="${tooltipDetail}">
                        <div class="payment-type-track">
                            <div class="payment-type-fill online" style="width: ${onlinePct}%;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 11px; margin-top: 4px;">
                            <span style="color: var(--accent-cyan); font-weight: 600;" title="Online: karta raqami va SMS tasdiqlash kodi orqali (Hamkorbank, Payme, Stripe...)">
                                <i class="fa-solid fa-globe"></i> Online: ${onTix.toLocaleString()} ta (${onlinePct}%)
                            </span>
                            <span style="color: var(--accent-violet); font-weight: 600;" title="Terminal: Uzcard (${uzTix} ta) + Humo (${huTix} ta)">
                                <i class="fa-solid fa-credit-card"></i> Terminal: ${termTix.toLocaleString()} ta (${terminalPct}%)
                            </span>
                        </div>
                        ${(uzTix > 0 || huTix > 0) ? `
                        <div style="display: flex; gap: 6px; font-size: 10px; color: var(--text-muted); margin-top: 3px;">
                            <span style="background: rgba(99, 102, 241, 0.15); color: #818cf8; padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(99, 102, 241, 0.25);" title="Uzcard terminaldan xarid qilingan">Uzcard: ${uzTix.toLocaleString()}</span>
                            <span style="background: rgba(168, 85, 247, 0.15); color: #c084fc; padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(168, 85, 247, 0.25);" title="Humo terminaldan xarid qilingan (Uzkassa)">Humo: ${huTix.toLocaleString()}</span>
                        </div>` : ''}
                    </div>
                </td>
                <td><span class="status-badge"><i class="fa-solid fa-check"></i> Aniq</span></td>
            `;
            dailyTableBody.appendChild(tr);
        });
    }

    function renderComparisonView() {
        if (!fullBackendStats || !fullBackendStats.monthly_data) return;

        const baseCode = compBaseMonth ? compBaseMonth.value : '';
        const targetCode = compTargetMonth ? compTargetMonth.value : '';

        const baseData = fullBackendStats.monthly_data[baseCode];
        const targetData = fullBackendStats.monthly_data[targetCode];

        if (!baseData || !targetData) return;

        const revDiff = targetData.total_summa - baseData.total_summa;
        const revPct = baseData.total_summa > 0 ? ((revDiff / baseData.total_summa) * 100).toFixed(1) : 0;

        if (momRevGrowth) momRevGrowth.textContent = `${revDiff >= 0 ? '+' : ''}${formatCurrency(revDiff)}`;
        if (momRevBadge) {
            momRevBadge.className = revDiff >= 0 ? 'kpi-badge positive' : 'kpi-badge negative';
            momRevBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-${revDiff >= 0 ? 'up' : 'down'}"></i> ${revPct}%`;
        }

        const ticketDiff = targetData.total_tickets - baseData.total_tickets;
        const ticketPct = baseData.total_tickets > 0 ? ((ticketDiff / baseData.total_tickets) * 100).toFixed(1) : 0;

        if (momTicketGrowth) momTicketGrowth.textContent = `${ticketDiff >= 0 ? '+' : ''}${ticketDiff.toLocaleString('uz-UZ')} ta`;
        if (momTicketBadge) {
            momTicketBadge.className = ticketDiff >= 0 ? 'kpi-badge positive' : 'kpi-badge negative';
            momTicketBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-${ticketDiff >= 0 ? 'up' : 'down'}"></i> ${ticketPct}%`;
        }

        const baseMap = {};
        (baseData.stations || []).forEach(s => baseMap[s.email] = s.summa_val);

        let maxDiff = -Infinity;
        let topGrowingSt = '-';
        let topGrowingDiff = 0;

        (targetData.stations || []).forEach(s => {
            const bVal = baseMap[s.email] || 0;
            const diff = s.summa_val - bVal;
            if (diff > maxDiff) {
                maxDiff = diff;
                topGrowingSt = s.stansiya;
                topGrowingDiff = diff;
            }
        });

        if (momTopStation) momTopStation.textContent = topGrowingSt;
        if (momTopStationSub) momTopStationSub.textContent = `+${(topGrowingDiff / 1000000).toFixed(1)} mln so'm o'sish`;

        if (executiveSummaryText) {
            const baseMonthName = compBaseMonth ? compBaseMonth.options[compBaseMonth.selectedIndex].text : '';
            const targetMonthName = compTargetMonth ? compTargetMonth.options[compTargetMonth.selectedIndex].text : '';

            let trendText = revDiff >= 0 
                ? `tushum summasi <strong>+${(revDiff / 1000000).toFixed(1)} mln so'mga (+${revPct}%)</strong> hamda sotilgan chiptalar <strong>+${ticketDiff.toLocaleString()} taga (+${ticketPct}%)</strong> oshgan.`
                : `tushum summasi <strong>${(revDiff / 1000000).toFixed(1)} mln so'mga (${revPct}%)</strong> kamaygan.`;

            executiveSummaryText.innerHTML = `${baseMonthName} oyiga nisbatan ${targetMonthName} oyida kiosklar bo'yicha umumiy ${trendText} Eng yuqori o'sish <strong>${topGrowingSt}</strong> kassasida kuzatildi.`;
        }

        renderComparisonTable(baseData.stations || [], targetData.stations || []);
        renderComparisonChart(baseData.stations || [], targetData.stations || []);
    }

    function renderComparisonTable(baseStations, targetStations) {
        if (!comparisonTableBody) return;
        comparisonTableBody.innerHTML = '';

        const baseMap = {};
        baseStations.forEach(s => baseMap[s.email] = s.summa_val);

        targetStations.forEach((s, idx) => {
            const tr = document.createElement('tr');
            tr.className = 'clickable-station-row';
            tr.title = `${s.stansiya} kassa ma'lumotlarini ochish uchun bosing`;
            tr.onclick = () => openStationDetailsModal(s.stansiya);
            const baseSum = baseMap[s.email] || 0;
            const diffSum = s.summa_val - baseSum;
            const diffPct = baseSum > 0 ? ((diffSum / baseSum) * 100).toFixed(1) : 0;

            const isPos = diffSum >= 0;
            tr.innerHTML = `
                <td><strong>${idx + 1}</strong></td>
                <td><i class="fa-solid fa-location-dot" style="color: var(--accent-cyan); margin-right: 6px;"></i> <strong>${s.stansiya}</strong></td>
                <td>${Math.round(baseSum).toLocaleString('uz-UZ')} so'm</td>
                <td><strong style="color: var(--accent-emerald);">${Math.round(s.summa_val).toLocaleString('uz-UZ')} so'm</strong></td>
                <td><strong style="color: ${isPos ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">${isPos ? '+' : ''}${Math.round(diffSum).toLocaleString('uz-UZ')} so'm</strong></td>
                <td><span class="kpi-badge ${isPos ? 'positive' : 'negative'}"><i class="fa-solid fa-arrow-trend-${isPos ? 'up' : 'down'}"></i> ${isPos ? '+' : ''}${diffPct}%</span></td>
            `;
            comparisonTableBody.appendChild(tr);
        });
    }

    function renderComparisonChart(baseStations, targetStations) {
        const ctx = document.getElementById('comparisonChart');
        if (!ctx) return;

        if (comparisonChartInstance) {
            comparisonChartInstance.destroy();
        }

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const textColor = isLight ? '#475569' : '#94a3b8';
        const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';

        const baseMap = {};
        baseStations.forEach(s => baseMap[s.email] = s.summa_val);

        const labels = targetStations.map(s => s.stansiya);
        const baseValues = targetStations.map(s => baseMap[s.email] || 0);
        const targetValues = targetStations.map(s => s.summa_val);

        const baseMonthLabel = compBaseMonth ? compBaseMonth.options[compBaseMonth.selectedIndex].text : 'O\'tgan Oy';
        const targetMonthLabel = compTargetMonth ? compTargetMonth.options[compTargetMonth.selectedIndex].text : 'Hozirgi Oy';

        comparisonChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: baseMonthLabel,
                        data: baseValues,
                        backgroundColor: 'rgba(148, 163, 184, 0.4)',
                        borderColor: '#94a3b8',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: targetMonthLabel,
                        data: targetValues,
                        backgroundColor: 'rgba(56, 189, 248, 0.85)',
                        borderColor: '#38bdf8',
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                indexAxis: 'y', // Horizontal comparison
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ${Math.round(context.raw).toLocaleString('uz-UZ')} so'm`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: textColor,
                            font: { family: 'Plus Jakarta Sans', size: 11 },
                            callback: function(val) { return (val / 1000000).toFixed(0) + ' M'; }
                        },
                        grid: { color: gridColor }
                    },
                    y: {
                        ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function renderTrendChart(dailyTrend) {
        const ctx = document.getElementById('trendChart');
        if (!ctx) return;

        if (trendChartInstance) {
            trendChartInstance.destroy();
        }

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const textColor = isLight ? '#475569' : '#94a3b8';
        const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';

        const chartCtx = ctx.getContext('2d');
        const gradient = chartCtx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(52, 211, 153, 0.4)');
        gradient.addColorStop(1, 'rgba(52, 211, 153, 0.0)');

        const activeTrend = (dailyTrend || []).filter(d => d.tickets > 0);
        const labels = activeTrend.map(d => d.date);
        const ticketsData = activeTrend.map(d => d.tickets);

        trendChartInstance = new Chart(chartCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sotilgan Chiptalar Soni',
                    data: ticketsData,
                    borderColor: '#34d399',
                    borderWidth: 3,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 6,
                    pointBackgroundColor: '#34d399',
                    pointBorderColor: isLight ? '#ffffff' : '#090d16',
                    pointBorderWidth: 2,
                    pointHoverRadius: 9
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.95)',
                        titleColor: isLight ? '#0f172a' : '#f8fafc',
                        bodyColor: isLight ? '#334155' : '#e2e8f0',
                        borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                return ' Sotilgan: ' + context.raw.toLocaleString('uz-UZ') + ' ta chipta';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11 } },
                        grid: { display: false }
                    },
                    y: {
                        ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11 } },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    // Senior Executive PDF / Print Optimization Handlers
    window.addEventListener('beforeprint', () => {
        if (directorHorizontalChartInstance) {
            directorHorizontalChartInstance.resize();
        }
        if (directorShareChartInstance) {
            directorShareChartInstance.resize();
        }
    });

    window.addEventListener('afterprint', () => {
        if (directorHorizontalChartInstance) {
            directorHorizontalChartInstance.resize();
        }
        if (directorShareChartInstance) {
            directorShareChartInstance.resize();
        }
    });
});
