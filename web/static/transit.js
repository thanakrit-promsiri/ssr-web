// ==========================================
// transit.js - จัดการหน้าทำนายดวงชะตารายเดือน พ.ศ. 2570 (/transit.html)
// ==========================================

const TRANSIT_STORAGE_KEY = 'user_transit_2570';
const TRANSIT_TEMPLATE_URL = '/static/transit-template.html';

const THAI_MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

let transitTemplateCache = null;

// เติมค่าลงใน Element ที่มี data-field ตรงกับ key (ใช้ textContent ป้องกัน DOM XSS)
function fillTransitFields(root, values) {
  Object.entries(values).forEach(([field, value]) => {
    root.querySelectorAll(`[data-field="${field}"]`).forEach(el => {
      el.textContent = String(value ?? '');
    });
  });
}

// แสดงหรือซ่อน Element
function setTransitHidden(el, hidden) {
  if (el) el.classList.toggle('hidden', hidden);
}

// ตรวจสอบว่าข้อมูลทั้ง 4 ตัวใน sessionStorage ไม่ว่างและถูกต้องครบถ้วน
function validateSessionPrerequisites() {
  const birthInfoStr = sessionStorage.getItem('user_birth_info');
  const horaResultStr = sessionStorage.getItem('user_hora_result');
  const predictResultStr = sessionStorage.getItem('user_predict_result');
  const usernameStr = sessionStorage.getItem('user_username');

  if (!birthInfoStr || !horaResultStr || !predictResultStr || !usernameStr) {
    return null;
  }

  try {
    const birthInfo = JSON.parse(birthInfoStr);
    const horaResult = JSON.parse(horaResultStr);
    const predictResult = JSON.parse(predictResultStr);

    if (!birthInfo || !birthInfo.birthDateCE || !birthInfo.birthTime) {
      return null;
    }

    const calcResp = horaResult.calculateResp || horaResult;
    if (!calcResp || !Array.isArray(calcResp.planets) || calcResp.planets.length === 0) {
      return null;
    }

    // ต้องผ่านการพยากรณ์พื้นดวงชะตาสำเร็จแล้ว (prediction ไม่เป็นค่าว่าง)
    if (!predictResult || !predictResult.prediction || !String(predictResult.prediction).trim()) {
      return null;
    }

    return {
      username: usernameStr.trim(),
      birthInfo,
      horaResult: calcResp,
      predictResult
    };
  } catch (err) {
    console.error('Invalid session data for transit page:', err);
    return null;
  }
}

