// ==========================================
// auth.js - จัดการระบบสิทธิ์ผู้ใช้งานและอายุ sessionStorage (15 นาที)
// ==========================================

const SESSION_TTL_MS = 15 * 60 * 1000; // อายุ sessionStorage สูงสุด 15 นาที (900,000 ms)
const SESSION_EXPIRES_AT_KEY = 'user_session_expires_at';

let sessionExpiryTimerId = null;
let isLoggingOut = false;

function getSessionExpiresAt() {
  const raw = sessionStorage.getItem(SESSION_EXPIRES_AT_KEY);
  if (!raw) return null;
  const ts = Number.parseInt(raw, 10);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

// ตรวจสอบว่า sessionStorage หมดอายุครบ 15 นาทีแล้วหรือไม่
function isSessionStorageExpired() {
  const raw = sessionStorage.getItem(SESSION_EXPIRES_AT_KEY);
  if (raw === null) return false;
  const ts = Number.parseInt(raw, 10);
  return !Number.isFinite(ts) || ts <= 0 || Date.now() >= ts;
}

// กำหนดเวลาหมดอายุของ sessionStorage หากยังไม่เคยถูกบันทึกในเซสชันนี้
function ensureSessionStorageExpiry() {
  if (isSessionStorageExpired()) return null;
  let expiresAt = getSessionExpiresAt();
  if (expiresAt === null) {
    expiresAt = Date.now() + SESSION_TTL_MS;
    sessionStorage.setItem(SESSION_EXPIRES_AT_KEY, String(expiresAt));
  }
  return expiresAt;
}

// ล้าง sessionStorage ทันทีเมื่อพบว่าข้อมูลเดิมหมดอายุแล้วตั้งแต่ตอนโหลดสคริปต์
const sessionExpiredOnLoad = isSessionStorageExpired();
if (sessionExpiredOnLoad) {
  sessionStorage.clear();
}

// ตรวจสอบและสั่งออกจากระบบอัตโนมัติเมื่อครบกำหนด 15 นาที
function enforceActiveSessionOrLogout() {
  if (sessionExpiredOnLoad || isSessionStorageExpired()) {
    if (!isLoggingOut) {
      void handleLogout({ expired: true });
    }
    return false;
  }
  return true;
}

// ตั้งเวลาถอยหลังเพื่อล้าง sessionStorage และ Cookie ทันทีเมื่อครบ 15 นาที
function scheduleSessionExpiryCheck() {
  if (sessionExpiryTimerId !== null) {
    clearTimeout(sessionExpiryTimerId);
    sessionExpiryTimerId = null;
  }

  const expiresAt = ensureSessionStorageExpiry();
  if (expiresAt === null || Date.now() >= expiresAt) {
    return enforceActiveSessionOrLogout();
  }

  const remainingMs = Math.max(0, expiresAt - Date.now());
  sessionExpiryTimerId = setTimeout(() => {
    void enforceActiveSessionOrLogout();
  }, remainingMs + 50);

  return true;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    enforceActiveSessionOrLogout();
  }
});

window.addEventListener('focus', () => {
  enforceActiveSessionOrLogout();
});

window.addEventListener('pageshow', () => {
  enforceActiveSessionOrLogout();
});

// ตรวจสอบสิทธิ์กับ Backend เมื่อเปิดหน้าเว็บ
async function checkAuthWithBackend() {
  if (sessionExpiredOnLoad || isSessionStorageExpired()) {
    await handleLogout({ expired: true });
    return false;
  }

  try {
    const res = await fetch('/api/v1/auth/verify', {
      method: 'GET',
      credentials: 'include' // แนบ HttpOnly Cookie ไปด้วยอัตโนมัติ
    });

    if (!res.ok) throw new Error('Unauthorized');

    const data = await res.json();
    if (isSessionStorageExpired()) {
      await handleLogout({ expired: true });
      return false;
    }

    if (!scheduleSessionExpiryCheck()) {
      return false;
    }

    if (data.username) {
      sessionStorage.setItem('user_username', data.username);
      const userInfoEl = document.getElementById('userInfo');
      if (userInfoEl) {
        userInfoEl.textContent = `ผู้ใช้งาน: ${data.username}`;
      }
    }
    
    // ซ่อน Loading เมื่อตรวจสอบสิทธิ์ผ่าน
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
    }

    return true;
  } catch (err) {
    // หากไม่มีสิทธิ์หรือ Token หมดอายุ ล้างข้อมูลใน sessionStorage แล้วดีดกลับไปหน้า Login ทันที
    sessionStorage.clear();
    localStorage.clear();
    window.location.replace('/index.html?logout=1');
    return false;
  }
}

// ฟังก์ชันออกจากระบบ (ล้าง SessionStorage/LocalStorage, ลบ Cookie และเรียก API Logout)
async function handleLogout(options = {}) {
  if (isLoggingOut) return;
  isLoggingOut = true;

  if (sessionExpiryTimerId !== null) {
    clearTimeout(sessionExpiryTimerId);
    sessionExpiryTimerId = null;
  }

  try {
    // 1. เรียก API แจ้ง Backend ให้เคลียร์ HttpOnly Cookie
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (e) {
    console.error('Logout error:', e);
  }

  // 2. ล้างข้อมูลทั้งหมดใน SessionStorage และ LocalStorage (เช่น ข้อมูลวันเกิดผู้ใช้, ผลคำนวณดวงชะตา)
  sessionStorage.clear();
  localStorage.clear();

  // 3. กวาดล้าง Cookie ทุกตัวที่เบราว์เซอร์ฝั่ง Client เข้าถึงได้
  document.cookie.split(';').forEach((c) => {
    document.cookie = c
      .replace(/^ +/, '')
      .replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/');
  });

  // 4. พาเปลี่ยนหน้ากลับไปหน้า Login หลังออกจากระบบสำเร็จ (เพื่อให้ BFF เคลียร์ Cookie ฝั่ง Server ด้วย)
  const redirectUrl = options && options.expired ? '/index.html?expired=1' : '/index.html?logout=1';
  window.location.replace(redirectUrl);
}