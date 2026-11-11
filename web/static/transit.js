// ==========================================
// transit.js - จัดการหน้าทำนายดวงชะตารายเดือน พ.ศ. 2570 (/transit.html)
// เชื่อมต่อ API: /api/v1/hora/transitpredict_1 ถึง /api/v1/hora/transitpredict_12
// ==========================================

const TRANSIT_STORAGE_KEY = 'user_transit_2570';
const TRANSIT_TEMPLATE_URL = '/static/transit-template.html';

let transitTemplateCache = null;

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

// แปลงวันที่ ค.ศ. เป็นข้อความภาษาไทยพร้อมเวลาและจังหวัด
function formatBirthSummary(birthInfo) {
  if (!birthInfo) return '-';
  const thaiDate = formatThaiDateBE(birthInfo.birthDateCE, birthInfo.birthYearBE);
  return `${thaiDate} เวลา ${birthInfo.birthTime || ''} น. (${birthInfo.province || ''})`;
}

// ดึงราศีลัคนาจากผลคำนวณสมผุสดาว
function extractAscendantSummary(horaResult) {
  if (!horaResult || !Array.isArray(horaResult.planets)) return 'ลัคนาตามเวลาเกิด';
  const asc = horaResult.planets.find(p =>
    p.name === 'Ascendant' ||
    String(p.name_thai || '').includes('ลัคนา') ||
    p.symbol === 'ล' ||
    p.symbol === 'ลั'
  );
  if (!asc) return 'ลัคนาตามเวลาเกิด';
  const signThai = asc.position?.sign_thai || '';
  const nakThai = asc.nakshatra_thai || '';
  return `ราศี${signThai}${nakThai ? ` (ฤกษ์${nakThai})` : ''}`;
}

