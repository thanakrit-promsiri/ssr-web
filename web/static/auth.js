// ==========================================
// auth.js - จัดการระบบสิทธิ์ผู้ใช้งาน (Authentication)
// ==========================================

// ตรวจสอบสิทธิ์กับ Backend เมื่อเปิดหน้าเว็บ
async function checkAuthWithBackend() {
  try {
    const res = await fetch('/api/v1/auth/verify', {
      method: 'GET',
      credentials: 'include' // แนบ HttpOnly Cookie ไปด้วยอัตโนมัติ
    });

    if (!res.ok) throw new Error('Unauthorized');

    const data = await res.json();
    if (data.username) {
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
  } catch (err) {
    // หากไม่มีสิทธิ์หรือ Token หมดอายุ ดีดกลับไปหน้า Login ทันที
    window.location.replace('/index.html');
  }
}

// ฟังก์ชันออกจากระบบ (ล้าง LocalStorage, ลบ Cookie และเรียก API Logout)
async function handleLogout() {
  try {
    // 1. เรียก API แจ้ง Backend ให้เคลียร์ HttpOnly Cookie
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (e) {
    console.error('Logout error:', e);
  }

  // 2. ล้างข้อมูลทั้งหมดใน LocalStorage (เช่น ข้อมูลวันเกิดผู้ใช้, ข้อมูลชั่วคราวต่างๆ)
  localStorage.clear();

  // 3. กวาดล้าง Cookie ทุกตัวที่เบราว์เซอร์ฝั่ง Client เข้าถึงได้
  document.cookie.split(";").forEach((c) => {
    document.cookie = c
      .replace(/^ +/, "")
      .replace(/=.*/, "=;expires=" + new Date(0).toUTCString() + ";path=/");
  });

  // 4. พาเปลี่ยนหน้ากลับไปหน้า Login หลังออกจากระบบสำเร็จ
  window.location.replace('/index.html');
}