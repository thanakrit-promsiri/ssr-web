// ==========================================
// astrology.js - จัดการการประมวลผลดวงชะตาและปุ่มการทำงาน
// ==========================================

// 1. ฟังก์ชันกดปุ่มคำนวณดวงชะตา
async function calculateAstrology() {
  const savedDataStr = localStorage.getItem('user_birth_info');
  if (!savedDataStr) {
    alert('ไม่พบข้อมูลวันเกิด กรุณากรอกข้อมูลใหม่อีกครั้ง');
    resetBirthInfo();
    return;
  }

  const birthData = JSON.parse(savedDataStr);

  // ดึง Element จากหน้าเว็บ
  const astroArea = document.getElementById('astroCalculationArea');
  const astroLoading = document.getElementById('astroLoading');
  const astroOutput = document.getElementById('astroOutput');

  if (astroArea) astroArea.classList.remove('hidden');
  if (astroLoading) astroLoading.classList.remove('hidden');
  if (astroOutput) astroOutput.innerHTML = '';

  try {
    // ตัวอย่างการส่งข้อมูลไปยัง Backend API เพื่อคำนวณโหราศาสตร์จริง (ปรับ URL ตามระบบ Go ของคุณ)
    /*
    const response = await fetch('/api/v1/astrology/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(birthData)
    });
    const result = await response.json();
    */

    // จำลองระยะเวลาประมวลผล (1 วินาที)
    setTimeout(() => {
      if (astroLoading) astroLoading.classList.add('hidden');
      if (astroOutput) {
        astroOutput.innerHTML = `
          <div class="bg-purple-950/40 p-4 rounded-xl border border-purple-500/30 space-y-2">
            <h4 class="font-semibold text-amber-300 text-sm">✨ ผลการคำนวณลัคนาและดาวเคราะห์</h4>
            <p><strong>วันเกิด:</strong> <span id="astroBirthDateText"></span></p>
            <p><strong>สถานที่:</strong> <span id="astroLocationText"></span></p>
            <p><strong>พิกัดคำนวณ:</strong> <span id="astroCoordText"></span></p>
            <p class="text-emerald-400 mt-2">✅ คำนวณตำแหน่งดาวและสมโณฤกษ์เรียบร้อยแล้ว พร้อมสำหรับการทำนายต่อในขั้นตอนถัดไป</p>
          </div>
        `;

        document.getElementById('astroBirthDateText').textContent =
          `พ.ศ. ${birthData.birthYearBE} (${birthData.birthDateCE}) เวลา ${birthData.birthTime} น.`;
        document.getElementById('astroLocationText').textContent =
          `อ. ${birthData.amphoe} จ. ${birthData.province}`;
        document.getElementById('astroCoordText').textContent =
          `Lat ${birthData.latitude}, Long ${birthData.longitude}`;
      }
    }, 1000);

  } catch (error) {
    console.error('Calculation Error:', error);
    if (astroLoading) astroLoading.classList.add('hidden');
    if (astroOutput) astroOutput.innerHTML = '<p class="text-red-400">เกิดข้อผิดพลาดในการคำนวณดวงชะตา กรุณาลองใหม่อีกครั้ง</p>';
  }
}

// 2. ฟังก์ชันเมื่อกดแก้ไขข้อมูลวันเกิด (ลบ LocalStorage, เคลียร์ฟอร์ม และเปิดฟอร์มกลับมา)
function resetBirthInfo() {
  localStorage.removeItem('user_birth_info');
  
  // แสดงฟอร์มกรอกข้อมูลกลับมา
  const formContainer = document.getElementById('formContainer');
  if (formContainer) {
    formContainer.classList.remove('hidden');
  }

  // ซ่อนและล้างกล่องผลลัพธ์
  const resultContainer = document.getElementById('resultContainer');
  if (resultContainer) {
    resultContainer.classList.add('hidden');
    resultContainer.innerHTML = '';
  }

  // ล้างค่าฟอร์มช่องกรอกให้ว่าง พร้อมกรอกรอบใหม่
  const birthDateInput = document.getElementById('birthDate');
  const birthTimeInput = document.getElementById('birthTime');
  const provinceSelect = document.getElementById('provinceSelect');
  const amphoeSelect = document.getElementById('amphoeSelect');

  if (birthDateInput) birthDateInput.value = '';
  if (birthTimeInput) birthTimeInput.value = '';
  if (provinceSelect) provinceSelect.value = '';
  if (amphoeSelect) {
    amphoeSelect.innerHTML = '<option value="">-- เลือกอำเภอ/เขต --</option>';
  }
}