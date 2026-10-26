// ==========================================
// birth.js - จัดการการตรวจสอบวันเกิด คำนวณพิกัด และบันทึกข้อมูล
// ==========================================

// 1. ตรวจสอบข้อมูลใน localStorage ทันทีที่โหลดไฟล์
document.addEventListener('DOMContentLoaded', () => {
  checkExistingBirthInfo();
});

// ฟังก์ชันตรวจสอบและแสดงผลข้อมูลเก่าถ้ามีอยู่แล้ว
async function checkExistingBirthInfo() {
  const savedDataStr = localStorage.getItem('user_birth_info');
  if (!savedDataStr) return; // ถ้าไม่มีข้อมูล ให้แสดงฟอร์มตามปกติ

  try {
    const birthData = JSON.parse(savedDataStr);
    
    // 1. ซ่อนฟอร์มทันทีที่พบข้อมูลใน localStorage
    const formContainer = document.getElementById('formContainer');
    if (formContainer) {
      formContainer.style.display = 'none';
    }

    // 2. โหลด Template หน้าแสดงผล
    const response = await fetch('/static/result-template.html?date=' + new Date().getTime());
    if (!response.ok) throw new Error('ไม่สามารถโหลดเทมเพลตผลลัพธ์ได้');
    
    const html = await response.text();
    const container = document.getElementById('resultContainer');
    container.innerHTML = html;

    // 3. นำค่าข้อมูลเดิมไปหยอดลงใน Tag ID ของ Template
    document.getElementById('resYearBE').textContent = birthData.birthYearBE;
    document.getElementById('resYearCE').textContent = parseInt(birthData.birthYearBE) - 543;
    document.getElementById('resTime').textContent = birthData.birthTime;
    document.getElementById('resAmphoe').textContent = birthData.amphoe;
    document.getElementById('resProvince').textContent = birthData.province;
    document.getElementById('resLat').textContent = birthData.latitude;
    document.getElementById('resLng').textContent = birthData.longitude;

    // 4. แสดงกล่องผลลัพธ์
    container.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading existing birth info:', error);
  }
}

async function submitBirthInfo() {
  const birthDateStr = document.getElementById('birthDate').value; // วัน/เดือน/ปีเกิด[cite: 7]
  const birthTime = document.getElementById('birthTime').value;    // เวลาเกิด[cite: 7]
  
  const provinceSelect = document.getElementById('provinceSelect');
  const provinceText = provinceSelect.options[provinceSelect.selectedIndex]?.text || '';
  
  const amphoeSelect = document.getElementById('amphoeSelect');
  const amphoeId = amphoeSelect.value;
  const amphoeText = amphoeSelect.options[amphoeSelect.selectedIndex]?.text || '';

  // 1. บังคับกรอกข้อมูลให้ครบถ้วนทุกช่องตามจริง ห้ามว่าง[cite: 7]
  if (!birthDateStr || !birthTime || !provinceSelect.value || !amphoeId) {
    alert('กรุณากรอกข้อมูลให้ครบถ้วนทุกช่องตามจริง');
    return;
  }

  // 2. ดึงปีที่ผู้ใช้กรอกมา (ซึ่งเป็น พ.ศ.)[cite: 7]
  const parts = birthDateStr.split('-'); //[cite: 7] [ปีพศ, เดือน, วัน]
  const inputYear = parseInt(parts[0], 10);

  // 3. ตรวจสอบเงื่อนไข: ต้องเป็น พ.ศ. 2500 ขึ้นไป (>= 2500)[cite: 7]
  if (inputYear < 2500) {
    alert('กรุณากรอกปีเกิดตั้งแต่ พ.ศ. 2500 ขึ้นไปเท่านั้น');
    return;
  }

  const yearBE = inputYear;        // เก็บปี พ.ศ. ไว้ (เช่น 2538)[cite: 7]
  const yearCE = inputYear - 543;  // แปลงเป็น ค.ศ. สำหรับเก็บ (เช่น 1995)[cite: 7]

  // เปลี่ยนปีในวันที่ให้เป็น ค.ศ. เพื่อความถูกต้องเวลาเอาไปใช้งานต่อ[cite: 7]
  parts[0] = yearCE;
  const birthDateCE = parts.join('-'); // จะได้ "1995-05-15"[cite: 7]

  // 4. ดึงค่า Lat และ Long จากตัวแปร thailandData (ที่อยู่ใน district.js)[cite: 7]
  let lat = null;
  let lng = null;

  if (typeof thailandData !== 'undefined' && thailandData.length > 0) {
    const provinceObj = thailandData.find(item => item.CH_ID === provinceSelect.value);
    if (provinceObj && provinceObj.AMPHOES) {
      const amphoeObj = provinceObj.AMPHOES.find(amp => amp.AM_ID === amphoeId);
      if (amphoeObj) {
        lat = amphoeObj.LAT_AVG;   //[cite: 2, 7]
        lng = amphoeObj.LONG_AVG;  //[cite: 2, 7]
      }
    }
  }

  if (lat === null || lng === null) {
    alert('ไม่พบข้อมูลพิกัดของอำเภอนี้ กรุณาเลือกใหม่อีกครั้ง');
    return;
  }

  // 5. บันทึกลง localStorage (เก็บบันทึกปีเป็น ค.ศ.)[cite: 7]
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
  console.log('Saved to localStorage:', birthData);
  
  // 6. โหลด Template หน้าแสดงผลจากไฟล์ภายนอก[cite: 7]
  try {
    const response = await fetch('/static/result-template.html?date=' + new Date().getTime());
    if (!response.ok) throw new Error('ไม่สามารถโหลดเทมเพลตผลลัพธ์ได้');
    
    const html = await response.text();
    const container = document.getElementById('resultContainer');
    container.innerHTML = html;

    // นำค่าข้อมูลไปหยอดลงใน Tag ID ของ Template[cite: 7]
    document.getElementById('resYearBE').textContent = yearBE;
    document.getElementById('resYearCE').textContent = yearCE;
    document.getElementById('resTime').textContent = birthTime;
    document.getElementById('resAmphoe').textContent = amphoeText;
    document.getElementById('resProvince').textContent = provinceText;
    document.getElementById('resLat').textContent = lat;
    document.getElementById('resLng').textContent = lng;

    // [จุดที่แก้ไข] ซ่อนกล่องฟอร์มกรอกข้อมูลด้วย style.display = 'none' ให้สอดคล้องกัน
    const formContainer = document.getElementById('formContainer');
    if (formContainer) {
      formContainer.style.display = 'none';
    }

    container.classList.remove('hidden');
    
    // สั่งให้หน้าจอเลื่อนกลับขึ้นไปด้านบนสุด เพื่อให้ Header ยังคงแสดงอยู่[cite: 7]
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Error loading template:', error);
    alert('บันทึกข้อมูลสำเร็จ แต่เกิดข้อผิดพลาดในการโหลดผลลัพธ์');
  }
}