// เริ่มต้นหน้า /transit.html: ตรวจสอบทั้ง 5 เงื่อนไขก่อนอนุญาตให้เข้าใช้งาน
async function initTransitPage() {
  // 1. ตรวจสอบ auth_token กับ Backend (และอัปเดต user_username หากมี)
  if (typeof checkAuthWithBackend === 'function') {
    const authOk = await checkAuthWithBackend();
    if (authOk === false) return;
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
    fillFields(boardFrag, {
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
    if (!item) break;

    appendMonthResultCard(item, false);
    if (item.prediction && String(item.prediction).trim()) {
      highestCompletedMonth = m;
    } else {
      break;
    }
  }

  updateButtonVisibility(highestCompletedMonth);
}

// อัปเดตการแสดงผลของปุ่มทั้ง 12 เดือน:
// ซ่อนปุ่มเดือนที่พยากรณ์สำเร็จแล้ว และแสดงเฉพาะปุ่มของเดือนถัดไป (highestCompletedMonth + 1)
function updateButtonVisibility(highestCompletedMonth) {
  const badge = document.getElementById('transitProgressBadge');
  if (badge) {
    badge.textContent = `พยากรณ์แล้ว ${highestCompletedMonth} / 12 เดือน`;
  }

  const nextMonth = highestCompletedMonth + 1;

  for (let m = 1; m <= 12; m++) {
    const btn = document.getElementById(`transitBtnMonth${m}`);
    if (!btn) continue;
    setHidden(btn, m !== nextMonth);
    btn.disabled = false;
  }

  const allCompletedBanner = document.getElementById('transitAllCompletedBanner');
  setHidden(allCompletedBanner, highestCompletedMonth < 12);
}

// สร้างการ์ดผลลัพธ์ของเดือนที่ทำนายเสร็จแล้วใส่ลงใน #transitResultsList
function appendMonthResultCard(monthData, shouldScroll = true) {
  if (!transitTemplateCache || !transitTemplateCache.monthCardTemplate) return;

  const listEl = document.getElementById('transitResultsList');
  if (!listEl) return;

  const cardId = `transitResultCardMonth${monthData.month}`;
  const existing = document.getElementById(cardId);
  if (existing) existing.remove();

  const cardFrag = document.importNode(transitTemplateCache.monthCardTemplate.content, true);
  const wrapper = cardFrag.firstElementChild;
  if (wrapper) wrapper.id = cardId;

  const monthThaiLabel = monthData.transit_month_thai || `เดือน${THAI_MONTHS[monthData.month - 1] || monthData.month} พ.ศ. 2570`;
  const hasPrediction = Boolean(monthData.prediction && String(monthData.prediction).trim());
  const hasWarning = Boolean(monthData.warning && String(monthData.warning).trim());

  fillFields(cardFrag, {
    monthNumberBadge: `${monthData.month}`,
    monthTitle: `คำพยากรณ์ดวงชะตาประจำ${monthThaiLabel}`,
    monthSubtitle: `Vedic Transit (Lahiri) / Whole Sign (W) • เดือนที่ ${monthData.month} จาก 12 เดือน`,
    warningText: monthData.warning || ''
  });

  const warningBanner = cardFrag.querySelector('[data-role="warningBanner"]');
  const predictionSection = cardFrag.querySelector('[data-role="predictionSection"]');
  const statusFooter = cardFrag.querySelector('[data-field="statusFooterText"]');

  if (!hasPrediction && hasWarning) {
    setHidden(warningBanner, false);
    setHidden(predictionSection, true);
    if (statusFooter) {
      statusFooter.className = 'text-amber-300';
      statusFooter.textContent = `⚠️ คำนวณดาวจร${monthThaiLabel}สำเร็จ (ระบบ AI ไม่พร้อมใช้งานชั่วคราว)`;
    }
  } else {
    setHidden(warningBanner, true);
    setHidden(predictionSection, false);
    const bodyEl = cardFrag.querySelector('[data-field="monthPredictionBody"]');
    if (bodyEl) {
      bodyEl.innerHTML = renderMarkdown(monthData.prediction);
    }
    if (statusFooter) {
      statusFooter.className = 'text-emerald-400';
      statusFooter.textContent = `✅ พยากรณ์ดวงชะตาดาวจร${monthThaiLabel}สำเร็จ`;
    }
  }

  // ผูกปุ่มคัดลอกคำทำนาย
  const copyPredBtn = cardFrag.querySelector('[data-role="copyPredBtn"]');
  const copyPredIcon = cardFrag.querySelector('[data-role="copyPredIcon"]');
  const copyPredLabel = cardFrag.querySelector('[data-role="copyPredLabel"]');
  if (copyPredBtn) {
    copyPredBtn.addEventListener('click', () => {
      copyTextWithFeedback(monthData.prediction, copyPredLabel, copyPredIcon, 'คัดลอกคำทำนาย');
    });
  }

  listEl.appendChild(cardFrag);

  if (shouldScroll && wrapper) {
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ฟังก์ชันเมื่อผู้ใช้กดปุ่มดูดวงของแต่ละเดือน (1 ถึง 12)
async function predictTransitMonth(monthNumber) {
  const sessionData = validateSessionPrerequisites();
  if (!sessionData) {
    window.location.replace('/chat.html');
    return;
  }

  // ตรวจสอบลำดับ: ต้องพยากรณ์เดือนก่อนหน้าสำเร็จครบแล้วจึงจะกดเดือนนี้ได้
  const savedMonths = getSavedTransitMonths();
  for (let m = 1; m < monthNumber; m++) {
    const prev = savedMonths[String(m)];
    if (!prev || !prev.prediction || !String(prev.prediction).trim()) {
      return;
    }
  }

  const monthName = THAI_MONTHS[monthNumber - 1] || `เดือนที่ ${monthNumber}`;
  const btn = document.getElementById(`transitBtnMonth${monthNumber}`);
  const btnLabel = btn ? btn.querySelector(`[data-field="btnText${monthNumber}"]`) : null;
  const loadingBox = document.getElementById('transitLoadingBox');
  const loadingText = document.getElementById('transitLoadingText');
  const errorBox = document.getElementById('transitErrorBox');

  const birthInfo = sessionData.birthInfo;
  const [yearStr, monthStr, dayStr] = String(birthInfo.birthDateCE || '').split('-');

  const payload = {
    year: Number.parseInt(yearStr, 10),
    month: Number.parseInt(monthStr, 10),
    day: Number.parseInt(dayStr, 10),
    hour_thai: parseHourThai(birthInfo.birthTime),
    time_zone: 7.0,
    latitude: Number.parseFloat(birthInfo.latitude),
    longitude: Number.parseFloat(birthInfo.longitude)
  };

  if (btn) btn.disabled = true;
  if (loadingText) {
    loadingText.textContent = `กำลังคำนวณดาวจรและพยากรณ์เดือน${monthName} พ.ศ. 2570 ด้วย AI...`;
  }
  setHidden(loadingBox, false);
  setHidden(errorBox, true);

  try {
    const response = await postHoraAPI(`transitpredict_${monthNumber}`, payload);

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = `เกิดข้อผิดพลาดในการพยากรณ์เดือน${monthName} (HTTP ${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.message) errMsg = errJson.message;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const result = await response.json();
    const apiData = result.data || {};
    const predictionText = String(apiData.prediction || '').trim();
    const transitPromptText = String(apiData.transit_prompt || '').trim();
    const natalPromptText = String(apiData.natal_prompt || '').trim();
    const warningText = apiData.warning || (!predictionText ? (result.message || '') : '');

    if (!predictionText && !transitPromptText) {
      throw new Error(result.message || `ไม่พบข้อมูลคำพยากรณ์เดือน${monthName} 2570 จากระบบ`);
    }

    const monthRecord = {
      month: monthNumber,
      transit_month: apiData.transit_month || monthNumber,
      transit_year: apiData.transit_year || 2027,
      transit_month_thai: apiData.transit_month_thai || `เดือน${monthName} พ.ศ. 2570`,
      natal_prompt: natalPromptText,
      transit_prompt: transitPromptText,
      prediction: predictionText,
      warning: warningText,
      message: result.message || ''
    };

    // 1. บันทึกลง sessionStorage
    saveTransitMonthResult(monthNumber, monthRecord);

    // 2. แสดงการ์ดผลลัพธ์ของเดือนนี้
    appendMonthResultCard(monthRecord, true);

    // 3. หากพยากรณ์สำเร็จ (มี predictionText) ให้ซ่อนปุ่มเดือนนี้และเปิดปุ่มเดือนถัดไปทันที
    if (predictionText) {
      updateButtonVisibility(monthNumber);
    } else {
      if (btnLabel) {
        btnLabel.textContent = `ลองทำนายเดือน${monthName} 2570 ใหม่อีกครั้ง (Retry)`;
      }
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    console.error(`❌ Error predicting transit month ${monthNumber}:`, err);
    if (errorBox) {
      errorBox.textContent = `❌ ${err.message || `ไม่สามารถพยากรณ์ดวงชะตาเดือน${monthName} 2570 ได้`}`;
      setHidden(errorBox, false);
    }
    if (btn) btn.disabled = false;
  } finally {
    setHidden(loadingBox, true);
  }
}
