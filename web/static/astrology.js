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
  const promptTemplate = doc.getElementById('predictPromptTemplate');
  if (!table || !row) throw new Error('รูปแบบเทมเพลตตารางสมผุสดาวไม่ถูกต้อง');

  astroTemplateCache = { table, row, promptTemplate };
  return astroTemplateCache;
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

  const yearCE = Number.parseInt(birthData.birthYearBE, 10) - 543;
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

  // หากมีผลลัพธ์การทำนายใน sessionStorage ให้นำมาแสดงผลต่อในหน้าแชททันที
  const savedPredictStr = sessionStorage.getItem('user_predict_result');
  if (savedPredictStr) {
    try {
      const savedResult = JSON.parse(savedPredictStr);
      await renderPredictResult(savedResult);
      // หากพยากรณ์พื้นดวงสำเร็จแล้ว ให้ซ่อนปุ่มทำนายทันที
      if (savedResult.prediction && String(savedResult.prediction).trim()) {
        const predictBtnContainer = document.getElementById('predictBtnContainer');
        setHidden(predictBtnContainer || document.getElementById('predictAstroBtn'), true);
      }
    } catch (err) {
      console.error('Error parsing saved predict result:', err);
    }
  } else {
    // Fallback: รองรับ key เก่า user_predict_prompt
    const savedPrompt = sessionStorage.getItem('user_predict_prompt');
    if (savedPrompt) {
      await renderPredictResult({ prompt: savedPrompt });
    }
  }
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
      year: Number.parseInt(yearStr, 10),
      month: Number.parseInt(monthStr, 10),
      day: Number.parseInt(dayStr, 10),
      hour_thai: parseHourThai(birthData.birthTime),
      time_zone: 7.0,
      latitude: Number.parseFloat(birthData.latitude),
      longitude: Number.parseFloat(birthData.longitude),
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
    storage.removeItem('user_predict_result');
    storage.removeItem('user_predict_prompt');
    storage.removeItem('user_transit_2570');
  });

  // ลบ bubble ของการทำนายออกถ้ามี
  const promptBubble = document.getElementById('predictPromptBubble');
  if (promptBubble) {
    promptBubble.remove();
  }

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

// ------------------------------------------
// 3. ฟังก์ชันการทำนายดวงชะตา (Predict) และแสดงผลคำทำนาย / Prompt
// (ฟังก์ชันแปลง Markdown ใช้ renderMarkdown() จาก hora-common.js)
// ------------------------------------------

