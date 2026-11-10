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

  const yearCE = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const yearBE = birthYearBE || (yearCE + 543);
  const monthName = THAI_MONTHS[monthIdx] || parts[1];

  return `${day} ${monthName} พ.ศ. ${yearBE}`;
}

// แปลงเวลา "10:35" เป็นรูปแบบทศนิยม hour_thai 10.35 ตามที่ lahiri-api กำหนด
function parseHourThai(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2) return parseFloat(timeStr) || 0;
  const hour = parseInt(parts[0], 10) || 0;
  const minute = parseInt(parts[1], 10) || 0;
  return parseFloat(`${hour}.${String(minute).padStart(2, '0')}`);
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

  return response;
}
