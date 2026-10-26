// ==========================================
// district.js - จัดการข้อมูลจังหวัด อำเภอ และพิกัดจาก district.json
// ==========================================

let thailandData = [];

// ฟังก์ชันโหลดไฟล์ district.json เมื่อเปิดหน้าเว็บ
async function loadDistrictData() {
  try {
    const response = await fetch('/static/district.json?date=' + new Date().getTime());
    if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลพื้นที่ได้');
    
    thailandData = await response.json();
    
    const provinceSelect = document.getElementById('provinceSelect');
    if (provinceSelect) {
      thailandData.forEach(item => {
        const option = document.createElement('option');
        option.value = item.CH_ID;
        option.textContent = item.CHANGWAT_T;
        provinceSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading district.json:', error);
  }
}

// ฟังก์ชันทำงานเมื่อผู้ใช้เปลี่ยนจังหวัด
function onProvinceChange() {
  const provinceSelect = document.getElementById('provinceSelect');
  const amphoeSelect = document.getElementById('amphoeSelect');
  
  if (!provinceSelect || !amphoeSelect) return;

  const selectedChId = provinceSelect.value;
  
  // ล้างค่าอำเภอเดิมออกก่อน
  amphoeSelect.innerHTML = '<option value="">-- เลือกอำเภอ/เขต --</option>';
  if (!selectedChId) return;

  // ค้นหาข้อมูลจังหวัดที่เลือกจากอาเรย์
  const provinceObj = thailandData.find(item => item.CH_ID === selectedChId);
  
  if (provinceObj && provinceObj.AMPHOES) {
    provinceObj.AMPHOES.forEach(amp => {
      const option = document.createElement('option');
      option.value = amp.AM_ID;
      option.textContent = amp.AMPHOE_T;
      amphoeSelect.appendChild(option);
    });
  }
}