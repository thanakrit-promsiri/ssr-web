// ==========================================
// hora-common.js - ฟังก์ชันกลาง (Shared Domain, DOM & API Helpers)
// ใช้ร่วมกันระหว่าง birth.js, astrology.js และ transit.js
// ==========================================

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// แปลงวันที่ "2003-04-25" เป็นรูปแบบวันที่ไทย เช่น "25 เมษายน พ.ศ. 2546"
function formatThaiDateBE(birthDateCE, birthYearBE) {
  if (!birthDateCE) return `พ.ศ. ${birthYearBE}`;
  const parts = String(birthDateCE).split('-');
  if (parts.length !== 3) return `พ.ศ. ${birthYearBE}`;

  const yearCE = Number.parseInt(parts[0], 10);
  const monthIdx = Number.parseInt(parts[1], 10) - 1;
  const day = Number.parseInt(parts[2], 10);
  const yearBE = birthYearBE || (yearCE + 543);
  const monthName = THAI_MONTHS[monthIdx] || parts[1];

  return `${day} ${monthName} พ.ศ. ${yearBE}`;
}

// แปลงเวลา "10:35" เป็นรูปแบบทศนิยม hour_thai 10.35 ตามที่ lahiri-api กำหนด
function parseHourThai(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2) return Number.parseFloat(timeStr) || 0;
  const hour = Number.parseInt(parts[0], 10) || 0;
  const minute = Number.parseInt(parts[1], 10) || 0;
  return Number.parseFloat(`${hour}.${String(minute).padStart(2, '0')}`);
}

// เติมค่าลงใน Element ที่มี data-field ตรงกับ key (ใช้ textContent ป้องกัน DOM XSS)
function fillFields(root, values) {
  if (!root || !values) return;
  Object.entries(values).forEach(([field, value]) => {
    root.querySelectorAll(`[data-field="${field}"]`).forEach(el => {
      el.textContent = String(value ?? '');
    });
  });
}

// แสดงหรือซ่อน Element อย่างปลอดภัย
function setHidden(el, hidden) {
  if (el) el.classList.toggle('hidden', hidden);
}

// คัดลอกข้อความไปยัง Clipboard พร้อมแสดงสถานะชั่วคราว
function copyTextWithFeedback(text, labelEl, iconEl, defaultLabel) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    if (labelEl) labelEl.textContent = 'คัดลอกสำเร็จ!';
    if (iconEl) iconEl.textContent = '✅';
    setTimeout(() => {
      if (labelEl) labelEl.textContent = defaultLabel;
      if (iconEl) iconEl.textContent = '📋';
    }, 2000);
  }).catch(err => {
    console.error('Clipboard copy error:', err);
  });
}