// โหลดไฟล์ transit-template.html ผ่าน DOMParser (ป้องกัน DOM XSS)
async function loadTransitTemplates() {
  if (transitTemplateCache) return transitTemplateCache;

  const response = await fetch(`${TRANSIT_TEMPLATE_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('ไม่สามารถโหลดเทมเพลตหน้าพยากรณ์ปี 2570 ได้');

  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  const boardTemplate = doc.getElementById('transitBoardTemplate');
  const monthCardTemplate = doc.getElementById('transitMonthCardTemplate');

  if (!boardTemplate || !monthCardTemplate) {
    throw new Error('รูปแบบเทมเพลต transit-template.html ไม่ถูกต้อง');
  }

  transitTemplateCache = { boardTemplate, monthCardTemplate };
  return transitTemplateCache;
}

// แปลงวันที่ ค.ศ. เป็นข้อความภาษาไทย
function formatBirthSummary(birthInfo) {
  if (!birthInfo) return '-';
  const parts = String(birthInfo.birthDateCE || '').split('-');
  if (parts.length !== 3) return `${birthInfo.birthYearBE || ''} เวลา ${birthInfo.birthTime || ''} น.`;
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const yearBE = birthInfo.birthYearBE || (parseInt(parts[0], 10) + 543);
  const monthName = THAI_MONTH_NAMES[monthIdx] || parts[1];
  return `${day} ${monthName} พ.ศ. ${yearBE} เวลา ${birthInfo.birthTime} น. (${birthInfo.province || ''})`;
}

// ดึงราศีลัคนาจากผลคำนวณสมผุสดาว
function extractAscendantSummary(horaResult) {
  if (!horaResult || !Array.isArray(horaResult.planets)) return 'ลัคนาตามเวลาเกิด';
  const asc = horaResult.planets.find(p =>
    p.name === 'Ascendant' ||
    String(p.name_thai || '').includes('ลัคนา') ||
    p.symbol === 'ล'
  );
  if (!asc) return 'ลัคนาตามเวลาเกิด';
  const signThai = asc.position?.sign_thai || '';
  const nakThai = asc.nakshatra_thai || '';
  return `ราศี${signThai}${nakThai ? ` (ฤกษ์${nakThai})` : ''}`;
}

// แปลง Markdown เบื้องต้นเป็น DOM Element อย่างปลอดภัย (ไม่ใช้ innerHTML กับข้อมูลดิบ)
function buildMarkdownNodes(mdText) {
  const fragment = document.createDocumentFragment();
  const lines = String(mdText || '').split('\n');

  lines.forEach(rawLine => {
    const line = rawLine.trim();
    if (!line) return;

    if (line.startsWith('### ')) {
      const h3 = document.createElement('h3');
      h3.className = 'text-amber-300 font-semibold text-xs sm:text-sm mt-2 mb-1';
      h3.textContent = line.replace(/^###\s+/, '');
      fragment.appendChild(h3);
      return;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      const div = document.createElement('div');
      div.className = 'flex items-start gap-2 ml-2 text-slate-200 my-1';
      const bullet = document.createElement('span');
      bullet.className = 'text-amber-400 font-bold';
      bullet.textContent = '•';
      const textSpan = document.createElement('span');
      textSpan.textContent = line.replace(/^[*-]\s+/, '');
      div.appendChild(bullet);
      div.appendChild(textSpan);
      fragment.appendChild(div);
      return;
    }

    const p = document.createElement('p');
    p.className = 'leading-relaxed text-slate-200 mb-1.5';
    p.textContent = line;
    fragment.appendChild(p);
  });

  return fragment;
}

// เริ่มต้นหน้า /transit.html: ตรวจสอบทั้ง 5 เงื่อนไขก่อนอนุญาตให้เข้าใช้งาน
async function initTransitPage() {
  // 1. ตรวจสอบ auth_token กับ Backend (และอัปเดต user_username หากมี)
  if (typeof checkAuthWithBackend === 'function') {
    await checkAuthWithBackend();
  }

  // 2. ตรวจสอบข้อมูลทั้ง 4 ตัวใน sessionStorage (user_birth_info, user_hora_result, user_predict_result, user_username)
  const sessionData = validateSessionPrerequisites();
  if (!sessionData) {
    window.location.replace('/chat.html');
    return;
  }

  try {
    const templates = await loadTransitTemplates();
    const mainEl = document.getElementById('transitMain');
    if (!mainEl) return;

    const boardFrag = document.importNode(templates.boardTemplate.content, true);
    fillTransitFields(boardFrag, {
      username: sessionData.username,
      birthSummary: formatBirthSummary(sessionData.birthInfo),
      ascendantSummary: extractAscendantSummary(sessionData.horaResult)
    });

    mainEl.replaceChildren(boardFrag);

    // กู้คืนสถานะการดูดวงรายเดือนจาก sessionStorage หากเคยกดไว้บางส่วนแล้ว
    restoreTransitProgress();
  } catch (err) {
    console.error('Error initializing transit page:', err);
  }
}

// โหลดข้อมูลเดือนที่เคยทำนายไปแล้วใน Session ปัจจุบัน
function getSavedTransitMonths() {
  const raw = sessionStorage.getItem(TRANSIT_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

// บันทึกผลลัพธ์ของเดือนที่ทำนายสำเร็จลง sessionStorage
function saveTransitMonthResult(monthNumber, monthData) {
  const current = getSavedTransitMonths();
  current[String(monthNumber)] = monthData;
  sessionStorage.setItem(TRANSIT_STORAGE_KEY, JSON.stringify(current));
}

// กู้คืนผลลัพธ์รายเดือนและแสดงปุ่มเดือนถัดไปตามลำดับ
function restoreTransitProgress() {
  const savedMonths = getSavedTransitMonths();
  let highestCompletedMonth = 0;

  for (let m = 1; m <= 12; m++) {
    const item = savedMonths[String(m)];
    if (item && item.prediction) {
      appendMonthResultCard(item, false);
      highestCompletedMonth = m;
    } else {
      break;
    }
  }

  updateButtonVisibility(highestCompletedMonth);
}

// อัปเดตการแสดงผลของปุ่มทั้ง 12 เดือน:
// ซ่อนปุ่มเดือนที่ดูเสร็จแล้ว และเปิดเฉพาะปุ่มของเดือนถัดไป (highestCompletedMonth + 1)
function updateButtonVisibility(highestCompletedMonth) {
  const badge = document.getElementById('transitProgressBadge');
  if (badge) {
    badge.textContent = `พยากรณ์แล้ว ${highestCompletedMonth} / 12 เดือน`;
  }

  const nextMonth = highestCompletedMonth + 1;

  for (let m = 1; m <= 12; m++) {
    const btn = document.getElementById(`transitBtnMonth${m}`);
    if (!btn) continue;
    // แสดงเฉพาะปุ่มของเดือนถัดไปที่ต้องกดเท่านั้น
    setTransitHidden(btn, m !== nextMonth);
    btn.disabled = false;
  }

  const allCompletedBanner = document.getElementById('transitAllCompletedBanner');
  setTransitHidden(allCompletedBanner, highestCompletedMonth < 12);
}

// สร้างการ์ดผลลัพธ์ของเดือนที่ทำนายเสร็จแล้วใส่ลงใน #transitResultsList
function appendMonthResultCard(monthData, shouldScroll = true) {
  if (!transitTemplateCache || !transitTemplateCache.monthCardTemplate) return;

  const listEl = document.getElementById('transitResultsList');
  if (!listEl) return;

  // ป้องกันการสร้างการ์ดซ้ำหากมีอยู่แล้ว
  const cardId = `transitResultCardMonth${monthData.month}`;
  const existing = document.getElementById(cardId);
  if (existing) existing.remove();

  const cardFrag = document.importNode(transitTemplateCache.monthCardTemplate.content, true);
  const wrapper = cardFrag.firstElementChild;
  if (wrapper) wrapper.id = cardId;

  fillTransitFields(cardFrag, {
    monthNumberBadge: `${monthData.month}`,
    monthTitle: monthData.title || `คำพยากรณ์ประจำเดือน${monthData.monthName} พ.ศ. 2570`,
    monthSubtitle: monthData.subtitle || `ดวงชะตาจรประจำเดือนที่ ${monthData.month} ของปี พ.ศ. 2570`,
    transitHighlight: monthData.transitHighlight || '-',
    luckyHint: monthData.luckyHint || ''
  });

  const bodyEl = cardFrag.querySelector('[data-field="monthPredictionBody"]');
  if (bodyEl) {
    bodyEl.replaceChildren(buildMarkdownNodes(monthData.prediction));
  }

  listEl.appendChild(cardFrag);

  if (shouldScroll && wrapper) {
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// สร้างข้อมูลจำลอง (Fallback Mock) กรณีออฟไลน์
function buildClientMockTransit(monthNumber, sessionData) {
  const monthName = THAI_MONTH_NAMES[monthNumber - 1] || `เดือนที่ ${monthNumber}`;
  const ascText = extractAscendantSummary(sessionData?.horaResult);

  return {
    month: monthNumber,
    yearBE: 2570,
    monthName,
    title: `คำพยากรณ์ดวงชะตาประจำเดือน${monthName} พ.ศ. 2570`,
    subtitle: `วิเคราะห์ดาวจรเทียบ${ascText} • เดือนที่ ${monthNumber} จาก 12 เดือน`,
    prediction: [
      `### ภาพรวมดวงชะตาเดือน${monthName} 2570`,
      `ในช่วงเดือน${monthName} พ.ศ. 2570 ดาวอาทิตย์และดาวศุกร์โคจรทำมุมส่งเสริม${ascText} ส่งผลให้จังหวะชีวิตมีความก้าวหน้าอย่างชัดเจน`,
      `- การงาน: มีเกณฑ์ได้รับมอบหมายภารกิจสำคัญ หรือขยับขยายโครงการที่วางแผนไว้สำเร็จลุล่วง`,
      `- การเงิน: สภาพคล่องทางการเงินหมุนเวียนดี มีโอกาสได้รับผลตอบแทนจากผลงานที่ผ่านมา`,
      `- ความสัมพันธ์และสุขภาพ: คนรอบข้างให้การสนับสนุนดี ควรพักผ่อนให้เพียงพอในช่วงกลางเดือน`
    ].join('\n'),
    transitHighlight: `ดาวพฤหัสบดีและดาวเสาร์ทำมุมส่งกระแสถึงเรือนชะตาสำคัญในเดือน${monthName}`,
    luckyHint: `✨ สีมงคลประจำเดือน${monthName}: สีม่วงไวโอเลต และสีทองอำพัน`
  };
}

