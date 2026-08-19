document.addEventListener('DOMContentLoaded', () => {
    let revenueChartInstance = null;
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

    // Overview KPIs
    const kpiTickets = document.getElementById('kpiTickets');
    const kpiSumma = document.getElementById('kpiSumma');
    const kpiTopStation = document.getElementById('kpiTopStation');
    const kpiTopStationVal = document.getElementById('kpiTopStationVal');
    const kpiRatio = document.getElementById('kpiRatio');
    const kpiRatioSub = document.getElementById('kpiRatioSub');

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
    const tableBody = document.getElementById('tableBody');
    const tableSearch = document.getElementById('tableSearch');
    const stationCardsGrid = document.getElementById('stationCardsGrid');
    const dailyTableBody = document.getElementById('dailyTableBody');

    // Admin Center Elements
    const mappingEditorGrid = document.getElementById('mappingEditorGrid');
    const saveMappingsTabBtn = document.getElementById('saveMappingsTabBtn');
    const uploadLogsTableBody = document.getElementById('uploadLogsTableBody');

    const sortSegmentButtons = document.querySelectorAll('.sort-btn');
    const sortableThs = document.querySelectorAll('.sortable-th');

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
        exportStationExcelBtn.addEventListener('click', () => {
            if (!currentActiveModalStation) return;
            showToast('info', 'Excel Yuklanmoqda...', `${currentActiveModalStation} kassa (${currentSelectedModalMonth}) hisoboti yuklanmoqda`);
            window.location.href = `/api/export-station-excel/${encodeURIComponent(currentActiveModalStation)}?month=${currentSelectedModalMonth}`;
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
        if (modalStSumma) modalStSumma.textContent = `${st.summa_val.toLocaleString('uz-UZ')} so'm`;
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
        if (modalStPeakSum) modalStPeakSum.textContent = peakDay.summa > 0 ? `${peakDay.summa.toLocaleString('uz-UZ')} so'm (${peakDay.tickets} ta)` : 'Sotuv bo\'lmagan';
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
                        <td style="text-align: right;"><span class="number-cell-summa" style="font-size: 12px; padding: 3px 8px;">${day.summa.toLocaleString('uz-UZ')} so'm</span></td>
                        <td style="text-align: right;"><span class="number-cell-avg" style="font-size: 12px; padding: 3px 8px;">${dayAvgP.toLocaleString('uz-UZ')} so'm</span></td>
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
    let isAdminLoggedIn = sessionStorage.getItem('kiosk-admin-auth') === 'true';
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

    if (tvModeBtn) {
        tvModeBtn.addEventListener('click', () => {
            document.body.classList.toggle('tv-mode');
            const isTv = document.body.classList.contains('tv-mode');
            tvModeBtn.innerHTML = isTv ? '<i class="fa-solid fa-compress"></i> Oddiy Rejim' : '<i class="fa-solid fa-tv"></i> TV Rejim';
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
            renderRevenueChart(getSortedStations());
            renderTrendChart(currentStats.daily_trend);
            renderComparisonView();
            if (fullBackendStats) {
                renderDirectorDashboard(fullBackendStats);
            }
        }
    }

    function updateAdminAuthStateUI() {
        const adminTabBtn = document.querySelector('.tab-btn[data-tab="tab-admin"]');
        const uploadSection = document.querySelector('.upload-section');
        const headerTokenBadge = document.getElementById('headerTokenBadge');
        
        if (adminTabBtn) adminTabBtn.style.display = 'inline-flex';

        if (adminAuthBtn) {
            if (isAdminLoggedIn) {
                adminAuthBtn.innerHTML = '<i class="fa-solid fa-lock-open" style="color: var(--accent-emerald);"></i> Admin Rejimida (Chiqish)';
                if (uploadSection) uploadSection.style.display = 'block';
                if (headerTokenBadge) headerTokenBadge.style.display = 'inline-flex';
            } else {
                adminAuthBtn.innerHTML = '<i class="fa-solid fa-user-shield"></i> Admin Kirish';
                if (uploadSection) uploadSection.style.display = 'none';
                if (headerTokenBadge) headerTokenBadge.style.display = 'none';
            }
        }
    }
    updateAdminAuthStateUI();

    function openAdminModal() {
        if (adminLoginModal) {
            adminLoginModal.style.display = 'flex';
            if (adminPasswordInput) {
                adminPasswordInput.value = '';
                adminPasswordInput.focus();
            }
            if (adminLoginError) adminLoginError.style.display = 'none';
        }
    }

    function closeAdminModal() {
        if (adminLoginModal) adminLoginModal.style.display = 'none';
    }

    if (adminAuthBtn) {
        adminAuthBtn.addEventListener('click', () => {
            if (isAdminLoggedIn) {
                isAdminLoggedIn = false;
                sessionStorage.removeItem('kiosk-admin-auth');
                updateAdminAuthStateUI();
                showToast('info', 'Admin Rejimi', 'Admin rejimida chiqildi.');
                const activeTab = document.querySelector('.tab-btn.active');
                if (activeTab && activeTab.getAttribute('data-tab') === 'tab-admin') {
                    const directorTabBtn = document.querySelector('.tab-btn[data-tab="tab-director"]');
                    if (directorTabBtn) directorTabBtn.click();
                }
            } else {
                openAdminModal();
            }
        });
    }

    if (closeAdminModalBtn) closeAdminModalBtn.addEventListener('click', closeAdminModal);
    if (cancelAdminModalBtn) cancelAdminModalBtn.addEventListener('click', closeAdminModal);

    function performAdminLogin() {
        const pwd = adminPasswordInput ? adminPasswordInput.value.trim() : '';
        if (!pwd) {
            if (adminLoginError) {
                adminLoginError.textContent = 'Parolni kiriting!';
                adminLoginError.style.display = 'block';
            }
            return;
        }

        fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pwd })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                isAdminLoggedIn = true;
                sessionStorage.setItem('kiosk-admin-auth', 'true');
                updateAdminAuthStateUI();
                closeAdminModal();

                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                const adminBtn = document.querySelector('.tab-btn[data-tab="tab-admin"]');
                const adminTab = document.getElementById('tab-admin');
                if (adminBtn) adminBtn.classList.add('active');
                if (adminTab) adminTab.classList.add('active');
                loadTokenData();
            } else {
                if (adminLoginError) {
                    adminLoginError.textContent = data.error || "Parol noto'g'ri!";
                    adminLoginError.style.display = 'block';
                }
            }
        })
        .catch(err => {
            if (adminLoginError) {
                adminLoginError.textContent = 'Xatolik yuz berdi!';
                adminLoginError.style.display = 'block';
            }
        });
    }

    if (submitAdminLoginBtn) submitAdminLoginBtn.addEventListener('click', performAdminLogin);
    if (adminPasswordInput) {
        adminPasswordInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') performAdminLogin();
        });
    }

    // Tab Switching with Admin Protection
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTabName = btn.getAttribute('data-tab');
            if (targetTabName === 'tab-admin' && !isAdminLoggedIn) {
                openAdminModal();
                return;
            }

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetTab = document.getElementById(targetTabName);
            if (targetTab) {
                targetTab.classList.add('active');
                if (targetTabName === 'tab-admin') {
                    loadTokenData();
                }
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

    sortableThs.forEach(th => {
        th.addEventListener('click', () => {
            const sortMode = th.getAttribute('data-sort-key');
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

        sortableThs.forEach(th => {
            if (th.getAttribute('data-sort-key') === mode) {
                th.classList.add('active');
            } else {
                th.classList.remove('active');
            }
        });

        if (currentStats) {
            const sortedStations = getSortedStations();
            renderTable(sortedStations, currentStats.total_summa);
            renderStationCards(sortedStations, currentStats.total_summa);
            renderRevenueChart(sortedStations);
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

    // Load Initial Data
    fetchStats();
    fetchMappings();
    fetchUploadLogs();

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
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0]);
            }
        });
    }

    function handleFileUpload(file) {
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            showToast('warning', 'Fayl Formati Xato', 'Iltimos, faqat Excel fayllarini (.xlsx, .xls) yuklang!');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        if (dropzoneContent) dropzoneContent.style.display = 'none';
        if (uploadSpinner) uploadSpinner.style.display = 'flex';

        fetch('/api/upload', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (uploadSpinner) uploadSpinner.style.display = 'none';
            if (dropzoneContent) dropzoneContent.style.display = 'block';

            if (data.success) {
                renderDashboard(data.stats);
                fetchUploadLogs();
                showToast('success', 'Muvaffaqiyatli', 'Hisobot muvaffaqiyatli shakllantirildi va ma\'lumotlar yangilandi!');
            } else {
                showToast('error', 'Yuklashda Xatolik', data.error || 'Noma\'lum xatolik');
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
        fetch('/api/stats')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    if (data.monthly_reports) {
                        monthlyReportsData = data.monthly_reports;
                    }
                    renderDashboard(data.stats);
                }
            })
            .catch(err => console.error(err));
    }

    function fetchMappings() {
        fetch('/api/mappings')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    currentMappings = data.mappings;
                    renderSettingsGrid(data.mappings);
                }
            });
    }

    function fetchUploadLogs() {
        fetch('/api/upload-logs')
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

        fetch('/api/mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

    function renderDashboard(stats) {
        fullBackendStats = stats;
        populatePeriodDropdowns(stats);
        applyPeriodFilter();
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
            ai_recommendation: `Hurmatli Rahbariyat, <strong>${periodTitle}</strong> bo'yicha kiosklar orqali jami <strong>${tSum.toLocaleString('uz-UZ')} so'm</strong> tushum hamda <strong>${tTix.toLocaleString('uz-UZ')} ta</strong> chipta sotildi. Bitta chiptaning o'rtacha narxi <strong>${avgP.toLocaleString('uz-UZ')} so'mni</strong> va kunlik o'rtacha tushum <strong>${dAvgS.toLocaleString('uz-UZ')} so'mni</strong> tashkil etdi. Eng savdoli kassa <strong>${topSt.stansiya}</strong> bo'lib, uning umumiy tushumdagi ulushi <strong>${topSt.share_percent}%</strong> ni tashkil qiladi. Eng yuqori kunlik savdo ko'rsatkichi <strong>${peakDay.date}</strong> sanasida (<strong>${(peakDay.summa || 0).toLocaleString('uz-UZ')} so'm</strong>) qayd etilgan.`
        };
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

        const periodBadges = document.querySelectorAll('.active-period-badge-label');
        periodBadges.forEach(el => { el.textContent = periodTitle; });

        renderDirectorDashboard(currentStats);
        renderActiveViews();
        renderComparisonView();
    }

    function renderActiveViews() {
        if (!currentStats) return;

        // KPI values
        if (kpiTickets) kpiTickets.textContent = currentStats.total_tickets.toLocaleString('uz-UZ') + ' ta';
        if (kpiSumma) kpiSumma.textContent = currentStats.total_summa.toLocaleString('uz-UZ') + ' so\'m';
        
        if (currentStats.stations && currentStats.stations.length > 0) {
            const topSt = [...currentStats.stations].sort((a, b) => b.summa_val - a.summa_val)[0];
            if (kpiTopStation) kpiTopStation.textContent = topSt.stansiya;
            if (kpiTopStationVal) kpiTopStationVal.textContent = `${topSt.soni_val.toLocaleString()} chipta (${(topSt.summa_val / 1000000).toFixed(1)} mln so'm)`;
        }

        // Payment ratio
        let onlineSum = 0;
        let terminalSum = 0;
        (currentStats.daily_trend || []).forEach(item => {
            onlineSum += item.online_tickets || 0;
            terminalSum += item.terminal_tickets || 0;
        });
        const grandPayTickets = onlineSum + terminalSum || 1;
        const onlinePct = ((onlineSum / grandPayTickets) * 100).toFixed(1);
        const terminalPct = ((terminalSum / grandPayTickets) * 100).toFixed(1);

        if (kpiRatio) kpiRatio.textContent = `${onlinePct}% / ${terminalPct}%`;
        if (kpiRatioSub) kpiRatioSub.textContent = `Online: ${onlineSum.toLocaleString()} | Terminal: ${terminalSum.toLocaleString()}`;

        // Render Views
        const sortedStations = getSortedStations();
        renderTable(sortedStations, currentStats.total_summa);
        renderStationCards(sortedStations, currentStats.total_summa);
        renderDailyTable(currentStats.daily_trend || []);
        renderRevenueChart(sortedStations);
        renderTrendChart(currentStats.daily_trend || []);
    }

    /* RAHBARIYAT DASHBOARD RENDERER (PURE BUSINESS METRICS) */
    function renderDirectorDashboard(stats) {
        if (!stats) return;
        const summary = stats.director_summary || {};
        const stations = stats.stations || [];

        // Real Executive KPIs
        if (dirKpiNetRevenue) dirKpiNetRevenue.textContent = `${(summary.net_revenue || stats.total_summa || 0).toLocaleString('uz-UZ')} so'm`;
        if (dirKpiTotalTickets) dirKpiTotalTickets.textContent = `${(summary.total_tickets || stats.total_tickets || 0).toLocaleString('uz-UZ')} ta`;

        // Card 3: Eng Yuqori Savdoli Kassa
        const topSt = (stations && stations.length > 0) ? stations[0] : null;
        if (dirKpiTopStationName) dirKpiTopStationName.textContent = topSt ? topSt.stansiya : (summary.top_station || '-');
        if (dirKpiTopStationShare) {
            const shPct = topSt ? topSt.share_percent : (summary.top_station_share || 0);
            dirKpiTopStationShare.innerHTML = `<i class="fa-solid fa-crown"></i> ${shPct}% ulush`;
        }
        if (dirKpiTopStationSum) {
            const sumVal = topSt ? topSt.summa_val : (summary.top_station_summa || 0);
            dirKpiTopStationSum.textContent = `${sumVal.toLocaleString('uz-UZ')} so'm`;
        }

        // Card 4: To'lov Turlari Nisbati (Online / Terminal)
        let onlineSum = 0;
        let terminalSum = 0;
        (currentStats && currentStats.daily_trend ? currentStats.daily_trend : (stats.daily_trend || [])).forEach(item => {
            onlineSum += item.online_tickets || 0;
            terminalSum += item.terminal_tickets || 0;
        });
        const grandPayTickets = onlineSum + terminalSum || 1;
        const onlinePct = ((onlineSum / grandPayTickets) * 100).toFixed(1);
        const terminalPct = ((terminalSum / grandPayTickets) * 100).toFixed(1);

        if (dirKpiPaymentRatio) dirKpiPaymentRatio.textContent = `${onlinePct}% / ${terminalPct}%`;
        if (dirKpiPaymentOnline) dirKpiPaymentOnline.innerHTML = `<i class="fa-solid fa-globe"></i> Online: ${onlineSum.toLocaleString()} ta`;
        if (dirKpiPaymentTerminal) dirKpiPaymentTerminal.textContent = `Terminal: ${terminalSum.toLocaleString()} ta`;

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
                            <span class="number-cell-summa">${st.summa_val.toLocaleString('uz-UZ')} so'm</span>
                        </td>
                        <td style="text-align: right;">
                            <span class="number-cell-avg">${avgP.toLocaleString('uz-UZ')} so'm</span>
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
                            <span class="number-cell-summa total">${grandSumma.toLocaleString('uz-UZ')} so'm</span>
                        </td>
                        <td style="text-align: right;">
                            <span class="number-cell-avg total">${grandAvgP.toLocaleString('uz-UZ')} so'm</span>
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

        // Sort descending by revenue for horizontal chart
        const sorted = [...stations].sort((a, b) => b.summa_val - a.summa_val);

        const labels = sorted.map((s, i) => `${i + 1}. ${s.stansiya}`);
        const data = sorted.map(s => s.summa_val);

        const chartCtx = ctx.getContext('2d');
        const gradient = chartCtx.createLinearGradient(0, 0, 400, 0);
        gradient.addColorStop(0, '#38bdf8');
        gradient.addColorStop(1, '#3b82f6');

        directorHorizontalChartInstance = new Chart(chartCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Tushum Summasi (So\'m)',
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
                                return ` Tushum: ${context.raw.toLocaleString('uz-UZ')} so'm (${(context.raw / 1000000).toFixed(1)} mln)`;
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
                                return ` ${context.label}: ${(context.raw / 1000000).toFixed(1)} mln so'm`;
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
            const card = document.createElement('div');
            card.className = 'target-card';
            card.innerHTML = `
                <h4><i class="fa-solid fa-envelope" style="color: var(--accent-violet)"></i> ${email}</h4>
                <div class="target-inputs-row" style="grid-template-columns: 1.5fr 1fr 1fr; margin-top: 10px;">
                    <div class="input-group">
                        <label>Stansiya Nomi</label>
                        <input type="text" class="input-control" data-email="${email}" data-field="station" value="${meta.station}">
                    </div>
                    <div class="input-group">
                        <label>Soni Ustuni</label>
                        <input type="number" class="input-control" data-email="${email}" data-field="col_soni" value="${meta.col_soni}">
                    </div>
                    <div class="input-group">
                        <label>Summa Ustuni</label>
                        <input type="number" class="input-control" data-email="${email}" data-field="col_summa" value="${meta.col_summa}">
                    </div>
                </div>
            `;
            mappingEditorGrid.appendChild(card);
        }
    }

    function renderUploadLogs(logs) {
        if (!uploadLogsTableBody) return;
        uploadLogsTableBody.innerHTML = '';

        if (!logs || logs.length === 0) {
            uploadLogsTableBody.innerHTML = '<tr><td colspan="5" class="empty-row">Audit tarixi topilmadi</td></tr>';
            return;
        }

        logs.forEach((log, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${idx + 1}</strong></td>
                <td><i class="fa-solid fa-file-excel" style="color: var(--accent-emerald); margin-right: 6px;"></i> <strong>${log.filename}</strong></td>
                <td><strong>${(log.rows || 0).toLocaleString()} ta qator</strong></td>
                <td>${log.timestamp}</td>
                <td><span class="status-badge" style="display: inline-flex;"><i class="fa-solid fa-check"></i> ${log.status}</span></td>
            `;
            uploadLogsTableBody.appendChild(tr);
        });
    }

    function renderTable(stations, totalSumma) {
        if (!tableBody) return;
        tableBody.innerHTML = '';
        if (!stations || stations.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="empty-row">Ma&#39;lumot topilmadi</td></tr>';
            return;
        }

        stations.forEach((item, idx) => {
            const tr = document.createElement('tr');
            tr.className = 'clickable-station-row';
            tr.title = `${item.stansiya} kassa ma'lumotlarini ochish uchun bosing`;
            tr.onclick = () => openStationDetailsModal(item.stansiya);
            const pct = totalSumma > 0 ? ((item.summa_val / totalSumma) * 100).toFixed(1) : 0;

            tr.innerHTML = `
                <td><strong>${idx + 1}</strong></td>
                <td><i class="fa-solid fa-location-dot" style="color: var(--accent-cyan); margin-right: 6px;"></i> <strong>${item.stansiya}</strong></td>
                <td><strong>${item.soni_val.toLocaleString('uz-UZ')} ta</strong></td>
                <td><strong style="color: var(--accent-emerald);">${item.summa_val.toLocaleString('uz-UZ')} so'm</strong></td>
                <td><span class="badge-percent">${pct}%</span></td>
            `;
            tableBody.appendChild(tr);
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
                        <span class="st-metric-value" style="color: var(--accent-emerald);">${(item.summa_val / 1000000).toFixed(1)} mln so'm</span>
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
            dailyTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Kunlik ma&#39;lumot topilmadi</td></tr>';
            return;
        }

        dailyTrend.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.date}</strong></td>
                <td><strong>${item.tickets.toLocaleString('uz-UZ')} ta</strong></td>
                <td><strong style="color: var(--accent-emerald);">${item.summa.toLocaleString('uz-UZ')} so'm</strong></td>
                <td><span style="color: var(--accent-cyan); font-weight: 600;">${item.online_tickets.toLocaleString()} (${(item.online_summa / 1000000).toFixed(1)}M)</span></td>
                <td><span style="color: var(--accent-violet); font-weight: 600;">${item.terminal_tickets.toLocaleString()} (${(item.terminal_summa / 1000000).toFixed(1)}M)</span></td>
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

        if (momRevGrowth) momRevGrowth.textContent = `${revDiff >= 0 ? '+' : ''}${revDiff.toLocaleString('uz-UZ')} so'm`;
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
                <td>${baseSum.toLocaleString('uz-UZ')} so'm</td>
                <td><strong style="color: var(--accent-emerald);">${s.summa_val.toLocaleString('uz-UZ')} so'm</strong></td>
                <td><strong style="color: ${isPos ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">${isPos ? '+' : ''}${diffSum.toLocaleString('uz-UZ')} so'm</strong></td>
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
                                return ` ${context.dataset.label}: ${context.raw.toLocaleString('uz-UZ')} so'm`;
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

    /* HORIZONTAL REVENUE CHART IN OVERVIEW TAB */
    function renderRevenueChart(stations) {
        const ctx = document.getElementById('revenueChart');
        if (!ctx) return;

        if (revenueChartInstance) {
            revenueChartInstance.destroy();
        }

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const textColor = isLight ? '#475569' : '#94a3b8';
        const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';

        const chartCtx = ctx.getContext('2d');
        const gradient = chartCtx.createLinearGradient(0, 0, 400, 0);
        gradient.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.7)');

        const sorted = [...stations].sort((a, b) => b.summa_val - a.summa_val);
        const labels = sorted.map((s, i) => `${i + 1}. ${s.stansiya}`);
        const data = currentSortMode === 'soni' ? sorted.map(s => s.soni_val) : sorted.map(s => s.summa_val);
        const labelText = currentSortMode === 'soni' ? 'Sotilgan Chiptalar Soni' : 'Tushgan Summa (so\'m)';

        revenueChartInstance = new Chart(chartCtx, {
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
                    barThickness: 16
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
                                    return ' Chiptalar: ' + context.raw.toLocaleString('uz-UZ') + ' ta';
                                }
                                return ' Tushum: ' + context.raw.toLocaleString('uz-UZ') + ' so\'m';
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

    /* --- BEARER TOKEN & API AUTO SYNC MANAGEMENT --- */
    const bearerTokenInput = document.getElementById('bearerTokenInput');
    const csrfTokenInput = document.getElementById('csrfTokenInput');
    const saveTokenBtn = document.getElementById('saveTokenBtn');
    const checkTokenHealthBtn = document.getElementById('checkTokenHealthBtn');
    const tokenStatusDot = document.getElementById('tokenStatusDot');
    const tokenStatusText = document.getElementById('tokenStatusText');

    const apiStartDate = document.getElementById('apiStartDate');
    const apiEndDate = document.getElementById('apiEndDate');
    const fetchApiDataBtn = document.getElementById('fetchApiDataBtn');
    const apiSyncProgress = document.getElementById('apiSyncProgress');
    const apiSyncProgressText = document.getElementById('apiSyncProgressText');
    const apiSyncStatusAlert = document.getElementById('apiSyncStatusAlert');

    // Default dates setup (Current Month start and today/end of month)
    if (apiStartDate && apiEndDate) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        
        apiStartDate.value = `${year}-${month}-01`;
        
        const lastDayOfMonth = new Date(year, now.getMonth() + 1, 0).getDate();
        const endDayStr = String(lastDayOfMonth).padStart(2, '0');
        apiEndDate.value = `${year}-${month}-${endDayStr}`;
    }

    function updateTokenHealthUI(health) {
        const headerTokenDot = document.getElementById('headerTokenDot');
        const headerTokenText = document.getElementById('headerTokenText');

        if (tokenStatusDot) tokenStatusDot.className = 'status-dot-indicator';
        if (headerTokenDot) headerTokenDot.className = 'status-dot-indicator';

        if (!health) {
            if (tokenStatusDot) tokenStatusDot.classList.add('red');
            if (headerTokenDot) headerTokenDot.classList.add('red');
            if (tokenStatusText) {
                tokenStatusText.style.color = 'var(--accent-rose)';
                tokenStatusText.textContent = 'Token kiritilmagan';
            }
            if (headerTokenText) {
                headerTokenText.style.color = 'var(--accent-rose)';
                headerTokenText.textContent = 'Token kiritilmagan';
            }
            return;
        }

        if (health.valid) {
            if (tokenStatusDot) tokenStatusDot.classList.add('green');
            if (headerTokenDot) headerTokenDot.classList.add('green');

            const textVal = health.message || 'Faol (Token yaroqli)';
            if (tokenStatusText) {
                tokenStatusText.style.color = 'var(--accent-emerald)';
                tokenStatusText.textContent = textVal;
            }
            if (headerTokenText) {
                headerTokenText.style.color = 'var(--accent-emerald)';
                headerTokenText.textContent = `Token: ${health.expires_in_minutes}m qoldi`;
            }
        } else {
            if (tokenStatusDot) tokenStatusDot.classList.add('red');
            if (headerTokenDot) headerTokenDot.classList.add('red');

            const errVal = health.message || "Muddati o'tgan / Noto'g'ri";
            if (tokenStatusText) {
                tokenStatusText.style.color = 'var(--accent-rose)';
                tokenStatusText.textContent = errVal;
            }
            if (headerTokenText) {
                headerTokenText.style.color = 'var(--accent-rose)';
                headerTokenText.textContent = "Token tugagan";
            }
        }
    }

    const headerTokenBadge = document.getElementById('headerTokenBadge');
    if (headerTokenBadge) {
        headerTokenBadge.addEventListener('click', () => {
            const adminTabBtn = document.querySelector('.tab-btn[data-tab="tab-admin"]');
            if (adminTabBtn) adminTabBtn.click();
        });
    }

    function loadTokenData() {
        if (!isAdminLoggedIn) return;
        fetch('/api/admin/token')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    if (bearerTokenInput && data.token) {
                        bearerTokenInput.value = data.token;
                    }
                    if (csrfTokenInput && data.csrf_token) {
                        csrfTokenInput.value = data.csrf_token;
                    }
                    updateTokenHealthUI(data.health);
                }
            })
            .catch(err => console.error("loadTokenData error:", err));
    }

    function checkTokenHealth() {
        if (!tokenStatusDot || !tokenStatusText) return;
        
        tokenStatusDot.className = 'status-dot-indicator yellow';
        tokenStatusText.style.color = 'var(--accent-amber)';
        tokenStatusText.textContent = 'Holat tekshirilmoqda...';

        const icon = checkTokenHealthBtn ? checkTokenHealthBtn.querySelector('i') : null;
        if (icon) icon.classList.add('fa-spin');

        fetch('/api/admin/token-health')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    updateTokenHealthUI(data.health);
                    showToast(
                        data.health.valid ? 'success' : 'warning',
                        'Token Holati Audit Qilindi',
                        data.health.message
                    );
                }
            })
            .catch(err => {
                tokenStatusDot.className = 'status-dot-indicator red';
                tokenStatusText.style.color = 'var(--accent-rose)';
                tokenStatusText.textContent = 'Tekshirishda xatolik';
                console.error("checkTokenHealth error:", err);
            })
            .finally(() => {
                if (icon) icon.classList.remove('fa-spin');
            });
    }

    function saveToken() {
        const tokenVal = bearerTokenInput ? bearerTokenInput.value.trim() : '';
        const csrfVal = csrfTokenInput ? csrfTokenInput.value.trim() : '';
        if (!tokenVal) {
            showToast('warning', 'Ogohlantirish', 'Iltimos, Bearer Token matnini kiriting!');
            return;
        }

        saveTokenBtn.disabled = true;
        saveTokenBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saqlanmoqda...';

        fetch('/api/admin/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokenVal, csrf_token: csrfVal })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    updateTokenHealthUI(data.health);
                    showToast('success', 'Muvaffaqiyatli', 'Bearer va CSRF Token saqlandi!');
                } else {
                    showToast('error', 'Xatolik', data.error || 'Tokenni saqlashda xatolik yuz berdi');
                }
            })
            .catch(err => {
                showToast('error', 'Xatolik', 'Server bilan ulanishda xatolik: ' + err);
            })
            .finally(() => {
                saveTokenBtn.disabled = false;
                saveTokenBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Tokenlarni Saqlash';
            });
    }

    function fetchApiData() {
        const startDate = apiStartDate ? apiStartDate.value : '';
        const endDate = apiEndDate ? apiEndDate.value : '';
        const customToken = bearerTokenInput ? bearerTokenInput.value.trim() : '';
        const customCsrf = csrfTokenInput ? csrfTokenInput.value.trim() : '';

        if (!startDate || !endDate) {
            showToast('warning', 'Sana Tanlanmagan', 'Iltimos, boshlanish va tugash sanasini tanlang!');
            return;
        }

        if (apiSyncProgress) apiSyncProgress.style.display = 'flex';
        if (apiSyncStatusAlert) apiSyncStatusAlert.style.display = 'none';
        fetchApiDataBtn.disabled = true;
        fetchApiDataBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yuklanmoqda...';

        fetch('/api/admin/fetch-api-excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: startDate, endDate: endDate, token: customToken, csrf_token: customCsrf })
        })
            .then(res => res.json().then(d => ({ status: res.status, body: d })))
            .then(({ status, body }) => {
                if (body.success) {
                    if (apiSyncStatusAlert) {
                        apiSyncStatusAlert.style.display = 'block';
                        apiSyncStatusAlert.style.background = 'rgba(52, 211, 153, 0.15)';
                        apiSyncStatusAlert.style.border = '1px solid rgba(52, 211, 153, 0.3)';
                        apiSyncStatusAlert.style.color = 'var(--accent-emerald)';
                        apiSyncStatusAlert.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${body.message}`;
                    }
                    showToast('success', 'API Avto-Yangilash Muvaffaqiyatli', body.message);
                    
                    if (body.stats) {
                        updateDashboardUI(body.stats);
                    } else {
                        loadStats();
                    }
                    loadUploadLogs();
                } else {
                    let errTitle = 'API Yangilash Xatoligi';
                    if (status === 504) errTitle = '504 Gateway Time-out';
                    else if (status === 401) errTitle = '401 Unauthorized (Token Muddati Tugagan)';

                    if (apiSyncStatusAlert) {
                        apiSyncStatusAlert.style.display = 'block';
                        apiSyncStatusAlert.style.background = 'rgba(244, 63, 94, 0.15)';
                        apiSyncStatusAlert.style.border = '1px solid rgba(244, 63, 94, 0.3)';
                        apiSyncStatusAlert.style.color = 'var(--accent-rose)';
                        apiSyncStatusAlert.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>${errTitle}:</strong> ${body.error}`;
                    }
                    showToast('error', errTitle, body.error || "API dan ma'lumot olishda xatolik");
                }
            })
            .catch(err => {
                if (apiSyncStatusAlert) {
                    apiSyncStatusAlert.style.display = 'block';
                    apiSyncStatusAlert.style.background = 'rgba(244, 63, 94, 0.15)';
                    apiSyncStatusAlert.style.border = '1px solid rgba(244, 63, 94, 0.3)';
                    apiSyncStatusAlert.style.color = 'var(--accent-rose)';
                    apiSyncStatusAlert.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Ulanish xatoligi: ${err}`;
                }
                showToast('error', 'Ulanish Xatoligi', "Server bilan bog'lanishda xatolik: " + err);
            })
            .finally(() => {
                if (apiSyncProgress) apiSyncProgress.style.display = 'none';
                fetchApiDataBtn.disabled = false;
                fetchApiDataBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> API\'dan Ma\'lumotlarni Yangilash';
            });
    }

    if (saveTokenBtn) saveTokenBtn.addEventListener('click', saveToken);
    if (checkTokenHealthBtn) checkTokenHealthBtn.addEventListener('click', checkTokenHealth);
    if (fetchApiDataBtn) fetchApiDataBtn.addEventListener('click', fetchApiData);

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
