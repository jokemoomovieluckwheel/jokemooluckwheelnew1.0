const STORAGE_KEY = 'wheel_codes';
        const TRASH_KEY = 'wheel_codes_trash';
        const DEFAULT_EXPIRY_DAYS = 7;
        const TRASH_EXPIRY_MS = 24 * 60 * 60 * 1000; // 1 วัน แล้วลบถาวร
        let selectedCodes = new Set();
        const API_BASE = (typeof window.__API_BASE__ === 'string' && window.__API_BASE__.trim())
            ? window.__API_BASE__.trim().replace(/\/$/, '')
            : (window.location.protocol === 'http:' || window.location.protocol === 'https:' ? window.location.origin : '');
        let codesCache = [];

        function showConfirm(message, title = 'ยืนยันการดำเนินการ', icon = '⚠️', isDanger = true) {
            return new Promise((resolve) => {
                const modal = document.getElementById('confirmModal');
                const titleEl = document.getElementById('confirmTitle');
                const messageEl = document.getElementById('confirmMessage');
                const iconEl = document.getElementById('confirmIcon');
                const okBtn = document.getElementById('confirmOk');
                const cancelBtn = document.getElementById('confirmCancel');

                titleEl.textContent = title;
                messageEl.textContent = message;
                iconEl.textContent = icon;
                
                if (isDanger) {
                    okBtn.classList.remove('primary');
                } else {
                    okBtn.classList.add('primary');
                }

                modal.classList.add('show');

                const handleOk = () => {
                    modal.classList.remove('show');
                    cleanup();
                    resolve(true);
                };

                const handleCancel = () => {
                    modal.classList.remove('show');
                    cleanup();
                    resolve(false);
                };

                const handleBackdrop = (e) => {
                    if (e.target === modal) {
                        handleCancel();
                    }
                };

                const cleanup = () => {
                    okBtn.removeEventListener('click', handleOk);
                    cancelBtn.removeEventListener('click', handleCancel);
                    modal.removeEventListener('click', handleBackdrop);
                };

                okBtn.addEventListener('click', handleOk);
                cancelBtn.addEventListener('click', handleCancel);
                modal.addEventListener('click', handleBackdrop);
            });
        }

        function getCodes() {
            if (API_BASE) return codesCache;
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        }

        async function loadCodesFromApi() {
            if (!API_BASE) return getCodes();
            try {
                const res = await fetch(API_BASE + '/api/codes');
                const data = await res.json().catch(() => ({}));
                codesCache = Array.isArray(data.codes) ? data.codes : [];
                return codesCache;
            } catch (e) {
                return codesCache;
            }
        }

        function saveCodes(codes) {
            if (API_BASE) return;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
        }

        function getTrash() {
            const data = localStorage.getItem(TRASH_KEY);
            return data ? JSON.parse(data) : [];
        }

        function saveTrash(trash) {
            localStorage.setItem(TRASH_KEY, JSON.stringify(trash));
        }

        function purgeExpiredTrash() {
            const trash = getTrash();
            const now = new Date().getTime();
            const stillValid = trash.filter(item => {
                const movedAt = item.movedToTrashAt ? new Date(item.movedToTrashAt).getTime() : 0;
                return (now - movedAt) < TRASH_EXPIRY_MS;
            });
            if (stillValid.length !== trash.length) {
                saveTrash(stillValid);
                return trash.length - stillValid.length;
            }
            return 0;
        }

        function getTrashTimeLeft(movedToTrashAt) {
            if (!movedToTrashAt) return { ms: 0, text: '', class: 'expired' };
            const now = new Date().getTime();
            const movedAt = new Date(movedToTrashAt).getTime();
            const expiresAt = movedAt + TRASH_EXPIRY_MS;
            let ms = expiresAt - now;
            if (ms <= 0) return { ms: 0, text: 'ลบถาวรแล้ว', class: 'expired' };
            const seconds = Math.floor((ms / 1000) % 60);
            const minutes = Math.floor((ms / (1000 * 60)) % 60);
            const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
            const days = Math.floor(ms / (1000 * 60 * 60 * 24));
            const parts = [];
            if (days > 0) parts.push(days + ' วัน');
            parts.push(hours + ' ชม.');
            parts.push(minutes + ' นาที');
            parts.push(seconds + ' วินาที');
            const text = 'ลบถาวรใน ' + parts.join(' ');
            const class_ = ms < 60 * 60 * 1000 ? 'soon' : '';
            return { ms, text, class: class_ };
        }

        function moveExpiredToTrash() {
            const codes = getCodes();
            const now = new Date().getTime();
            const stillValid = [];
            const trash = getTrash();
            let moved = 0;
            codes.forEach(c => {
                const expiresAt = c.expiresAt ? new Date(c.expiresAt).getTime() : null;
                if (expiresAt && expiresAt < now) {
                    trash.push({
                        ...c,
                        movedToTrashAt: new Date().toISOString(),
                        restoredOnce: c.restoredOnce || false
                    });
                    moved++;
                } else {
                    stillValid.push(c);
                }
            });
            if (moved > 0) {
                saveCodes(stillValid);
                saveTrash(trash);
            }
            return moved;
        }

        async function restoreFromTrash(code) {
            const trash = getTrash();
            const item = trash.find(t => t.code === code);
            if (!item) return;
            if (item.restoredOnce) {
            const codes = getCodes();
                showToast('โค้ดนี้กู้คืนได้เพียง 1 ครั้ง', 'error');
                return;
            }
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + DEFAULT_EXPIRY_DAYS);
            const toRestore = {
                code: item.code,
                spins: item.spins,
                maxSpins: item.maxSpins,
                history: item.history || [],
                createdAt: item.createdAt,
                expiresAt: expiresAt.toISOString(),
                restoredOnce: true
            };
            if (API_BASE) {
                try {
                    const res = await fetch(API_BASE + '/api/codes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ codes: [toRestore] })
                    });
                    if (!res.ok) {
                        showToast('กู้คืนบนเซิร์ฟเวอร์ไม่สำเร็จ', 'error');
                        return;
                    }
                    await loadCodesFromApi();
                } catch (e) {
                    showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์', 'error');
                    return;
                }
            } else {
                const codes = getCodes();
                codes.push(toRestore);
                saveCodes(codes);
            }
            saveTrash(trash.filter(t => t.code !== code));
            renderCodeList();
            renderTrashList();
            updateStats();
            showToast('✅ กู้คืนโค้ด ' + code + ' แล้ว');
        }

        function deleteFromTrash(code) {
            const trash = getTrash().filter(t => t.code !== code);
            saveTrash(trash);
            renderTrashList();
            showToast('🗑️ ลบออกจากถังขยะแล้ว');
        }

        function generateRandomCode(length) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let code = '';
            for (let i = 0; i < length; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return code;
        }

        async function generateCodes() {
            const length = parseInt(document.getElementById('codeLength').value);
            const spins = parseInt(document.getElementById('spinCount').value);
            const count = parseInt(document.getElementById('codeCount').value);

            if (spins < 1 || count < 1) {
                showToast('กรุณากรอกข้อมูลให้ถูกต้อง', 'error');
                return;
            }

            const codes = getCodes();
            const existingCodes = new Set(codes.map(c => c.code));
            const toCreate = [];
            const expiryDays = parseInt(document.getElementById('expiryDays').value) || DEFAULT_EXPIRY_DAYS;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + Math.max(1, Math.min(365, expiryDays)));

            for (let i = 0; i < count; i++) {
                let newCode;
                let attempts = 0;
                do {
                    newCode = generateRandomCode(length);
                    attempts++;
                } while (existingCodes.has(newCode) && attempts < 100);

                if (!existingCodes.has(newCode)) {
                    existingCodes.add(newCode);
                    toCreate.push({
                        code: newCode,
                        spins: spins,
                        maxSpins: spins,
                        history: [],
                        createdAt: new Date().toISOString(),
                        expiresAt: expiresAt.toISOString(),
                        restoredOnce: false
                    });
                }
            }

            if (API_BASE && toCreate.length > 0) {
                try {
                    const res = await fetch(API_BASE + '/api/codes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ codes: toCreate })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        showToast(data.error || 'ส่งโค้ดไปเซิร์ฟเวอร์ไม่สำเร็จ', 'error');
                        return;
                    }
                    await loadCodesFromApi();
                } catch (e) {
                    showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ API', 'error');
                    return;
                }
            } else if (!API_BASE) {
                toCreate.forEach(c => codes.push(c));
                saveCodes(codes);
            }

            renderCodeList();
            updateStats();

            if (toCreate.length > 0) {
                const newCodes = toCreate.map(c => c.code);
                const textToCopy = newCodes.join('\n');
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showToast(newCodes.length === 1
                        ? `✅ สร้างโค้ดสำเร็จ และคัดลอกแล้ว: ${newCodes[0]}`
                        : `✅ สร้างโค้ดสำเร็จ ${newCodes.length} รายการ และคัดลอกแล้ว`);
                }).catch(() => {
                    showToast(`✅ สร้างโค้ดสำเร็จ ${newCodes.length} รายการ`);
                });
            } else {
                showToast('ไม่สามารถสร้างโค้ดใหม่ได้ (อาจซ้ำกับที่มีอยู่)', 'error');
            }
        }

        async function deleteCode(code) {
            const confirmed = await showConfirm(
                `ต้องการลบโค้ด ${code} หรือไม่? โค้ดจะย้ายไปถังขยะและกู้คืนได้ 1 ครั้ง`,
                'ยืนยันการลบ',
                '🗑️'
            );
            if (!confirmed) return;
            
            const codes = getCodes();
            const item = codes.find(c => c.code === code);
            if (item) {
                const trash = getTrash();
                trash.push({
                    ...item,
                    movedToTrashAt: new Date().toISOString(),
                    restoredOnce: item.restoredOnce || false
                });
                saveTrash(trash);
                if (API_BASE) {
                    try {
                        await fetch(API_BASE + '/api/codes/' + encodeURIComponent(code), { method: 'DELETE' });
                        await loadCodesFromApi();
                    } catch (e) {
                        showToast('ลบบนเซิร์ฟเวอร์ไม่สำเร็จ', 'error');
                    }
                } else {
                    saveCodes(codes.filter(c => c.code !== code));
                }
            }
            selectedCodes.delete(code);
            renderCodeList();
            renderTrashList();
            updateStats();
            showToast('🗑️ ย้ายโค้ดไปถังขยะแล้ว');
        }

        async function deleteAllCodes() {
            const codes = getCodes();
            if (codes.length === 0) {
                showToast('ไม่มีโค้ดให้ลบ', 'error');
                return;
            }
            const confirmed = await showConfirm(
                `ต้องการลบโค้ดทั้งหมด ${codes.length} รายการหรือไม่? โค้ดจะย้ายไปถังขยะ`,
                'ลบโค้ดทั้งหมด',
                '⚠️'
            );
            if (!confirmed) return;
            
            const trash = getTrash();
            codes.forEach(c => {
                trash.push({
                    ...c,
                    movedToTrashAt: new Date().toISOString(),
                    restoredOnce: c.restoredOnce || false
                });
            });
            saveTrash(trash);
            if (API_BASE) {
                try {
                    for (const c of codes) {
                        await fetch(API_BASE + '/api/codes/' + encodeURIComponent(c.code), { method: 'DELETE' });
                    }
                    await loadCodesFromApi();
                } catch (e) {
                    showToast('ลบบางรายการบนเซิร์ฟเวอร์ไม่สำเร็จ', 'error');
                }
            } else {
                saveCodes([]);
            }
            selectedCodes.clear();
            renderCodeList();
            renderTrashList();
            updateStats();
            showToast('🗑️ ย้ายโค้ดทั้งหมดไปถังขยะแล้ว');
        }

        async function deleteSelectedCodes() {
            if (selectedCodes.size === 0) {
                showToast('กรุณาเลือกโค้ดที่ต้องการลบ', 'error');
                return;
            }
            const confirmed = await showConfirm(
                `ต้องการลบโค้ดที่เลือก ${selectedCodes.size} รายการหรือไม่? โค้ดจะย้ายไปถังขยะ`,
                'ลบโค้ดที่เลือก',
                '🗑️'
            );
            if (!confirmed) return;
            
            const codes = getCodes();
            const trash = getTrash();
            const toDelete = [];
            codes.forEach(c => {
                if (selectedCodes.has(c.code)) {
                    trash.push({
                        ...c,
                        movedToTrashAt: new Date().toISOString(),
                        restoredOnce: c.restoredOnce || false
                    });
                    toDelete.push(c.code);
                }
            });
            saveTrash(trash);
            if (API_BASE) {
                try {
                    for (const code of toDelete) {
                        await fetch(API_BASE + '/api/codes/' + encodeURIComponent(code), { method: 'DELETE' });
                    }
                    await loadCodesFromApi();
                } catch (e) {
                    showToast('ลบบางรายการบนเซิร์ฟเวอร์ไม่สำเร็จ', 'error');
                }
            } else {
                const remaining = codes.filter(c => !selectedCodes.has(c.code));
                saveCodes(remaining);
            }
            selectedCodes.clear();
            renderCodeList();
            renderTrashList();
            updateStats();
            showToast('🗑️ ย้ายโค้ดที่เลือกไปถังขยะแล้ว');
        }

        function toggleCodeSelection(code, checkbox) {
            if (checkbox.checked) {
                selectedCodes.add(code);
            } else {
                selectedCodes.delete(code);
            }
            updateSelectedUI();
        }

        function toggleSelectAll() {
            const selectAllCheckbox = document.getElementById('selectAll');
            const codes = getCodes();
            
            if (selectAllCheckbox.checked) {
                codes.forEach(c => selectedCodes.add(c.code));
            } else {
                selectedCodes.clear();
            }
            
            document.querySelectorAll('.code-checkbox-item').forEach(cb => {
                cb.checked = selectAllCheckbox.checked;
            });
            
            updateSelectedUI();
        }

        function updateSelectedUI() {
            const count = selectedCodes.size;
            document.getElementById('selectedCount').textContent = count;
            const btn = document.getElementById('btnDeleteSelected');
            if (count > 0) {
                btn.classList.add('show');
            } else {
                btn.classList.remove('show');
            }
            
            document.querySelectorAll('.code-card').forEach(card => {
                const code = card.dataset.code;
                if (selectedCodes.has(code)) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            });
        }

        function copyCode(code) {
            navigator.clipboard.writeText(code).then(() => {
                showToast('📋 คัดลอกโค้ดแล้ว: ' + code);
            });
        }

        function viewHistory(code) {
            const codes = getCodes();
            const codeData = codes.find(c => c.code === code);
            if (!codeData) return;

            document.getElementById('modalCode').textContent = codeData.code;
            document.getElementById('modalSpinsUsed').textContent = codeData.maxSpins - codeData.spins;
            document.getElementById('modalSpinsLeft').textContent = codeData.spins;

            const historyContainer = document.getElementById('modalHistory');
            const history = codeData.history || [];

            if (history.length === 0) {
                historyContainer.innerHTML = '<div class="no-history">ยังไม่มีประวัติการสุ่ม</div>';
            } else {
                historyContainer.innerHTML = history.map(item => {
                    const isMiss = item.prize.toLowerCase().includes('miss');
                    const date = new Date(item.time).toLocaleString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    return `
                        <div class="modal-history-item">
                            <div class="prize">
                                <span class="dot ${isMiss ? 'miss' : 'win'}"></span>
                                ${item.prize}
                            </div>
                            <div class="time">${date}</div>
                        </div>
                    `;
                }).reverse().join('');
            }

            document.getElementById('historyModal').classList.add('show');
        }

        function closeModal() {
            document.getElementById('historyModal').classList.remove('show');
        }

        function getExpiryText(item) {
            if (!item.expiresAt) return { text: 'ไม่มีกำหนด', class: '' };
            const now = new Date();
            const exp = new Date(item.expiresAt);
            if (exp.getTime() <= now.getTime()) return { text: 'หมดอายุ', class: 'expired' };
            const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
            if (daysLeft <= 1) return { text: 'หมดอายุภายใน 1 วัน', class: 'soon' };
            return { text: 'หมดอายุใน ' + daysLeft + ' วัน', class: '' };
        }

        function getCountdownString(expiresAt) {
            if (!expiresAt) return 'ไม่มีกำหนด';
            const now = new Date().getTime();
            const exp = new Date(expiresAt).getTime();
            let ms = exp - now;
            if (ms <= 0) return 'หมดอายุ';
            const seconds = Math.floor((ms / 1000) % 60);
            const minutes = Math.floor((ms / (1000 * 60)) % 60);
            const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
            const days = Math.floor(ms / (1000 * 60 * 60 * 24));
            const parts = [];
            if (days > 0) parts.push(days + ' วัน');
            parts.push(hours + ' ชม.');
            parts.push(minutes + ' นาที');
            parts.push(seconds + ' วินาที');
            return 'เหลืออีก ' + parts.join(' ');
        }

        function updateAllCountdowns() {
            const elements = document.querySelectorAll('.countdown-text[data-expires]');
            let anyExpired = false;
            elements.forEach(el => {
                const expiresAt = el.getAttribute('data-expires');
                if (!expiresAt) return;
                const now = new Date().getTime();
                const exp = new Date(expiresAt).getTime();
                if (exp <= now) {
                    anyExpired = true;
                    el.textContent = 'หมดอายุ';
                    el.classList.add('expired');
                    return;
                }
                el.textContent = getCountdownString(expiresAt);
                el.classList.remove('expired');
                if ((exp - now) < 24 * 60 * 60 * 1000) el.classList.add('soon');
                else el.classList.remove('soon');
            });
            if (anyExpired) {
                moveExpiredToTrash();
                renderCodeList();
                updateStats();
            }
        }

        function renderCodeList() {
            moveExpiredToTrash();
            const codes = getCodes();
            const container = document.getElementById('codeList');
            const selectAllRow = document.getElementById('selectAllRow');

            if (codes.length === 0) {
                selectAllRow.style.display = 'none';
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="icon">🎫</div>
                        <p>ยังไม่มีโค้ด กรุณาสร้างโค้ดใหม่</p>
                    </div>
                `;
                selectedCodes.clear();
                updateSelectedUI();
                renderTrashList();
                return;
            }

            selectAllRow.style.display = 'flex';
            const sortedCodes = [...codes].reverse();

            container.innerHTML = sortedCodes.map(item => {
                const history = item.history || [];
                const recentHistory = history.slice(-3);
                const expiry = getExpiryText(item);
                
                let badgeClass = '';
                if (item.spins === 0) badgeClass = 'empty';
                else if (item.spins === item.maxSpins) badgeClass = 'full';

                const date = new Date(item.createdAt).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
                const expiresAtStr = item.expiresAt ? new Date(item.expiresAt).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                }) : '';

                const isSelected = selectedCodes.has(item.code);

                return `
                    <div class="code-card ${isSelected ? 'selected' : ''}" data-code="${item.code}">
                        <div class="code-card-header">
                            <div class="code-left">
                                <input type="checkbox" class="code-checkbox code-checkbox-item" 
                                    ${isSelected ? 'checked' : ''} 
                                    onchange="toggleCodeSelection('${item.code}', this)">
                                <div>
                                    <span class="code-value">${item.code}</span>
                                    <span class="date-badge">สร้างเมื่อ ${date}</span>
                                    <span class="expiry-badge ${expiry.class}">⏱ <span class="countdown-text" data-expires="${item.expiresAt || ''}">${item.expiresAt ? getCountdownString(item.expiresAt) : 'ไม่มีกำหนด'}</span>${expiresAtStr ? ' (' + expiresAtStr + ')' : ''}</span>
                                </div>
                            </div>
                            <div class="code-meta">
                                <span class="spins-badge ${badgeClass}">
                                    🎯 ${item.spins} / ${item.maxSpins} ครั้ง
                                </span>
                                <div class="code-actions">
                                    <button class="btn-icon btn-view" onclick="viewHistory('${item.code}')" title="ดูประวัติ">📊</button>
                                    <button class="btn-icon btn-copy" onclick="copyCode('${item.code}')" title="คัดลอก">📋</button>
                                    <button class="btn-icon btn-delete" onclick="deleteCode('${item.code}')" title="ลบ">🗑️</button>
                                </div>
                            </div>
                        </div>
                        ${recentHistory.length > 0 ? `
                            <div class="history-section">
                                <div class="history-title">🎁 รางวัลล่าสุด (${history.length} ครั้ง)</div>
                                <div class="history-list">
                                    ${recentHistory.map(h => {
                                        const isMiss = h.prize.toLowerCase().includes('miss');
                                        return `<span class="history-item ${isMiss ? 'miss' : 'win'}">${h.prize}</span>`;
                                    }).reverse().join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');

            document.getElementById('selectAll').checked = selectedCodes.size === codes.length && codes.length > 0;
            renderTrashList();
        }

        function renderTrashList() {
            purgeExpiredTrash();
            const trash = getTrash();
            const container = document.getElementById('trashList');
            if (!container) return;
            const wrap = document.getElementById('trashSection');
            if (trash.length === 0) {
                if (wrap) wrap.style.display = 'none';
                return;
            }
            if (wrap) wrap.style.display = 'block';
            container.innerHTML = trash.map(item => {
                const canRestore = !item.restoredOnce;
                const movedDate = item.movedToTrashAt ? new Date(item.movedToTrashAt).toLocaleString('th-TH', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                }) : '';
                const timeLeft = getTrashTimeLeft(item.movedToTrashAt);
                return `
                    <div class="trash-card" data-code="${item.code}">
                        <div class="trash-card-main">
                            <span class="code-value">${item.code}</span>
                            <span class="trash-meta">🎯 ${item.spins}/${item.maxSpins} ครั้ง · ย้ายเมื่อ ${movedDate}</span>
                            <span class="trash-countdown ${timeLeft.class}" data-moved="${item.movedToTrashAt || ''}">⏱ ${timeLeft.text}</span>
                            ${item.restoredOnce ? '<span class="trash-no-restore">กู้คืนได้เพียง 1 ครั้ง</span>' : ''}
                        </div>
                        <div class="trash-actions">
                            ${canRestore ? `<button class="btn-sm btn-restore" onclick="restoreFromTrash('${item.code}')">กู้คืน</button>` : ''}
                            <button class="btn-sm btn-delete-all" onclick="deleteFromTrash('${item.code}')">ลบถาวร</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function updateTrashCountdowns() {
            const elements = document.querySelectorAll('.trash-countdown[data-moved]');
            let anyExpired = false;
            elements.forEach(el => {
                const movedAt = el.getAttribute('data-moved');
                if (!movedAt) return;
                const left = getTrashTimeLeft(movedAt);
                el.textContent = '⏱ ' + left.text;
                el.className = 'trash-countdown ' + (left.class || '');
                if (left.ms <= 0) anyExpired = true;
            });
            if (anyExpired) {
                purgeExpiredTrash();
                renderTrashList();
            }
        }

        function updateStats() {
            const codes = getCodes();
            const activeCodes = codes.filter(c => c.spins > 0);
            const totalSpins = codes.reduce((sum, c) => sum + c.spins, 0);
            const totalWins = codes.reduce((sum, c) => {
                const history = c.history || [];
                return sum + history.filter(h => !h.prize.toLowerCase().includes('miss')).length;
            }, 0);

            document.getElementById('totalCodes').textContent = codes.length;
            document.getElementById('activeCodes').textContent = activeCodes.length;
            document.getElementById('totalSpins').textContent = totalSpins;
            document.getElementById('totalWins').textContent = totalWins;
        }

        function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast show' + (type === 'error' ? ' error' : '');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }

        async function refreshData() {
            selectedCodes.clear();
            if (API_BASE) await loadCodesFromApi();
            renderCodeList();
            updateStats();
            showToast('🔄 รีเฟรชข้อมูลแล้ว');
        }

        document.getElementById('historyModal').addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });

        window.addEventListener('focus', async function() {
            if (API_BASE) await loadCodesFromApi();
            renderCodeList();
            updateStats();
        });

        (async function init() {
            if (API_BASE) await loadCodesFromApi();
            renderCodeList();
            updateStats();
        })();
        setInterval(function() {
            updateAllCountdowns();
            updateTrashCountdowns();
        }, 1000);