// ฟังก์ชันเมื่อผู้ใช้กดปุ่มดูดวงของแต่ละเดือน (1 ถึง 12)
async function predictTransitMonth(monthNumber) {
  const sessionData = validateSessionPrerequisites();
  if (!sessionData) {
    window.location.replace('/chat.html');
    return;
  }

  // ตรวจสอบลำดับ: ต้องกดเรียงตามลำดับเดือนเท่านั้น
  const savedMonths = getSavedTransitMonths();
  const completedCount = Object.keys(savedMonths).length;
  if (monthNumber !== completedCount + 1) {
    return;
  }

  const monthName = THAI_MONTH_NAMES[monthNumber - 1] || `เดือนที่ ${monthNumber}`;
  const btn = document.getElementById(`transitBtnMonth${monthNumber}`);
  const loadingBox = document.getElementById('transitLoadingBox');
  const loadingText = document.getElementById('transitLoadingText');
  const errorBox = document.getElementById('transitErrorBox');

  if (btn) btn.disabled = true;
  if (loadingText) {
    loadingText.textContent = `กำลังเรียก API พยากรณ์ดวงชะตาเดือน${monthName} 2570...`;
  }
  setTransitHidden(loadingBox, false);
  setTransitHidden(errorBox, true);

  try {
    let monthData = null;

    try {
      const response = await fetch('/hora/transit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_be: 2570,
          month: monthNumber,
          username: sessionData.username,
          ascendant: extractAscendantSummary(sessionData.horaResult)
        })
      });

      if (response.ok) {
        const resJson = await response.json();
        if (resJson && resJson.data) {
          monthData = resJson.data;
        }
      }
    } catch (_) {
      // หากเรียกไม่ได้ ใช้ Client Mock แทน
    }

    if (!monthData) {
      await new Promise(resolve => setTimeout(resolve, 500));
      monthData = buildClientMockTransit(monthNumber, sessionData);
    }

    // 1. บันทึกผลลัพธ์ของเดือนนี้ลง sessionStorage
    saveTransitMonthResult(monthNumber, monthData);

    // 2. แสดงผลคำทำนายของเดือนนี้
    appendMonthResultCard(monthData, true);

    // 3. ซ่อนปุ่มเดือนปัจจุบัน และเปิดปุ่มเดือนถัดไป (เช่น กดมกราคมเสร็จ -> ปุ่มกุมภาพันธ์จึงจะขึ้น)
    updateButtonVisibility(monthNumber);
  } catch (err) {
    console.error(`Error predicting month ${monthNumber}:`, err);
    if (errorBox) {
      errorBox.textContent = `❌ เกิดข้อผิดพลาดในการดูดวงเดือน${monthName} 2570 กรุณาลองใหม่อีกครั้ง`;
      setTransitHidden(errorBox, false);
    }
    if (btn) btn.disabled = false;
  } finally {
    setTransitHidden(loadingBox, true);
  }
}
