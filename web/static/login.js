// ==========================================
// login.js - จัดการหน้าลงทะเบียนและตรวจสอบสถานะ Serial Key (/index.html)
// ==========================================

// ดึงสถานะ Serial Key จาก /api/v1/auth/serial-keys มาแสดงใต้ช่องกรอก
async function loadSerialKeysStatus() {
  const summaryBadge = document.getElementById('serialKeySummaryBadge');
  const listEl = document.getElementById('serialKeysList');
  if (!summaryBadge || !listEl) return;

  try {
    let res;
    try {
      res = await fetch('/api/v1/auth/serial-keys', { cache: 'no-store' });
    } catch (_) {
      res = await fetch('/auth/serial-keys', { cache: 'no-store' });
    }

    if (!res.ok) throw new Error('ไม่สามารถดึงข้อมูลสถานะ Serial Key ได้');
    const result = await res.json();
    const data = result.data || {};

    const total = data.total_keys ?? 0;
    const available = data.available_count ?? 0;
    const used = data.used_count ?? 0;

    summaryBadge.textContent = `ว่าง ${available}/${total} (ใช้แล้ว ${used})`;
    summaryBadge.className = available > 0
      ? 'text-[11px] font-medium text-emerald-400'
      : 'text-[11px] font-medium text-rose-400';

    listEl.replaceChildren();

    const keys = Array.isArray(data.keys) ? data.keys : [];
    if (keys.length === 0) {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'text-[11px] text-slate-500';
      emptySpan.textContent = 'ไม่พบรายการ Serial Key';
      listEl.appendChild(emptySpan);
      return;
    }

    keys.forEach(item => {
      const isUsed = Boolean(item.is_used || item.status === 'used');
      const badge = document.createElement('button');
      badge.type = 'button';

      if (!isUsed) {
        const currentInputVal = (document.getElementById('serialKey')?.value || '').trim();
        const isSelected = currentInputVal && currentInputVal === item.key_code;
        badge.className = isSelected
          ? 'text-[11px] font-mono px-2.5 py-1 rounded-lg border bg-amber-500/20 border-amber-400 text-amber-200 ring-1 ring-amber-400/50 transition cursor-pointer flex items-center gap-1'
          : 'text-[11px] font-mono px-2.5 py-1 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition cursor-pointer flex items-center gap-1';
        badge.title = 'คลิกเพื่อเลือกใช้รหัสนี้และอัปเดตสถานะล่าสุด';
        badge.addEventListener('click', async () => {
          const input = document.getElementById('serialKey');
          if (input) input.value = item.key_code || '';
          await loadSerialKeysStatus();
        });
      } else {
        badge.disabled = true;
        badge.className = 'text-[11px] font-mono px-2.5 py-1 rounded-lg border bg-slate-900 border-slate-800 text-slate-500 line-through cursor-not-allowed flex items-center gap-1';
        badge.title = 'รหัสนี้ถูกใช้งานแล้ว';
      }

      const dot = document.createElement('span');
      dot.textContent = isUsed ? '🔴' : '🟢';

      const codeSpan = document.createElement('span');
      codeSpan.textContent = item.key_code || '';

      const statusSpan = document.createElement('span');
      statusSpan.className = 'text-[10px] font-sans no-underline';
      statusSpan.textContent = isUsed ? '(ใช้แล้ว)' : '(ว่าง)';

      badge.appendChild(dot);
      badge.appendChild(codeSpan);
      badge.appendChild(statusSpan);
      listEl.appendChild(badge);
    });
  } catch (_) {
    summaryBadge.textContent = 'ไม่สามารถโหลดสถานะได้';
    summaryBadge.className = 'text-[11px] text-slate-500';
  }
}

// ส่ง Username และ Serial Key ไปที่ Backend เพื่อลงทะเบียนเข้าสู่ระบบ
function handleRegister(event) {
  event.preventDefault();
  const username = document.getElementById('username').value.trim();
  const key = document.getElementById('serialKey').value.trim();
  const errorBox = document.getElementById('errorMsg');

  errorBox.classList.add('hidden');

  // ตรวจสอบว่าชื่อผู้ใช้เป็นตัวอักษรโรมัน (a-z, A-Z) หรือตัวเลข (0-9) เท่านั้นก่อนส่ง API
  const usernameRegex = /^[A-Za-z0-9]+$/;
  if (!usernameRegex.test(username)) {
    errorBox.textContent = 'ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษ (a-z, A-Z) หรือตัวเลข (0-9) เท่านั้น ห้ามเว้นวรรคหรือใช้อักขระพิเศษ';
    errorBox.classList.remove('hidden');
    return;
  }

  fetch('/api/v1/auth/register-serial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      username,
      serial_key: key
    })
  })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'เกิดข้อผิดพลาด กรุณาตรวจสอบรหัสซีเรียลอีกครั้ง');
      }
      return data;
    })
    .then(data => {
      sessionStorage.setItem('user_username', (data && data.username) || username);
      window.location.href = '/chat.html';
    })
    .catch(error => {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
      loadSerialKeysStatus();
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSerialKeysStatus);
} else {
  loadSerialKeysStatus();
}
