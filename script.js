        const CODE_HISTORY_KEY = 'wheel_code_history';
        const SPIN_HISTORY_KEY = 'wheel_spin_history';
        // ใช้ API: กำหนด window.__API_BASE__ ใน HTML ได้ หรือเปิดผ่าน http(s) จะใช้ origin
        const API_BASE = (typeof window.__API_BASE__ === 'string' && window.__API_BASE__.trim())
            ? window.__API_BASE__.trim().replace(/\/$/, '')
            : (window.location.protocol === 'http:' || window.location.protocol === 'https:' ? window.location.origin : '');
        // ใส่ Discord Webhook URL (จาก Server Settings > Integrations > Webhooks) ถ้าไม่ใส่จะไม่ส่งแจ้งเตือน
        const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1475856758684782798/0RpyshGBDLf8ASncUday0Uiu7-ePfw9UNnkqNxvDI0xAiTIwJRuiBmMv0p_ZrAVP0jZV';

        const items = [
            { name: 'Netflix 7 Day', rate: 0, color: '#4CAF50' },
            { name: 'Netflix 1 Day', rate: 2, color: '#8BC34A' },
            { name: 'Netflix 3 Day', rate: 1, color: '#FFC107' },
            { name: 'ส่วนลด 10%', rate: 1, color: '#FF9800' },
            { name: 'ส่วนลด 5%', rate: 2, color: '#2196F3' },
            { name: 'ส่วนลด 20%', rate: 0, color: '#4CAF50' },
            { name: 'MISS', rate: 53, color: '#f44336' }
        ];

        let isSpinning = false;
        let currentRotation = 0;
        let currentCode = null;
        let lastSpinsLeft = 0;
        
        const canvas = document.getElementById('wheel');
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = canvas.width / 2 - 5;

        function getCodes() {
            if (API_BASE) return [];
            const data = localStorage.getItem('wheel_codes');
            return data ? JSON.parse(data) : [];
        }

        function saveCodes(codes) {
            if (API_BASE) return;
            localStorage.setItem('wheel_codes', JSON.stringify(codes));
        }

        function getCodeHistory() {
            const data = localStorage.getItem(CODE_HISTORY_KEY);
            return data ? JSON.parse(data) : [];
        }

        function saveCodeHistory(history) {
            localStorage.setItem(CODE_HISTORY_KEY, JSON.stringify(history));
        }

        function getSpinHistory() {
            const data = localStorage.getItem(SPIN_HISTORY_KEY);
            return data ? JSON.parse(data) : [];
        }

        function saveSpinHistory(history) {
            localStorage.setItem(SPIN_HISTORY_KEY, JSON.stringify(history));
        }

        function addCodeHistory(code, isValid, message) {
            const history = getCodeHistory();
            history.push({
                code: code,
                isValid: isValid,
                message: message,
                time: new Date().toISOString()
            });
            if (history.length > 50) history.shift();
            saveCodeHistory(history);
            renderCodeHistory();
        }

        function addSpinHistory(code, prize) {
            const history = getSpinHistory();
            history.push({
                code: code,
                prize: prize,
                time: new Date().toISOString()
            });
            if (history.length > 50) history.shift();
            saveSpinHistory(history);
            renderSpinHistory();
        }

        function renderCodeHistory() {
            const history = getCodeHistory();
            const container = document.getElementById('codeHistoryList');

            if (history.length === 0) {
                container.innerHTML = '<div class="empty-history">ยังไม่มีประวัติ</div>';
                return;
            }

            container.innerHTML = [...history].reverse().map(item => {
                const time = new Date(item.time).toLocaleString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return `
                    <div class="code-history-item ${item.isValid ? '' : 'invalid'}">
                        <div>
                            <div class="code-text">${item.code}</div>
                            <div class="code-time">${time}</div>
                        </div>
                        <span class="code-status-badge">${item.isValid ? '✓ ใช้ได้' : '✗ ไม่ถูกต้อง'}</span>
                    </div>
                `;
            }).join('');
        }

        function renderSpinHistory() {
            const history = getSpinHistory();
            const container = document.getElementById('spinHistoryList');

            if (history.length === 0) {
                container.innerHTML = '<div class="empty-history">ยังไม่มีประวัติ</div>';
                return;
            }

            container.innerHTML = [...history].reverse().map(item => {
                const time = new Date(item.time).toLocaleString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const isMiss = item.prize.toLowerCase().includes('miss');
                return `
                    <div class="history-item ${isMiss ? 'miss' : ''}">
                        <div>
                            <div class="prize-name">${item.prize}</div>
                            <div class="prize-time">${time} • ${item.code}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function clearCodeHistory() {
            localStorage.removeItem(CODE_HISTORY_KEY);
            renderCodeHistory();
        }

        function clearSpinHistory() {
            localStorage.removeItem(SPIN_HISTORY_KEY);
            renderSpinHistory();
        }

        async function verifyCode() {
            const input = document.getElementById('codeInput').value.trim().toUpperCase();
            const status = document.getElementById('codeStatus');
            const spinBtn = document.getElementById('spinBtn');
            const spinsInfo = document.getElementById('spinsInfo');
            const spinsValue = document.getElementById('spinsValue');

            if (!input) {
                status.textContent = '❌ กรุณากรอกโค้ด';
                status.className = 'code-status invalid';
                spinBtn.disabled = true;
                spinBtn.textContent = 'กรุณาใส่โค้ด';
                spinsInfo.classList.remove('show');
                currentCode = null;
                return;
            }

            if (API_BASE) {
                try {
                    const res = await fetch(API_BASE + '/api/codes/verify/' + encodeURIComponent(input));
                    const data = await res.json().catch(() => ({}));
                    if (!data.valid) {
                        status.textContent = '❌ ' + (data.message || 'ไม่พบโค้ดนี้ในระบบ');
                        status.className = 'code-status invalid';
                        spinBtn.disabled = true;
                        spinBtn.textContent = data.spins <= 0 ? 'หมดสิทธิ์แล้ว' : 'โค้ดไม่ถูกต้อง';
                        spinsInfo.classList.remove('show');
                        currentCode = null;
                        addCodeHistory(input, false, data.message || 'ไม่พบโค้ด');
                        return;
                    }
                    status.textContent = '✅ โค้ดถูกต้อง! พร้อมหมุนวงล้อ';
                    status.className = 'code-status valid';
                    spinBtn.disabled = false;
                    spinBtn.textContent = 'หมุนเลย!';
                    spinsInfo.classList.add('show');
                    spinsValue.textContent = data.spins + ' ครั้ง';
                    currentCode = input;
                    addCodeHistory(input, true, 'สิทธิ์ ' + data.spins + ' ครั้ง');
                    return;
                } catch (e) {
                    status.textContent = '❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ กรุณาเปิดเซิร์ฟเวอร์ API (รัน node ในโฟลเดอร์ api)';
                    status.className = 'code-status invalid';
                    spinBtn.disabled = true;
                    spinBtn.textContent = 'กรุณาใส่โค้ด';
                    spinsInfo.classList.remove('show');
                    currentCode = null;
                    return;
                }
            }

            const codes = getCodes();
            const codeData = codes.find(c => c.code === input);

            if (!codeData) {
                status.textContent = '❌ ไม่พบโค้ดนี้ในระบบ';
                status.className = 'code-status invalid';
                spinBtn.disabled = true;
                spinBtn.textContent = 'โค้ดไม่ถูกต้อง';
                spinsInfo.classList.remove('show');
                currentCode = null;
                addCodeHistory(input, false, 'ไม่พบโค้ด');
                return;
            }

            if (codeData.spins <= 0) {
                status.textContent = '❌ โค้ดนี้ใช้สิทธิ์หมดแล้ว';
                status.className = 'code-status invalid';
                spinBtn.disabled = true;
                spinBtn.textContent = 'หมดสิทธิ์แล้ว';
                spinsInfo.classList.remove('show');
                currentCode = null;
                addCodeHistory(input, false, 'หมดสิทธิ์');
                return;
            }

            status.textContent = `✅ โค้ดถูกต้อง! พร้อมหมุนวงล้อ`;
            status.className = 'code-status valid';
            spinBtn.disabled = false;
            spinBtn.textContent = 'หมุนเลย!';
            spinsInfo.classList.add('show');
            spinsValue.textContent = codeData.spins + ' ครั้ง';
            currentCode = input;
            addCodeHistory(input, true, `สิทธิ์ ${codeData.spins} ครั้ง`);
        }

        async function useSpinCredit() {
            if (!currentCode) return false;

            if (API_BASE) {
                try {
                    const res = await fetch(API_BASE + '/api/codes/use', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code: currentCode })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!data.ok) {
                        if (data.message) {
                            document.getElementById('codeStatus').textContent = '❌ ' + data.message;
                            document.getElementById('codeStatus').className = 'code-status invalid';
                        }
                        return false;
                    }
                    lastSpinsLeft = data.spinsLeft || 0;
                    document.getElementById('spinsValue').textContent = lastSpinsLeft + ' ครั้ง';
                    if (lastSpinsLeft <= 0) {
                        document.getElementById('spinBtn').disabled = true;
                        document.getElementById('spinBtn').textContent = 'หมดสิทธิ์แล้ว';
                        document.getElementById('codeStatus').textContent = '❌ โค้ดนี้ใช้สิทธิ์หมดแล้ว';
                        document.getElementById('codeStatus').className = 'code-status invalid';
                    }
                    return true;
                } catch (e) {
                    return false;
                }
            
            }

            const codes = getCodes();
            
            const codeIndex = codes.findIndex(c => c.code === currentCode);
            if (codeIndex === -1) return false;
            
            if (codes[codeIndex].spins <= 0) return false;

            codes[codeIndex].spins--;
            
            saveCodes(codes);
            lastSpinsLeft = codes[codeIndex].spins;
            document.getElementById('spinsValue').textContent = lastSpinsLeft + ' ครั้ง';
            if (lastSpinsLeft <= 0) {
                document.getElementById('spinBtn').disabled = true;
                document.getElementById('spinBtn').textContent = 'หมดสิทธิ์แล้ว';
                document.getElementById('codeStatus').textContent = '❌ โค้ดนี้ใช้สิทธิ์หมดแล้ว';
                document.getElementById('codeStatus').className = 'code-status invalid';
            }
            return true;
        }

        function recordSpinResult(prize) {
            if (API_BASE) {
                fetch(API_BASE + '/api/codes/record', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: currentCode, prize: prize })
                }).catch(function() {});
            } else {
                const codes = getCodes();
                const codeIndex = codes.findIndex(c => c.code === currentCode);
                if (codeIndex === -1) return;
                if (!codes[codeIndex].history) codes[codeIndex].history = [];
                codes[codeIndex].history.push({ prize: prize, time: new Date().toISOString() });
                saveCodes(codes);
            }
            addSpinHistory(currentCode, prize);
        }

        function drawWheel() {
            const sliceAngle = (2 * Math.PI) / items.length;
            let startAngle = -Math.PI / 2;

            items.forEach((item, index) => {
                const endAngle = startAngle + sliceAngle;

                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, endAngle);
                ctx.closePath();
                ctx.fillStyle = item.color;
                ctx.fill();

                ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                ctx.lineWidth = 2;
                ctx.stroke();

                const textAngle = startAngle + sliceAngle / 2;
                const textRadius = radius * 0.65;
                const textX = centerX + Math.cos(textAngle) * textRadius;
                const textY = centerY + Math.sin(textAngle) * textRadius;

                ctx.save();
                ctx.translate(textX, textY);
                ctx.rotate(textAngle + Math.PI / 2);
                ctx.fillStyle = 'white';
                ctx.font = 'bold 13px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 3;
                ctx.fillText(item.name, 0, 0);
                ctx.restore();

                startAngle = endAngle;
            });
        }

        async function spin() {
            if (isSpinning || !currentCode) return;
            
            if (!(await useSpinCredit())) {
                return;
            }
            
            isSpinning = true;

            const spinBtn = document.getElementById('spinBtn');
            spinBtn.disabled = true;
            spinBtn.textContent = 'กำลังหมุน...';

            const totalRate = items.reduce((sum, item) => sum + item.rate, 0);
            const random = Math.random() * totalRate;
            
            let cumulative = 0;
            let winnerIndex = 0;
            for (let i = 0; i < items.length; i++) {
                cumulative += items[i].rate;
                if (random <= cumulative) {
                    winnerIndex = i;
                    break;
                }
            }

            const segmentAngle = 360 / items.length;
            const winnerCenterAngle = (winnerIndex * segmentAngle) + (segmentAngle / 2);

            const targetAngle = 360 - winnerCenterAngle;
            const spins = 5 + Math.floor(Math.random() * 3);
            const finalRotation = currentRotation + (spins * 360) + targetAngle - (currentRotation % 360);

            canvas.style.transform = `rotate(${finalRotation}deg)`;
            currentRotation = finalRotation;

            setTimeout(() => {
                const prize = items[winnerIndex].name;
                recordSpinResult(prize);
                showResult(prize);
                isSpinning = false;
                if (lastSpinsLeft > 0) {
                    spinBtn.disabled = false;
                    spinBtn.textContent = 'หมุนเลย!';
                }
            }, 5000);
        }

        function sendDiscordWebhook(prize, code, dateStr, timeStr) {
            if (!DISCORD_WEBHOOK_URL || !DISCORD_WEBHOOK_URL.trim()) return;
            const now = new Date();
            const payload = {
                embeds: [{
                    title: '🎡 ผลการสุ่มวงล้อ',
                    color: 0xC41E3A,
                    fields: [
                        { name: '🔑 โค้ดที่ใช้', value: code || '-', inline: true },
                        { name: '🎁 รางวัลที่ได้', value: prize, inline: true },
                        { name: '📅 วันที่', value: dateStr, inline: false },
                        { name: '🕐 เวลา', value: timeStr, inline: true },
                        { name: '⏱ เวลา (ISO)', value: now.toISOString(), inline: false }
                    ],
                    footer: { text: 'วงล้อสุ่มรางวัล · JOKEMOO' },
                    timestamp: now.toISOString()
                }]
            };
            fetch(DISCORD_WEBHOOK_URL.trim(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => {});
        }

        function showResult(prize) {
            const now = new Date();
            const dateStr = now.toLocaleDateString('th-TH', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const timeStr = now.toLocaleTimeString('th-TH', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            document.getElementById('prizeText').textContent = prize;
            document.getElementById('resultDate').textContent = dateStr;
            document.getElementById('resultTime').textContent = timeStr;
            document.getElementById('resultCodeUsed').textContent = currentCode || '-';

            document.getElementById('resultDisplay').classList.add('show');
            createConfetti();
            sendDiscordWebhook(prize, currentCode, dateStr, timeStr);
        }

        function closeResult() {
            document.getElementById('resultDisplay').classList.remove('show');
        }

        function createConfetti() {
            const colors = ['#FFD700', '#FF6B6B', '#4CAF50', '#2196F3', '#FF9800', '#E91E63'];
            
            for (let i = 0; i < 80; i++) {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.left = Math.random() * 100 + 'vw';
                confetti.style.top = '-10px';
                confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
                confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
                confetti.style.width = (Math.random() * 10 + 5) + 'px';
                confetti.style.height = (Math.random() * 10 + 5) + 'px';
                document.body.appendChild(confetti);

                const animation = confetti.animate([
                    { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
                    { transform: `translateY(100vh) rotate(${Math.random() * 720}deg)`, opacity: 0 }
                ], {
                    duration: Math.random() * 2500 + 2000,
                    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                });

                animation.onfinish = () => confetti.remove();
            }
        }

        document.getElementById('codeInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                verifyCode();
            }
        });

        function renderPrizesGrid() {
            const container = document.getElementById('prizesGrid');
            container.innerHTML = items.map(item => `
                <div class="prize-item">
                    <div class="prize-dot" style="background: ${item.color};"></div>
                    <div class="prize-name">${item.name}</div>
                </div>
            `).join('');
        }

        drawWheel();
        renderCodeHistory();
        renderSpinHistory();
        renderPrizesGrid();