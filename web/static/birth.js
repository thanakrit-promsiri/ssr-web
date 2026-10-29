// ==========================================
// birth.js - จัดการการตรวจสอบวันเกิด คำนวณพิกัด และบันทึกข้อมูล
// ==========================================

// 1. ตรวจสอบข้อมูลใน localStorage ทันทีที่โหลดไฟล์
document.addEventListener('DOMContentLoaded', () => {
  checkExistingBirthInfo();
});

// ฟังก์ชันกลางสำหรับโหลด Template และแสดงผลข้อมูลวันเกิด
async function renderBirthResult(birthData) {
  const response = await fetch('/static/result-template.html?v=1');
  if (!response.ok) throw new Error('ไม่สามารถโหลดเทมเพลตผลลัพธ์ได้');

  const html = await response.text();
  const container = document.getElementById('resultContainer');
  container.innerHTML = html;

  const yearCEFallback = parseInt(birthData.birthYearBE, 10) - 543;
  document.getElementById('resYearBE').textContent = birthData.birthYearBE;
  document.getElementById('resYearCE').textContent = birthData.birthDateCE || yearCEFallback;
  document.getElementById('resTime').textContent = birthData.birthTime;
  document.getElementById('resAmphoe').textContent = birthData.amphoe;
  document.getElementById('resProvince').textContent = birthData.province;
  document.getElementById('resLat').textContent = birthData.latitude;
  document.getElementById('resLng').textContent = birthData.longitude;

  const formContainer = document.getElementById('formContainer');
  if (formContainer) {
    formContainer.classList.add('hidden');
  }

  container.classList.remove('hidden');
}

// ฟังก์ชันตรวจสอบและแสดงผลข้อมูลเก่าถ้ามีอยู่แล้ว
async function checkExistingBirthInfo() {
  const savedDataStr = localStorage.getItem('user_birth_info');
  if (!savedDataStr) return; // ถ้าไม่มีข้อมูล ให้แสดงฟอร์มตามปกติ

  try {
    const birthData = JSON.parse(savedDataStr);
    await renderBirthResult(birthData);
  } catch (error) {
    console.error('Error loading existing birth info:', error);
  }
}

async function submitBirthInfo() {
  const birthDateStr = document.getElementById('birthDate').value; // วัน/เดือน/ปีเกิด
  const birthTime = document.getElementById('birthTime').value;    // เวลาเกิด

  const provinceSelect = document.getElementById('provinceSelect');
  const provinceText = provinceSelect.options[provinceSelect.selectedIndex]?.text || '';

  const amphoeSelect = document.getElementById('amphoeSelect');
  const amphoeId = amphoeSelect.value;
  const amphoeText = amphoeSelect.options[amphoeSelect.selectedIndex]?.text || '';

  // 1. บังคับกรอกข้อมูลให้ครบถ้วนทุกช่องตามจริง ห้ามว่าง
  if (!birthDateStr || !birthTime || !provinceSelect.value || !amphoeId) {
    alert('กรุณากรอกข้อมูลให้ครบถ้วนทุกช่องตามจริง');
    return;
  }

  // 2. ดึงปีที่ผู้ใช้กรอกมาและรองรับทั้งรูปแบบ พ.ศ. และ ค.ศ. จาก <input type="date">
  const parts = birthDateStr.split('-');
  const inputYear = parseInt(parts[0], 10);

  const yearBE = inputYear >= 2400 ? inputYear : inputYear + 543;
  const yearCE = yearBE - 543;

  // 3. ตรวจสอบเงื่อนไข: ต้องเป็น พ.ศ. 2500 (ค.ศ. 1957) ขึ้นไป
  if (isNaN(yearBE) || yearBE < 2500) {
    alert('กรุณากรอกปีเกิดตั้งแต่ พ.ศ. 2500 (ค.ศ. 1957) ขึ้นไปเท่านั้น');
    return;
  }

  // เปลี่ยนปีในวันที่ให้เป็น ค.ศ. เพื่อความถูกต้องเวลาเอาไปใช้งานต่อ
  parts[0] = String(yearCE);
  const birthDateCE = parts.join('-'); // เช่น "1995-05-15"

  // 4. ดึงค่า Lat และ Long จากตัวแปร thailandData (ที่อยู่ใน district.js)
  let lat = null;
  let lng = null;

  if (typeof thailandData !== 'undefined' && thailandData.length > 0) {
    const provinceObj = thailandData.find(item => item.CH_ID === provinceSelect.value);
    if (provinceObj && provinceObj.AMPHOES) {
      const amphoeObj = provinceObj.AMPHOES.find(amp => amp.AM_ID === amphoeId);
      if (amphoeObj) {
        lat = amphoeObj.LAT_AVG;
        lng = amphoeObj.LONG_AVG;
      }
    }
  }

  if (lat === null || lng === null) {
    alert('ไม่พบข้อมูลพิกัดของอำเภอนี้ กรุณาเลือกใหม่อีกครั้ง');
    return;
  }

  // 5. บันทึกลง localStorage (เก็บบันทึกปีเป็น ค.ศ. และ พ.ศ.)
  const birthData = {
    birthDateCE,
    birthYearBE: yearBE,
    birthTime,
    province: provinceText,
    amphoe: amphoeText,
    latitude: lat,
    longitude: lng,
    savedAt: new Date().toISOString()
  };

  localStorage.setItem('user_birth_info', JSON.stringify(birthData));

  // 6. โหลด Template หน้าแสดงผลและหยอดค่าข้อมูล
  try {
    await renderBirthResult(birthData);

    // สั่งให้หน้าจอเลื่อนกลับขึ้นไปด้านบนสุด เพื่อให้ Header ยังคงแสดงอยู่
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Error loading template:', error);
    alert('บันทึกข้อมูลสำเร็จ แต่เกิดข้อผิดพลาดในการโหลดผลลัพธ์');
  }
}
