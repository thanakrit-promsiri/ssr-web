// ==========================================
// astrology.js - จัดการการประมวลผลดวงชะตาและปุ่มการทำงาน
// ==========================================

const HORA_STORAGE_KEY = 'user_hora_result';
const ASTRO_TEMPLATE_URL = '/static/astrology-template.html';

// แคช Template ตารางสมผุสดาว (โหลดครั้งเดียวต่อการเปิดหน้า)
let astroTemplateCache = null;

// โหลดไฟล์ astrology-template.html และดึง <template> ตารางหลักและแถวดาว
async function loadAstrologyTemplates() {
  if (astroTemplateCache) return astroTemplateCache;

  const response = await fetch(`${ASTRO_TEMPLATE_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('ไม่สามารถโหลดเทมเพลตตารางสมผุสดาวได้');

  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  const table = doc.getElementById('astroTableTemplate');
  const row = doc.getElementById('astroRowTemplate');
  if (!table || !row) throw new Error('รูปแบบเทมเพลตตารางสมผุสดาวไม่ถูกต้อง');

  astroTemplateCache = { table, row };
  return astroTemplateCache;
}

// เติมค่าลงใน Element ที่มี data-field ตรงกับ key (ใช้ textContent ป้องกัน XSS)
function fillFields(root, values) {
  Object.entries(values).forEach(([field, value]) => {
    root.querySelectorAll(`[data-field="${field}"]`).forEach(el => {
      el.textContent = String(value ?? '');
    });
  });
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

// ------------------------------------------
// Helper: จัดการ Element และสถานะหน้าจอ
// ------------------------------------------

// ดึง Element ที่เกี่ยวข้องกับพื้นที่แสดงผลการคำนวณ
function getAstroElements() {
  return {
    area: document.getElementById('astroCalculationArea'),
    loading: document.getElementById('astroLoading'),
    output: document.getElementById('astroOutput'),
    editBtn: document.getElementById('editBirthBtn')
  };
}

// แสดงหรือซ่อน Element (ปลอดภัยเมื่อ el เป็น null)
function setHidden(el, hidden) {
  if (el) el.classList.toggle('hidden', hidden);
}

// แสดงข้อความ error ในพื้นที่ผลลัพธ์ (ใช้ textContent ป้องกัน XSS)
function showAstroError(message) {
  const { loading, output } = getAstroElements();
  setHidden(loading, true);
  if (!output) return;

  const errP = document.createElement('p');
  errP.className = 'text-red-400';
  errP.textContent = message || 'เกิดข้อผิดพลาดในการคำนวณดวงชะตา กรุณาลองใหม่อีกครั้ง';
  output.replaceChildren(errP);
}

// ------------------------------------------
// Helper: แปลงข้อมูลจาก API เป็นข้อมูลสำหรับแสดงผล
// ------------------------------------------

// ลัคนาและจุดมุมสำคัญทั้ง 4 (Ascendant, Descendant, Midheaven, Imum Coeli)
const ANGLE_CONFIGS = [
  {
    key: 'Ascendant',
    nameThai: 'ลัคนา',
    symbol: 'ลั',
    houseThai: '1 (ตนุ)',
    exactName: 'Ascendant (ASC)'
  },
  {
    key: 'Descendant',
    nameThai: 'อัสตลัคนา',
    symbol: 'DSC',
    houseThai: '7 (ปัตนิ)',
    exactName: 'Descendant (DSC)'
  },
  {
    key: 'Midheaven',
    nameThai: 'มัธยลัคนา',
    symbol: 'MC',
    houseThai: '10 (กัมมะ)',
    exactName: 'Midheaven (MC)'
  },
  {
    key: 'Imum Coeli',
    nameThai: 'ปาตาลลัคนา',
    symbol: 'IC',
    houseThai: '4 (พันธุ)',
    exactName: 'Imum Coeli (IC)'
  }
];

// แปลงข้อมูลดาว/จุดมุม 1 รายการจาก API เป็นแถวสำหรับตาราง (ใช้ค่า defaults เมื่อ API ไม่ส่งมา)
function buildAstroRow(body, defaults, flags) {
  return {
    isAscendant: flags.isAscendant,
    isRetrograde: flags.isRetrograde,
    isCombust: flags.isCombust,
    symbol: body.symbol || defaults.symbol,
    nameThai: body.name_thai || defaults.nameThai || body.name || '-',
    signThai: body.position?.sign_thai || body.position?.sign || '-',
    degreeFormatted: body.degree_formatted || '-',
    nakshatraThai: body.nakshatra_thai || body.nakshatra || '-',
    pada: body.pada || '-',
    lordThai: body.lord_thai || body.lord || '-',
    navamsaThai: body.navamsa?.sign_thai || body.navamsa?.sign || '-',
    houseThai: body.house_thai || (body.house ? `${body.house} (${body.house_name_thai || ''})` : defaults.houseThai),
    dignity: body.dignity || defaults.dignity || '',
    dignityThai: body.dignity_thai || defaults.dignityThai || body.dignity || 'ปกติ'
  };
}

// รวมแถวทั้งหมด: จุดมุมสำคัญทั้ง 4 มาก่อน แล้วตามด้วยดาวเคราะห์
function buildAstroRows(calc) {
  const housesAndAngles = calc.houses_and_angles || [];
  const rows = [];

  ANGLE_CONFIGS.forEach(cfg => {
    const angle = housesAndAngles.find(a =>
      a.name === cfg.exactName ||
      String(a.name || '').includes(cfg.key) ||
      a.name_thai === cfg.nameThai
    );
    if (!angle) return;

    rows.push(buildAstroRow(angle, {
      symbol: cfg.symbol,
      nameThai: cfg.nameThai,
      houseThai: cfg.houseThai,
      dignity: cfg.key,
      dignityThai: cfg.nameThai
    }, { isAscendant: true, isRetrograde: false, isCombust: false }));
  });

  (calc.planets || []).forEach(p => {
    rows.push(buildAstroRow(p, { symbol: '-', houseThai: '-' }, {
      isAscendant: false,
      isRetrograde: Boolean(p.is_retrograde),
      isCombust: Boolean(p.is_combust)
    }));
  });

  return rows;
}

// สรุปจันทร์เสวยฤกษ์ และวิมโสตรีทศา (Vimshottari Dasha)
function buildDashaSummary(calc) {
  const moonObj = (calc.planets || []).find(p => p.name === 'Moon');
  const dasha = calc.vimshottari_dasha || {};
  const current = dasha.current_dasha || {};

  const formatPeriod = (lord, start, end) =>
    lord ? `${lord} (${start || ''} ถึง ${end || ''})` : '-';

  return {
    moonNakshatraSummary: moonObj
      ? `${moonObj.nakshatra_thai || moonObj.nakshatra} (บาทที่ ${moonObj.pada}) — เจ้าฤกษ์: ${moonObj.lord_thai || moonObj.lord}`
      : (dasha.moon_nakshatra_thai || '-'),
    dashaBalanceText: dasha.balance_at_birth || '-',
    mahaText: formatPeriod(current.mahadasha_lord_thai, current.mahadasha_start, current.mahadasha_end),
    antarText: formatPeriod(current.antardasha_lord_thai, current.antardasha_start, current.antardasha_end)
  };
}

// ข้อมูลเจ้าชะตาโดยย่อ (วันเวลาเกิด สถานที่ พิกัด)
function buildBirthSummary(birthData) {
  if (!birthData) return { birthDateText: '', locationText: '', coordText: '' };

  const yearCE = parseInt(birthData.birthYearBE, 10) - 543;
  const thaiDateText = typeof formatThaiDateBE === 'function'
    ? formatThaiDateBE(birthData.birthDateCE, birthData.birthYearBE)
    : `พ.ศ. ${birthData.birthYearBE}`;

  return {
    birthDateText: `${thaiDateText} (ค.ศ. ${yearCE}) เวลา ${birthData.birthTime} น.`,
    locationText: `อ. ${birthData.amphoe} จ. ${birthData.province}`,
    coordText: `${birthData.latitude}, ${birthData.longitude}`
  };
}

// สร้าง Element แถวดาว 1 แถวจาก Template
function createAstroRowElement(rowTemplate, item) {
  const rowFrag = document.importNode(rowTemplate.content, true);
  rowFrag.querySelector('tr').className = item.isAscendant
    ? 'bg-amber-500/10 border-b border-amber-500/20'
    : 'border-b border-slate-800/80 hover:bg-purple-950/30 transition';

  fillFields(rowFrag, {
    symbol: item.symbol,
    nameThai: item.nameThai,
    signThai: item.signThai,
    degreeFormatted: item.degreeFormatted,
    nakshatraThai: item.nakshatraThai,
    pada: item.pada,
    lordThai: item.lordThai,
    navamsaThai: item.navamsaThai,
    houseThai: item.houseThai,
    dignityThai: item.dignityThai
  });

  if (item.isRetrograde && !String(item.nameThai).includes('พักร์')) {
    setHidden(rowFrag.querySelector('[data-field="retroBadge"]'), false);
  }
  if (item.isCombust) {
    setHidden(rowFrag.querySelector('[data-field="combustBadge"]'), false);
  }

  rowFrag.querySelector('[data-field="dignityThai"]')
    .classList.add(...getDignityBadgeClass(item.dignity, item.dignityThai).split(' '));

  return rowFrag;
}

// ฟังก์ชันแสดงตารางตำแหน่งดาวพระเวทลงในหน้าเว็บ
async function renderAstrologyTable(calc, birthData) {
  const { area, loading, output, editBtn } = getAstroElements();

  setHidden(area, false);
  setHidden(loading, true);
  // ซ่อนปุ่มแก้ไขข้อมูลทันทีที่มีข้อมูลตารางสมผุสดาวแล้ว
  setHidden(editBtn, true);
  if (!output || !calc) return;

  // โหลด Template HTML แยกไฟล์ (astrology-template.html)
  let templates;
  try {
    templates = await loadAstrologyTemplates();
  } catch (err) {
    console.error('Error loading astrology template:', err);
    showAstroError(err.message);
    return;
  }

  const tableFrag = document.importNode(templates.table.content, true);
  const tbody = tableFrag.querySelector('[data-field="rows"]');
  buildAstroRows(calc).forEach(item => {
    tbody.appendChild(createAstroRowElement(templates.row, item));
  });

  fillFields(tableFrag, {
    ayanamsaName: calc.metadata?.ayanamsa_name || 'Lahiri',
    ayanamsaDeg: calc.metadata?.ayanamsa_degrees || '-',
    ...buildBirthSummary(birthData),
    ...buildDashaSummary(calc)
  });

  output.replaceChildren(tableFrag);
}

// ตรวจสอบว่ามีผลลัพธ์ตำแหน่งดาวใน sessionStorage หรือไม่ หากมีให้แสดงทันที
async function checkExistingHoraResult(birthData) {
  const savedHoraStr = sessionStorage.getItem(HORA_STORAGE_KEY);
  if (!savedHoraStr) return false;

  try {
    const savedResult = JSON.parse(savedHoraStr);
    if (savedResult && savedResult.calculateResp) {
      console.log('📦 [DEBUG:Hora] พบข้อมูลตำแหน่งดาวใน sessionStorage แสดงผลตารางทันที');
      await renderAstrologyTable(savedResult.calculateResp, birthData);
      return true;
    }
  } catch (err) {
    console.error('Error parsing saved hora result:', err);
    sessionStorage.removeItem(HORA_STORAGE_KEY);
  }
  return false;
}

// ------------------------------------------
// Helper: เรียก API คำนวณดวงชะตา
// ------------------------------------------

// สร้าง payload สำหรับ lahiri-api จากข้อมูลวันเกิด
function buildCalculatePayload(birthData) {
  // แยก ปี-เดือน-วัน ค.ศ. จาก birthDateCE (เช่น "1988-12-23")
  const [yearStr, monthStr, dayStr] = String(birthData.birthDateCE || '').split('-');
  return {
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
}

// ส่ง POST JSON พร้อม Cookie ไปยัง endpoint ที่กำหนด
function postJson(url, payload) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
}

// อ่านข้อความ error จาก Response ที่ไม่สำเร็จ
async function readHoraErrorMessage(response) {
  const errText = await response.text();
  console.error('❌ [DEBUG:Hora] Server Error Response:', errText);
  try {
    const errData = JSON.parse(errText);
    if (errData.message) return errData.message;
  } catch (_) {}
  return `ไม่สามารถคำนวณดวงชะตาจากเซิร์ฟเวอร์ได้ (HTTP ${response.status})`;
}

// เรียก /hora/calculate ที่ ssr-web โดยตรง (ป้องกันกรณี Nginx ดัก /api/* ไปที่ Auth Service)
// หากได้ 404 ให้ fallback ไปที่ /api/v1/hora/calculate แล้วคืนผลลัพธ์ JSON
async function fetchHoraResult(payload) {
  console.log('🔮 [DEBUG:Hora] กำลังส่งคำขอคำนวณดวงชะตา:', payload);

  let url = '/hora/calculate';
  let response = await postJson(url, payload);
  console.log(`🔮 [DEBUG:Hora] ผลตอบกลับจาก ${url} -> HTTP Status:`, response.status);

  if (response.status === 404) {
    console.warn('⚠️ [DEBUG:Hora] /hora/calculate คืนค่า 404 ลองเรียก /api/v1/hora/calculate แทน...');
    url = '/api/v1/hora/calculate';
    response = await postJson(url, payload);
    console.log(`🔮 [DEBUG:Hora] ผลตอบกลับจาก ${url} -> HTTP Status:`, response.status);
  }

  if (!response.ok) {
    throw new Error(await readHoraErrorMessage(response));
  }

  const result = await response.json();
  console.log('✅ [DEBUG:Hora] ได้รับข้อมูลดวงชะตาจาก lahiri-api:', result);
  if (!result.calculateResp) {
    throw new Error('รูปแบบข้อมูลผลลัพธ์ไม่ถูกต้อง');
  }
  return result;
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
  if (await checkExistingHoraResult(birthData)) {
    return;
  }

  const { area, loading, output } = getAstroElements();
  setHidden(area, false);
  setHidden(loading, false);
  if (output) output.replaceChildren();

  try {
    const result = await fetchHoraResult(buildCalculatePayload(birthData));

    // บันทึกผลลัพธ์ตำแหน่งดาวไว้ใน sessionStorage
    sessionStorage.setItem(HORA_STORAGE_KEY, JSON.stringify(result));
    console.log('💾 [DEBUG:Hora] บันทึกผลลัพธ์ตำแหน่งดาวลง sessionStorage (user_hora_result) เรียบร้อยแล้ว');

    // แสดงตารางตำแหน่งดาว
    await renderAstrologyTable(result.calculateResp, birthData);
  } catch (error) {
    console.error('Calculation Error:', error);
    showAstroError(error.message);
  }
}

// 2. ฟังก์ชันเมื่อกดแก้ไขข้อมูลวันเกิด (ห้ามแก้ไขหากมีข้อมูลตารางสมผุสดาวใน sessionStorage แล้ว)
function resetBirthInfo() {
  if (sessionStorage.getItem(HORA_STORAGE_KEY)) {
    alert('คำนวณตำแหน่งดาวเรียบร้อยแล้ว ไม่สามารถแก้ไขข้อมูลวันเกิดได้');
    return;
  }

  [sessionStorage, localStorage].forEach(storage => {
    storage.removeItem('user_birth_info');
    storage.removeItem(HORA_STORAGE_KEY);
  });

  // แสดงฟอร์มกรอกข้อมูลกลับมา
  setHidden(document.getElementById('formContainer'), false);

  // ซ่อนและล้างกล่องผลลัพธ์
  const resultContainer = document.getElementById('resultContainer');
  if (resultContainer) {
    resultContainer.classList.add('hidden');
    resultContainer.innerHTML = '';
  }

  // ล้างค่าฟอร์มช่องกรอกให้ว่าง พร้อมกรอกรอบใหม่
  ['birthDate', 'birthTime', 'provinceSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const amphoeSelect = document.getElementById('amphoeSelect');
  if (amphoeSelect) {
    amphoeSelect.innerHTML = '<option value="">-- เลือกอำเภอ/เขต --</option>';
  }
}