// ฟังก์ชันกดปุ่มทำนายดวงชะตา: ส่งข้อมูลไปยัง API และจัดการผลลัพธ์ทั้งกรณี AI สำเร็จ และ AI ไม่สำเร็จ
async function predictAstrology() {
  const savedDataStr = sessionStorage.getItem('user_birth_info');
  if (!savedDataStr) {
    alert('ไม่พบข้อมูลวันเกิด กรุณากรอกข้อมูลใหม่อีกครั้ง');
    return;
  }

  const birthData = JSON.parse(savedDataStr);
  const [yearStr, monthStr, dayStr] = String(birthData.birthDateCE || '').split('-');

  const payload = {
    year: Number.parseInt(yearStr, 10),
    month: Number.parseInt(monthStr, 10),
    day: Number.parseInt(dayStr, 10),
    hour_thai: parseHourThai(birthData.birthTime),
    latitude: Number.parseFloat(birthData.latitude),
    longitude: Number.parseFloat(birthData.longitude)
  };

  const predictBtn = document.getElementById('predictAstroBtn');
  const predictBtnText = document.getElementById('predictBtnText');
  const predictLoading = document.getElementById('predictLoading');
  const predictError = document.getElementById('predictError');

  if (predictBtn) predictBtn.disabled = true;
  if (predictBtnText) predictBtnText.textContent = 'กำลังประมวลผลคำทำนายด้วย AI...';
  setHidden(predictLoading, false);
  setHidden(predictError, true);

  try {
    console.log('🔮 [DEBUG:Predict] กำลังส่งคำขอทำนายไปยัง API:', payload);
    const response = await postHoraAPI('predict', payload);

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = `เกิดข้อผิดพลาดในการทำนาย (HTTP ${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.message) errMsg = errJson.message;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const result = await response.json();
    console.log('✅ [DEBUG:Predict] ได้รับผลลัพธ์จาก API:', result);

    const predictData = result.data || {};
    const promptText = predictData.prompt || result.prompt || '';
    const predictionText = String(predictData.prediction || '').trim();
    const warningText = predictData.warning || (!predictionText ? (result.message || '') : '');

    if (!promptText && !predictionText) {
      throw new Error(result.message || 'ไม่พบข้อมูล prompt หรือคำทำนายในผลลัพธ์ที่ตอบกลับจากระบบ');
    }

    const predictResult = {
      prompt: promptText,
      prediction: predictionText,
      warning: warningText,
      message: result.message || ''
    };

    // บันทึกผลลัพธ์ลง sessionStorage (Session Storage Only)
    sessionStorage.setItem('user_predict_result', JSON.stringify(predictResult));

    // แสดงผลข้อมูลลงในหน้าแชท
    await renderPredictResult(predictResult);

    if (predictionText) {
      // เมื่อพยากรณ์พื้นดวงชะตาสำเร็จ ให้ซ่อนปุ่มทำนายทันที
      const predictBtnContainer = document.getElementById('predictBtnContainer');
      setHidden(predictBtnContainer || predictBtn, true);
    } else {
      // กรณี AI ไม่พร้อมใช้งาน ให้แสดงปุ่มสำหรับลองใหม่อีกครั้ง
      if (predictBtnText) {
        predictBtnText.textContent = 'ลองทำนายใหม่อีกครั้ง (Retry AI Predict)';
      }
    }
  } catch (error) {
    console.error('❌ [DEBUG:Predict] Error:', error);
    if (predictError) {
      predictError.textContent = `❌ ${error.message || 'ไม่สามารถเชื่อมต่อระบบทำนายได้'}`;
      setHidden(predictError, false);
    } else {
      alert(`ไม่สามารถทำนายได้: ${error.message}`);
    }
    if (predictBtnText) predictBtnText.textContent = 'เริ่มทำนายดวงชะตา (AI Predict)';
  } finally {
    if (predictBtn) predictBtn.disabled = false;
    setHidden(predictLoading, true);
  }
}

// แสดงผลกล่องข้อความคำทำนายและ Prompt ลงในหน้าแชท (<main>)
async function renderPredictResult(data) {
  let templates;
  try {
    templates = await loadAstrologyTemplates();
  } catch (err) {
    console.error('Error loading astrology templates for prompt:', err);
    return;
  }

  if (!templates.promptTemplate) {
    console.error('ไม่พบ predictPromptTemplate ใน astrology-template.html');
    return;
  }

  // หากมีกล่องข้อความเก่าอยู่แล้ว ให้ลบออกก่อน เพื่อแสดงผลข้อมูลล่าสุด
  const existingBubble = document.getElementById('predictPromptBubble');
  if (existingBubble) {
    existingBubble.remove();
  }

  const frag = document.importNode(templates.promptTemplate.content, true);

  const warningBanner = frag.getElementById('predictWarningBanner');
  const warningMsg = frag.getElementById('predictWarningMsg');
  const predictionArea = frag.getElementById('predictionContentArea');
  const predictionBody = frag.getElementById('predictionBody');
  const promptEl = frag.querySelector('[data-field="predictPromptText"]');
  const promptDesc = frag.getElementById('promptDesc');
  const statusFooter = frag.getElementById('predictStatusFooter');
  const transit2570Area = frag.getElementById('transit2570ActionArea');

  const hasPrediction = Boolean(data.prediction && String(data.prediction).trim());
  const hasWarning = Boolean(data.warning && String(data.warning).trim());

  // กรณีที่ 1: เรียก AI ไม่สำเร็จ (มี warning หรือไม่มีคำทำนาย)
  if (!hasPrediction && hasWarning) {
    setHidden(warningBanner, false);
    if (warningMsg) warningMsg.textContent = data.warning;
    setHidden(predictionArea, true);
    setHidden(transit2570Area, true);
    if (promptDesc) {
      promptDesc.textContent = 'ระบบคำนวณข้อมูลพื้นดวงชะตาสำเร็จ ได้จัดเตรียมชุด Prompt สำหรับผูกดวงดังนี้:';
    }
    if (statusFooter) {
      statusFooter.className = 'text-amber-300';
      statusFooter.textContent = '⚠️ คำนวณพื้นดวงสำเร็จ (ระบบ AI ไม่พร้อมใช้งานชั่วคราว)';
    }
  } else {
    // กรณีที่ 2: เรียก AI สำเร็จ (มีข้อความคำทำนาย)
    setHidden(warningBanner, true);
    setHidden(predictionArea, false);
    setHidden(transit2570Area, !hasPrediction);
    if (predictionBody) {
      predictionBody.innerHTML = renderMarkdown(data.prediction);
    }
    if (promptDesc) {
      promptDesc.textContent = 'ข้อมูล Prompt พื้นดวงชะตาที่ใช้ในการวิเคราะห์ทำนาย:';
    }
    if (statusFooter) {
      statusFooter.className = 'text-emerald-400';
      statusFooter.textContent = '✅ พยากรณ์พื้นดวงชะตาสำเร็จ';
    }
  }

  // เติมข้อมูล Prompt ลงในกล่อง code เสมอทั้งสองกรณี
  if (promptEl) {
    promptEl.textContent = data.prompt || '';
  }

  const mainEl = document.querySelector('main');
  if (mainEl) {
    mainEl.appendChild(frag);
    const bubble = document.getElementById('predictPromptBubble');
    if (bubble) {
      bubble.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

// คัดลอกคำทำนาย (Prediction) ไปยัง Clipboard
function copyPredictionText() {
  const savedDataStr = sessionStorage.getItem('user_predict_result');
  let text = '';
  if (savedDataStr) {
    try {
      const parsed = JSON.parse(savedDataStr);
      text = parsed.prediction || '';
    } catch (_) {}
  }
  if (!text) {
    const bodyEl = document.getElementById('predictionBody');
    if (bodyEl) text = bodyEl.innerText || '';
  }
  if (!text) return;

  copyTextWithFeedback(
    text,
    document.getElementById('copyPredText'),
    document.getElementById('copyPredIcon'),
    'คัดลอกคำทำนาย'
  );
}

// คัดลอก Prompt ไปยัง Clipboard พร้อมแสดงผลลัพธ์ชั่วคราว
function copyPredictPrompt() {
  const promptEl = document.querySelector('[data-field="predictPromptText"]');
  if (!promptEl) return;

  copyTextWithFeedback(
    promptEl.textContent || '',
    document.getElementById('copyPromptText'),
    document.getElementById('copyPromptIcon'),
    'คัดลอก Prompt'
  );
}

// พาไปยังหน้าทำนายดวงชะตา พ.ศ. ปี 2570 (/transit.html) เมื่อข้อมูลครบถ้วน
function goToTransit2570Page() {
  const birthInfo = sessionStorage.getItem('user_birth_info');
  const horaResult = sessionStorage.getItem('user_hora_result');
  const predictResult = sessionStorage.getItem('user_predict_result');
  const username = sessionStorage.getItem('user_username');

  if (!birthInfo || !horaResult || !predictResult || !username) {
    alert('ข้อมูลดวงชะตายังไม่ครบถ้วน กรุณาคำนวณและพยากรณ์พื้นดวงชะตาให้เสร็จสมบูรณ์ก่อนครับ');
    return;
  }

  try {
    const parsedPred = JSON.parse(predictResult);
    if (!parsedPred.prediction || !String(parsedPred.prediction).trim()) {
      alert('กรุณาพยากรณ์พื้นดวงชะตาให้สำเร็จก่อนเข้าสู่หน้าทำนายดวงชะตาปี พ.ศ. 2570');
      return;
    }
  } catch (_) {
    return;
  }

  window.location.href = '/transit.html';
}