// ==========================================
// auth.js - จัดการระบบสิทธิ์ผู้ใช้งานและอายุ sessionStorage (30 นาที)
// ==========================================

const SESSION_TTL_MS = 30 * 60 * 1000; // อายุ sessionStorage สูงสุด 30 นาที (1,800,000 ms)
const SESSION_EXPIRES_AT_KEY = 'user_session_expires_at';
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const ACTIVE_TAB_ID = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

let sessionExpiryTimerId = null;
let heartbeatTimerId = null;
let isLoggingOut = false;

function getSessionExpiresAt() {
  const raw = sessionStorage.getItem(SESSION_EXPIRES_AT_KEY);
  if (!raw) return null;
  const ts = Number.parseInt(raw, 10);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

// ตรวจสอบว่า sessionStorage หมดอายุครบ 30 นาทีแล้วหรือไม่
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

// ตรวจสอบและสั่งออกจากระบบอัตโนมัติเมื่อครบกำหนด 30 นาที
function enforceActiveSessionOrLogout() {
  if (sessionExpiredOnLoad || isSessionStorageExpired()) {
    if (!isLoggingOut) {
      void handleLogout({ expired: true });
    }
    return false;
  }
  return true;
}

// ตั้งเวลาถอยหลังเพื่อล้าง sessionStorage และ Cookie ทันทีเมื่อครบ 30 นาที
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

// ส่ง Heartbeat เพื่อนับผู้ใช้งานออนไลน์ปัจจุบันแบบราย Tab
async function sendSessionHeartbeat() {
  if (isLoggingOut || sessionExpiredOnLoad || isSessionStorageExpired()) return;
  try {
    const res = await fetch('/session/heartbeat', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tab_id: ACTIVE_TAB_ID })
    });
    if (res.status === 401) {
      await handleLogout({ expired: true });
    }
  } catch (_) {
    // ละเว้นกรณีเครือข่ายสะดุดชั่วคราว
  }
}

function startSessionHeartbeat() {
  void sendSessionHeartbeat();
  if (heartbeatTimerId !== null) {
    clearInterval(heartbeatTimerId);
  }
  heartbeatTimerId = setInterval(() => {
    void sendSessionHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);
}

function stopSessionHeartbeat() {
  if (heartbeatTimerId !== null) {
    clearInterval(heartbeatTimerId);
    heartbeatTimerId = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (enforceActiveSessionOrLogout()) {
      void sendSessionHeartbeat();
    }
  }
});

window.addEventListener('focus', () => {
  enforceActiveSessionOrLogout();
});

window.addEventListener('pageshow', () => {
  enforceActiveSessionOrLogout();
});

window.addEventListener('pagehide', () => {
  stopSessionHeartbeat();
  if (isLoggingOut) return;
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([JSON.stringify({ tab_id: ACTIVE_TAB_ID })], { type: 'application/json' });
    navigator.sendBeacon('/session/leave', blob);
  }
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
    
    // ซ่อน Loading เมื่อตรวจสอบสิทธิ์ผ่าน และเริ่มส่ง Heartbeat นับสถานะออนไลน์
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
    }
    startSessionHeartbeat();

    return true;
  } catch (err) {
    // หากไม่มีสิทธิ์หรือ Token หมดอายุ ล้างข้อมูลใน sessionStorage แล้วดีดกลับไปหน้า Login ทันที
    stopSessionHeartbeat();
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

  stopSessionHeartbeat();
  if (sessionExpiryTimerId !== null) {
    clearTimeout(sessionExpiryTimerId);
    sessionExpiryTimerId = null;
  }

  try {
    // 1. แจ้ง BFF ให้นำผู้ใช้งานออกจากตัวนับออนไลน์ทันที และเรียก API แจ้ง Auth Service ให้เคลียร์ HttpOnly Cookie
    await Promise.allSettled([
      fetch('/session/leave', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true })
      }),
      fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })
    ]);
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