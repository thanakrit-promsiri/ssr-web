// ==========================================
// astrology.js - จัดการการประมวลผลดวงชะตาและปุ่มการทำงาน
// ==========================================

const HORA_STORAGE_KEY = 'user_hora_result';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// แปลงเวลา "10:35" เป็นรูปแบบทศนิยม hour_thai 10.35 ตามที่ lahiri-api กำหนด
function parseHourThai(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2) return parseFloat(timeStr) || 0;
  const hour = parseInt(parts[0], 10) || 0;
  const minute = parseInt(parts[1], 10) || 0;
  return parseFloat(`${hour}.${String(minute).padStart(2, '0')}`);
}

// เลือกสีป้ายกำกับตามมาตรฐานดาวพระเวท (Dignity)
function getDignityBadgeClass(dignity, dignityThai) {
  const key = `${dignity || ''} ${dignityThai || ''}`.toLowerCase();
  if (key.includes('exalt') || key.includes('อุจจ์')) {
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  }
  if (key.includes('moola') || key.includes('มูลไตรโกณ')) {
    return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
  }
  if (key.includes('own') || key.includes('เกษตร')) {
    return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
  }
  if (key.includes('friend') || key.includes('มิตร')) {
    return 'bg-teal-500/20 text-teal-300 border-teal-500/40';
  }
  if (key.includes('debil') || key.includes('นิจ')) {
    return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  }
  if (key.includes('enemy') || key.includes('ศัตรู')) {
    return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
  }
  if (
    key.includes('ลัคนา') ||
    key.includes('ascendant') ||
    key.includes('descendant') ||
    key.includes('midheaven') ||
    key.includes('imum coeli')
  ) {
    return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  }
  return 'bg-slate-800 text-slate-300 border-slate-700';
}

