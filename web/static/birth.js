// ==========================================
// birth.js - จัดการการตรวจสอบวันเกิด คำนวณพิกัด และบันทึกข้อมูล
// ==========================================

// 1. ตรวจสอบข้อมูลใน sessionStorage ทันทีที่โหลดไฟล์ (พร้อมเคลียร์ค่าเก่าที่อาจค้างใน localStorage)
function initBirthInfo() {
  localStorage.removeItem('user_birth_info');
  localStorage.removeItem('user_hora_result');
  checkExistingBirthInfo();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBirthInfo);
} else {
  initBirthInfo();
}

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

// ฟังก์ชันกลางสำหรับโหลด Template และแสดงผลข้อมูลวันเกิด
async function renderBirthResult(birthData) {
  const response = await fetch(`/static/result-template.html?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('ไม่สามารถโหลดเทมเพลตผลลัพธ์ได้');

  const html = await response.text();
  const container = document.getElementById('resultContainer');
  container.innerHTML = html;

  const yearCE = parseInt(birthData.birthYearBE, 10) - 543;
  document.getElementById('resYearBE').textContent = formatThaiDateBE(birthData.birthDateCE, birthData.birthYearBE);
  document.getElementById('resYearCE').textContent = yearCE;
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

  // หากมีผลลัพธ์ตำแหน่งดาวใน localStorage อยู่แล้ว ให้แสดงตารางตำแหน่งดาวทันที
  if (typeof checkExistingHoraResult === 'function') {
    checkExistingHoraResult(birthData);
  }
}

// ฟังก์ชันตรวจสอบและแสดงผลข้อมูลเก่าถ้ามีอยู่แล้วใน sessionStorage
async function checkExistingBirthInfo() {
  const savedDataStr = sessionStorage.getItem('user_birth_info');
  if (!savedDataStr) return; // ถ้าไม่มีข้อมูล ให้แสดงฟอร์มตามปกติ

  try {
    const birthData = JSON.parse(savedDataStr);
    await renderBirthResult(birthData);
  } catch (error) {
    console.error('Error loading existing birth info:', error);
  }
}

async function submitBirthInfo() {
  if (sessionStorage.getItem('user_hora_result')) {
    alert('คำนวณตำแหน่งดาวเรียบร้อยแล้ว ไม่สามารถแก้ไขข้อมูลวันเกิดได้');
    return;
  }

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

  // 2. ดึงปีที่ผู้ใช้กรอกมา (ซึ่งเป็น พ.ศ.)
  const parts = birthDateStr.split('-'); // [ปีพศ, เดือน, วัน]
  const inputYear = parseInt(parts[0], 10);

  // 3. ตรวจสอบเงื่อนไข: ต้องเป็น พ.ศ. 2500 ขึ้นไป (>= 2500)
  if (isNaN(inputYear) || inputYear < 2500) {
    alert('กรุณากรอกปีเกิดตั้งแต่ พ.ศ. 2500 ขึ้นไปเท่านั้น');
    return;
  }

  const yearBE = inputYear;        // เก็บปี พ.ศ. ไว้ (เช่น 2538)
  const yearCE = inputYear - 543;  // แปลงเป็น ค.ศ. สำหรับเก็บ (เช่น 1995)

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

  // 5. บันทึกลง sessionStorage (ปิดแท็บ/เบราว์เซอร์แล้วข้อมูลจะถูกลบอัตโนมัติ)
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

  sessionStorage.removeItem('user_hora_result');
  sessionStorage.setItem('user_birth_info', JSON.stringify(birthData));

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