// ส่งคำขอ POST ไปยัง Hora API ผ่าน BFF Gateway (/api/v1/hora/<endpoint> พร้อม Fallback /hora/<endpoint>)
async function postHoraAPI(endpoint, payload) {
  if (typeof enforceActiveSessionOrLogout === 'function' && !enforceActiveSessionOrLogout()) {
    throw new Error('เซสชันหมดอายุ (ครบ 15 นาที) กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
  }

  const cleanEndpoint = String(endpoint || '').replace(/^\/+/, '');
  const reqOptions = {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };

  let response;
  try {
    response = await fetch(`/api/v1/hora/${cleanEndpoint}`, reqOptions);
    if (response.status === 404 || response.status === 502) {
      response = await fetch(`/hora/${cleanEndpoint}`, reqOptions);
    }
  } catch (_) {
    response = await fetch(`/hora/${cleanEndpoint}`, reqOptions);
  }

  if (response && response.status === 401 && typeof handleLogout === 'function') {
    void handleLogout({ expired: true });
    throw new Error('เซสชันหมดอายุ (ครบ 15 นาที) กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
  }

  return response;
}

// ==========================================
// ฟังก์ชันแปลงข้อความ Markdown เป็น HTML แบบ Zero-Dependency
// ทำงานเร็วระดับไมโครวินาที (Linear O(n) ปลอด Regex Backtracking)
// ป้องกัน XSS ด้วยการ Escape HTML ก่อนสร้าง Element เสมอ
// ==========================================

function renderMarkdown(mdText) {
  if (!mdText) return '';

  const rawLines = String(mdText).split('\n');
  const out = [];
  let inList = false;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    const trimmedStart = line.trimStart();
    const trimmed = trimmedStart.trimEnd();

    // กรณีบรรทัดมีแค่สัญลักษณ์ "•" เดี่ยว ๆ ให้รวมเข้ากับบรรทัดถัดไป
    if (trimmed === '•' && i + 1 < rawLines.length) {
      const nextLine = rawLines[i + 1].trim();
      if (nextLine) {
        line = '• ' + nextLine;
        i++;
      }
    }

    // เส้นคั่น ---
    if (trimmed === '---') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<hr class="border-purple-500/20 my-3">');
      continue;
    }

    // หัวข้อ ###, ##, #
    if (trimmedStart.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3 class="text-amber-300 font-semibold text-sm mt-3 mb-1">${formatInlineMarkdown(trimmed.slice(4).trimStart())}</h3>`);
      continue;
    }
    if (trimmedStart.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2 class="text-amber-200 font-bold text-base mt-4 mb-2">${formatInlineMarkdown(trimmed.slice(3).trimStart())}</h2>`);
      continue;
    }
    if (trimmedStart.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h1 class="text-amber-100 font-bold text-lg mt-5 mb-2">${formatInlineMarkdown(trimmed.slice(2).trimStart())}</h1>`);
      continue;
    }

    // ข้อความไฮไลต์ไอคอนดาวหรือประกาย (🪐 หรือ ✨)
    if (trimmedStart.startsWith('🪐') || trimmedStart.startsWith('✨')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p class="text-amber-300 font-semibold text-xs sm:text-sm mt-2.5 mb-1 leading-relaxed">${formatInlineMarkdown(trimmed)}</p>`);
      continue;
    }

    // รายการแบบ Bullet (* หรือ - หรือ •) พร้อมตรวจจับการเยื้องหน้า (Indentation)
    if (trimmedStart.startsWith('* ') || trimmedStart.startsWith('- ') || trimmedStart.startsWith('• ')) {
      if (!inList) { out.push('<ul class="space-y-1.5 my-2">'); inList = true; }
      const indent = line.length - trimmedStart.length;
      const marginClass = indent >= 4 ? 'ml-6 list-[circle] text-slate-300' : 'ml-3 list-disc text-slate-200';
      out.push(`<li class="${marginClass}">${formatInlineMarkdown(trimmedStart.slice(2).trim())}</li>`);
      continue;
    }

    // รายการแบบตัวเลข (1. 2.) แบบ Linear Scan
    const dotIdx = trimmedStart.indexOf('. ');
    if (dotIdx > 0 && /^\d+$/.test(trimmedStart.slice(0, dotIdx))) {
      if (inList) { out.push('</ul>'); inList = false; }
      const itemContent = trimmedStart.slice(dotIdx + 2).trim();
      out.push(`<li class="ml-4 list-decimal text-slate-200 my-1">${formatInlineMarkdown(itemContent)}</li>`);
      continue;
    }

    if (inList) { out.push('</ul>'); inList = false; }

    // บรรทัดว่าง
    if (!trimmed) {
      out.push('<div class="h-2"></div>');
      continue;
    }

    // ย่อหน้าทั่วไป
    out.push(`<p class="leading-relaxed text-slate-200 mb-1">${formatInlineMarkdown(line)}</p>`);
  }

  if (inList) out.push('</ul>');

  return out.join('');
}

// แปลงรูปแบบตัวหนา/ตัวเอียง และ escape HTML เพื่อความปลอดภัย XSS
function formatInlineMarkdown(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong class="text-amber-300 font-bold"><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-amber-300 font-semibold">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="text-purple-300 font-normal">$1</em>');
}