// ฟังก์ชันแสดงตารางตำแหน่งดาวพระเวทลงในหน้าเว็บ
function renderAstrologyTable(calc, birthData) {
  const astroArea = document.getElementById('astroCalculationArea');
  const astroLoading = document.getElementById('astroLoading');
  const astroOutput = document.getElementById('astroOutput');
  const editBirthBtn = document.getElementById('editBirthBtn');

  if (astroArea) astroArea.classList.remove('hidden');
  if (astroLoading) astroLoading.classList.add('hidden');
  // ซ่อนปุ่มแก้ไขข้อมูลทันทีที่มีข้อมูลตารางสมผุสดาวแล้ว
  if (editBirthBtn) editBirthBtn.classList.add('hidden');
  if (!astroOutput || !calc) return;

  // ดึงลัคนาและจุดมุมสำคัญทั้ง 4 (Ascendant, Descendant, Midheaven, Imum Coeli) มาแสดงก่อนดาวเคราะห์ทั้งหมด
  const housesAndAngles = calc.houses_and_angles || [];
  const angleConfigs = [
    {
      match: a => a.name === 'Ascendant (ASC)' || String(a.name || '').includes('Ascendant') || a.name_thai === 'ลัคนา',
      defaultSymbol: 'ลั',
      defaultNameThai: 'ลัคนา',
      defaultHouseThai: '1 (ตนุ)',
      dignity: 'Ascendant',
      dignityThai: 'ลัคนา'
    },
    {
      match: a => a.name === 'Descendant (DSC)' || String(a.name || '').includes('Descendant') || a.name_thai === 'อัสตลัคนา',
      defaultSymbol: 'DSC',
      defaultNameThai: 'อัสตลัคนา',
      defaultHouseThai: '7 (ปัตนิ)',
      dignity: 'Descendant',
      dignityThai: 'อัสตลัคนา'
    },
    {
      match: a => a.name === 'Midheaven (MC)' || String(a.name || '').includes('Midheaven') || a.name_thai === 'มัธยลัคนา',
      defaultSymbol: 'MC',
      defaultNameThai: 'มัธยลัคนา',
      defaultHouseThai: '10 (กัมมะ)',
      dignity: 'Midheaven',
      dignityThai: 'มัธยลัคนา'
    },
    {
      match: a => a.name === 'Imum Coeli (IC)' || String(a.name || '').includes('Imum Coeli') || a.name_thai === 'ปาตาลลัคนา',
      defaultSymbol: 'IC',
      defaultNameThai: 'ปาตาลลัคนา',
      defaultHouseThai: '4 (พันธุ)',
      dignity: 'Imum Coeli',
      dignityThai: 'ปาตาลลัคนา'
    }
  ];

  const allRows = [];

  angleConfigs.forEach(cfg => {
    const angle = housesAndAngles.find(cfg.match);
    if (angle) {
      allRows.push({
        isAscendant: true,
        isRetrograde: false,
        isCombust: false,
        symbol: angle.symbol || cfg.defaultSymbol,
        nameThai: angle.name_thai || cfg.defaultNameThai,
        signThai: angle.position?.sign_thai || angle.position?.sign || '-',
        degreeFormatted: angle.degree_formatted || '-',
        nakshatraThai: angle.nakshatra_thai || angle.nakshatra || '-',
        pada: angle.pada || '-',
        lordThai: angle.lord_thai || angle.lord || '-',
        navamsaThai: angle.navamsa?.sign_thai || angle.navamsa?.sign || '-',
        houseThai: angle.house_thai || (angle.house ? `${angle.house} (${angle.house_name_thai || ''})` : cfg.defaultHouseThai),
        dignity: angle.dignity || cfg.dignity,
        dignityThai: angle.dignity_thai || cfg.dignityThai
      });
    }
  });

  (calc.planets || []).forEach(p => {
    allRows.push({
      isAscendant: false,
      isRetrograde: Boolean(p.is_retrograde),
      isCombust: Boolean(p.is_combust),
      symbol: p.symbol || '-',
      nameThai: p.name_thai || p.name || '-',
      signThai: p.position?.sign_thai || p.position?.sign || '-',
      degreeFormatted: p.degree_formatted || '-',
      nakshatraThai: p.nakshatra_thai || p.nakshatra || '-',
      pada: p.pada || '-',
      lordThai: p.lord_thai || p.lord || '-',
      navamsaThai: p.navamsa?.sign_thai || p.navamsa?.sign || '-',
      houseThai: p.house_thai || (p.house ? `${p.house} (${p.house_name_thai || ''})` : '-'),
      dignity: p.dignity || '',
      dignityThai: p.dignity_thai || p.dignity || 'ปกติ'
    });
  });

  const rowsHtml = allRows.map(item => {
    const rowHighlight = item.isAscendant
      ? 'bg-amber-500/10 border-b border-amber-500/20'
      : 'border-b border-slate-800/80 hover:bg-purple-950/30 transition';

    const retroBadge = item.isRetrograde && !String(item.nameThai).includes('พักร์')
      ? '<span class="ml-1 text-[10px] text-sky-300 font-normal">(พักร์)</span>'
      : '';
    const combustBadge = item.isCombust
      ? '<span class="ml-1 text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 rounded px-1 py-0.2">ดับ</span>'
      : '';
    const badgeClass = getDignityBadgeClass(item.dignity, item.dignityThai);

    return `
      <tr class="${rowHighlight}">
        <td class="py-2.5 px-3 font-medium text-amber-200 whitespace-nowrap">
          <span class="inline-block w-7 text-[10px] font-mono text-purple-300 bg-purple-950/80 border border-purple-500/30 rounded px-1 py-0.5 mr-1.5 text-center">${escapeHtml(item.symbol)}</span>
          ${escapeHtml(item.nameThai)}${retroBadge}${combustBadge}
        </td>
        <td class="py-2.5 px-3 text-slate-200 whitespace-nowrap">${escapeHtml(item.signThai)}</td>
        <td class="py-2.5 px-3 font-mono text-amber-300 whitespace-nowrap">${escapeHtml(item.degreeFormatted)}</td>
        <td class="py-2.5 px-3 text-slate-200 whitespace-nowrap">
          ${escapeHtml(item.nakshatraThai)}
          <span class="text-[11px] text-purple-300 font-medium ml-1">(บาท ${escapeHtml(item.pada)})</span>
        </td>
        <td class="py-2.5 px-3 text-slate-300 whitespace-nowrap">${escapeHtml(item.lordThai)}</td>
        <td class="py-2.5 px-3 text-purple-200 whitespace-nowrap">${escapeHtml(item.navamsaThai)}</td>
        <td class="py-2.5 px-3 text-slate-300 whitespace-nowrap">${escapeHtml(item.houseThai)}</td>
        <td class="py-2.5 px-3 text-center whitespace-nowrap">
          <span class="text-[10px] px-2 py-0.5 rounded-full border ${badgeClass}">${escapeHtml(item.dignityThai)}</span>
        </td>
      </tr>
    `;
  }).join('');

  const moonObj = (calc.planets || []).find(p => p.name === 'Moon');
  const dasha = calc.vimshottari_dasha || {};
  const currentDasha = dasha.current_dasha || {};

  const moonNakshatraSummary = moonObj
    ? `${moonObj.nakshatra_thai || moonObj.nakshatra} (บาทที่ ${moonObj.pada}) — เจ้าฤกษ์: ${moonObj.lord_thai || moonObj.lord}`
    : (dasha.moon_nakshatra_thai || '-');

  const dashaBalanceText = dasha.balance_at_birth || '-';
  const mahaText = currentDasha.mahadasha_lord_thai
    ? `${currentDasha.mahadasha_lord_thai} (${currentDasha.mahadasha_start || ''} ถึง ${currentDasha.mahadasha_end || ''})`
    : '-';
  const antarText = currentDasha.antardasha_lord_thai
    ? `${currentDasha.antardasha_lord_thai} (${currentDasha.antardasha_start || ''} ถึง ${currentDasha.antardasha_end || ''})`
    : '-';

  const ayanamsaName = calc.metadata?.ayanamsa_name || 'Lahiri';
  const ayanamsaDeg = calc.metadata?.ayanamsa_degrees || '-';

  astroOutput.innerHTML = `
    <div class="bg-slate-950/80 p-4 rounded-xl border border-purple-500/30 space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-slate-800 pb-3">
        <div>
          <h4 class="font-semibold text-amber-300 text-sm">🕉️ ตารางสมผุสดาวโหราศาสตร์พระเวท (Nirayana Graha Sphuta)</h4>
          <p class="text-[11px] text-slate-400">เกณฑ์คำนวณ: ${escapeHtml(ayanamsaName)} Ayanamsa: ${escapeHtml(ayanamsaDeg)} | Whole Sign (W)</p>
        </div>
        <span class="self-start sm:self-auto text-[10px] bg-purple-900/50 text-purple-200 border border-purple-500/30 px-2.5 py-1 rounded-lg">
          D-1 Rashi &amp; D-9 Navamsa
        </span>
      </div>

      <!-- ข้อมูลเจ้าชะตาโดยย่อ -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
        <div><span class="text-slate-400">วันเวลาเกิด:</span> <span id="astroBirthDateText" class="text-slate-200 font-medium"></span></div>
        <div><span class="text-slate-400">สถานที่:</span> <span id="astroLocationText" class="text-slate-200 font-medium"></span></div>
        <div><span class="text-slate-400">พิกัด:</span> <span id="astroCoordText" class="text-amber-300 font-mono"></span></div>
      </div>

      <!-- ตารางตำแหน่งดาวพระเวท -->
      <div class="overflow-x-auto rounded-xl border border-slate-800">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-purple-950/60 text-purple-200 border-b border-purple-500/20 text-[11px]">
              <th class="py-2.5 px-3 font-semibold whitespace-nowrap">ดาว / ปัจจัย</th>
              <th class="py-2.5 px-3 font-semibold whitespace-nowrap">ราศี (Rashi)</th>
              <th class="py-2.5 px-3 font-semibold whitespace-nowrap">องศา (Degree)</th>
              <th class="py-2.5 px-3 font-semibold whitespace-nowrap">นักษัตรฤกษ์ (บาท)</th>
              <th class="py-2.5 px-3 font-semibold whitespace-nowrap">เจ้าฤกษ์ (Lord)</th>
              <th class="py-2.5 px-3 font-semibold whitespace-nowrap">นวางศ์ (D-9)</th>
              <th class="py-2.5 px-3 font-semibold whitespace-nowrap">ภพ (House)</th>
              <th class="py-2.5 px-3 font-semibold text-center whitespace-nowrap">มาตรฐานดาว</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60 bg-slate-950/40">
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <!-- สรุปจันทร์เสวยฤกษ์ และวิมโสตรีทศา (Vimshottari Dasha) -->
      <div class="bg-purple-950/30 p-3 rounded-lg border border-purple-500/20 space-y-1.5 text-[11px]">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <span class="text-amber-300 font-semibold">🌟 จันทร์เสวยฤกษ์:</span>
            <span class="text-slate-200">${escapeHtml(moonNakshatraSummary)}</span>
          </div>
          <div>
            <span class="text-purple-300 font-semibold">⏳ ทศาคงเหลือแรกเกิด:</span>
            <span class="text-slate-200">${escapeHtml(dashaBalanceText)}</span>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1 border-t border-purple-500/10">
          <div>
            <span class="text-emerald-300 font-semibold">🪐 มหาทศาปัจจุบัน:</span>
            <span class="text-slate-200">${escapeHtml(mahaText)}</span>
          </div>
          <div>
            <span class="text-sky-300 font-semibold">✨ อันตรทศาปัจจุบัน:</span>
            <span class="text-slate-200">${escapeHtml(antarText)}</span>
          </div>
        </div>
      </div>

      <p class="text-emerald-400 text-xs pt-1">
        ✅ คำนวณสมผุสดาว 27 นักษัตรฤกษ์ นวางศ์ และวิมโสตรีทศาจากระบบ lahiri-api เรียบร้อยแล้ว
      </p>
    </div>
  `;

  if (birthData) {
    const yearCE = parseInt(birthData.birthYearBE, 10) - 543;
    const thaiDateText = typeof formatThaiDateBE === 'function'
      ? formatThaiDateBE(birthData.birthDateCE, birthData.birthYearBE)
      : `พ.ศ. ${birthData.birthYearBE}`;

    document.getElementById('astroBirthDateText').textContent =
      `${thaiDateText} (ค.ศ. ${yearCE}) เวลา ${birthData.birthTime} น.`;
    document.getElementById('astroLocationText').textContent =
      `อ. ${birthData.amphoe} จ. ${birthData.province}`;
    document.getElementById('astroCoordText').textContent =
      `${birthData.latitude}, ${birthData.longitude}`;
  }
}

