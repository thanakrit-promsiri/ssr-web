// ==========================================
// birth.js - จัดการการตรวจสอบวันเกิด คำนวณพิกัด และบันทึกข้อมูล
// ==========================================

// 1. ตรวจสอบข้อมูลใน sessionStorage ทันทีที่โหลดไฟล์ (พร้อมเคลียร์ค่าเก่าที่อาจค้างใน localStorage)
function initBirthInfo() {
  localStorage.removeItem('user_birth_info');
  localStorage.removeItem('user_hora_result');
  void checkExistingBirthInfo();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBirthInfo);
} else {
  initBirthInfo();
}

// ฟังก์ชันกลางสำหรับโหลด Template และแสดงผลข้อมูลวันเกิด
async function renderBirthResult(birthData) {
  const response = await fetch(`/static/result-template.html?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('ไม่สามารถโหลดเทมเพลตผลลัพธ์ได้');

  // แปลง HTML ด้วย DOMParser (ไม่รัน Script) แล้วนำเฉพาะ Node ที่ปลอดภัยมาแทรกใน DOM
  // แทนการกำหนด innerHTML ตรง ๆ เพื่อป้องกัน DOM XSS หากไฟล์ Template ถูกแก้ไขหรือถูกแทรกแซง
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  doc.querySelectorAll('script, iframe, object, embed, link, meta, base').forEach(el => el.remove());

  const container = document.getElementById('resultContainer');
  container.replaceChildren(...Array.from(doc.body.childNodes).map(node => document.importNode(node, true)));

  const yearCE = Number.parseInt(birthData.birthYearBE, 10) - 543;
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

  // หากมีผลลัพธ์ตำแหน่งดาวใน sessionStorage อยู่แล้ว ให้แสดงตารางตำแหน่งดาวทันที
  if (typeof checkExistingHoraResult === 'function') {
    await checkExistingHoraResult(birthData);
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

  // 2. ดึงปีจากค่า input type="date"
  // หมายเหตุ: บน iOS Safari / Facebook In-App Browser ที่ตั้งปฏิทินเครื่องเป็น พ.ศ.
  // หน้าจอจะให้ผู้ใช้เลือกเป็น "2538" แต่ค่า .value ที่เบราว์เซอร์คืนมาจะเป็น ค.ศ. "1995-MM-DD" เสมอ
  // ส่วนบน Desktop หากผู้ใช้พิมพ์ "2538" ตรง ๆ ค่า .value จะเป็น "2538-MM-DD"
  const parts = birthDateStr.split('-'); // [ปี, เดือน, วัน]
  const inputYear = Number.parseInt(parts[0], 10);

  if (Number.isNaN(inputYear)) {
    alert('กรุณากรอกปีเกิดตั้งแต่ พ.ศ. 2500 ขึ้นไปเท่านั้น');
    return;
  }

  // แยกแยะอัตโนมัติว่าค่าปีที่ได้จาก input.value เป็น พ.ศ. (>= 2400) หรือ ค.ศ. (< 2400)
  const yearBE = inputYear >= 2400 ? inputYear : inputYear + 543;
  const yearCE = inputYear >= 2400 ? inputYear - 543 : inputYear;

  // 3. ตรวจสอบเงื่อนไข: ต้องเป็น พ.ศ. 2500 (ค.ศ. 1957) ขึ้นไป
  if (yearBE < 2500) {
    alert('กรุณากรอกปีเกิดตั้งแต่ พ.ศ. 2500 ขึ้นไปเท่านั้น');
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