// ตรวจสอบว่ามีผลลัพธ์ตำแหน่งดาวใน sessionStorage หรือไม่ หากมีให้แสดงทันที
function checkExistingHoraResult(birthData) {
  const savedHoraStr = sessionStorage.getItem(HORA_STORAGE_KEY);
  if (!savedHoraStr) return false;

  try {
    const savedResult = JSON.parse(savedHoraStr);
    if (savedResult && savedResult.calculateResp) {
      console.log('📦 [DEBUG:Hora] พบข้อมูลตำแหน่งดาวใน sessionStorage แสดงผลตารางทันที');
      renderAstrologyTable(savedResult.calculateResp, birthData);
      return true;
    }
  } catch (err) {
    console.error('Error parsing saved hora result:', err);
    sessionStorage.removeItem(HORA_STORAGE_KEY);
  }
  return false;
}

// 1. ฟังก์ชันกดปุ่มคำนวณดวงชะตา (ตรวจ sessionStorage ก่อน หากไม่มีจึงเรียก API)
async function calculateAstrology() {
  const savedDataStr = sessionStorage.getItem('user_birth_info');
  if (!savedDataStr) {
    alert('ไม่พบข้อมูลวันเกิด กรุณากรอกข้อมูลใหม่อีกครั้ง');
    resetBirthInfo();
    return;
  }

  const birthData = JSON.parse(savedDataStr);

  // หากมีผลลัพธ์ใน sessionStorage แล้ว ให้แสดงผลทันทีโดยไม่ต้องยิง API ซ้ำ
  if (checkExistingHoraResult(birthData)) {
    return;
  }

  // แยก ปี-เดือน-วัน ค.ศ. จาก birthDateCE (เช่น "1988-12-23")
  const [yearStr, monthStr, dayStr] = String(birthData.birthDateCE || '').split('-');
  const payload = {
    calculateReq: {
      year: parseInt(yearStr, 10),
      month: parseInt(monthStr, 10),
      day: parseInt(dayStr, 10),
      hour_thai: parseHourThai(birthData.birthTime),
      time_zone: 7.0,
      latitude: parseFloat(birthData.latitude),
      longitude: parseFloat(birthData.longitude),
      house_system: 'W'
    }
  };

  // ดึง Element จากหน้าเว็บ
  const astroArea = document.getElementById('astroCalculationArea');
  const astroLoading = document.getElementById('astroLoading');
  const astroOutput = document.getElementById('astroOutput');

  if (astroArea) astroArea.classList.remove('hidden');
  if (astroLoading) astroLoading.classList.remove('hidden');
  if (astroOutput) astroOutput.innerHTML = '';

  try {
    console.log('🔮 [DEBUG:Hora] กำลังส่งคำขอคำนวณดวงชะตา:', payload);

    // เรียก /hora/calculate ที่ ssr-web โดยตรง (ป้องกันกรณี Nginx ดัก /api/* ไปที่ Auth Service)
    let response = await fetch('/hora/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    console.log('🔮 [DEBUG:Hora] ผลตอบกลับจาก /hora/calculate -> HTTP Status:', response.status);

    if (response.status === 404) {
      console.warn('⚠️ [DEBUG:Hora] /hora/calculate คืนค่า 404 ลองเรียก /api/v1/hora/calculate แทน...');
      response = await fetch('/api/v1/hora/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      console.log('🔮 [DEBUG:Hora] ผลตอบกลับจาก /api/v1/hora/calculate -> HTTP Status:', response.status);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ [DEBUG:Hora] Server Error Response:', errText);
      let errMsg = `ไม่สามารถคำนวณดวงชะตาจากเซิร์ฟเวอร์ได้ (HTTP ${response.status})`;
      try {
        const errData = JSON.parse(errText);
        if (errData.message) errMsg = errData.message;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const result = await response.json();
    console.log('✅ [DEBUG:Hora] ได้รับข้อมูลดวงชะตาจาก lahiri-api:', result);
    const calc = result.calculateResp;
    if (!calc) {
      throw new Error('รูปแบบข้อมูลผลลัพธ์ไม่ถูกต้อง');
    }

    // บันทึกผลลัพธ์ตำแหน่งดาวไว้ใน sessionStorage
    sessionStorage.setItem(HORA_STORAGE_KEY, JSON.stringify(result));
    console.log('💾 [DEBUG:Hora] บันทึกผลลัพธ์ตำแหน่งดาวลง sessionStorage (user_hora_result) เรียบร้อยแล้ว');

    // แสดงตารางตำแหน่งดาว
    renderAstrologyTable(calc, birthData);

  } catch (error) {
    console.error('Calculation Error:', error);
    if (astroLoading) astroLoading.classList.add('hidden');
    if (astroOutput) {
      astroOutput.innerHTML = `<p class="text-red-400">${escapeHtml(error.message || 'เกิดข้อผิดพลาดในการคำนวณดวงชะตา กรุณาลองใหม่อีกครั้ง')}</p>`;
    }
  }
}

// 2. ฟังก์ชันเมื่อกดแก้ไขข้อมูลวันเกิด (ห้ามแก้ไขหากมีข้อมูลตารางสมผุสดาวใน sessionStorage แล้ว)
function resetBirthInfo() {
  if (sessionStorage.getItem(HORA_STORAGE_KEY)) {
    alert('คำนวณตำแหน่งดาวเรียบร้อยแล้ว ไม่สามารถแก้ไขข้อมูลวันเกิดได้');
    return;
  }

  sessionStorage.removeItem('user_birth_info');
  sessionStorage.removeItem(HORA_STORAGE_KEY);
  localStorage.removeItem('user_birth_info');
  localStorage.removeItem(HORA_STORAGE_KEY);
  
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
