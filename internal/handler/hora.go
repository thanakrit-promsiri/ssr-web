package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// ==========================================
// Structs สำหรับรับคำขอจาก Frontend ส่งต่อไปยัง lahiri-api
// ==========================================

type HoraCalculatePayload struct {
	CalculateReq CalculateReq `json:"calculateReq"`
}

type CalculateReq struct {
	Year        int     `json:"year"`
	Month       int     `json:"month"`
	Day         int     `json:"day"`
	HourThai    float64 `json:"hour_thai"`
	TimeZone    float64 `json:"time_zone"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	HouseSystem string  `json:"house_system"`
}

// HandleHoraCalculate ส่งคำขอคำนวณดวงชะตาแบบเต็มไปยัง lahiri-api (/api/v1/hora/calculate)
func (h *Handler) HandleHoraCalculate(w http.ResponseWriter, r *http.Request) {
	h.proxyToHoraService(w, r, "/api/v1/hora/calculate")
}

// HandleHoraDasha ส่งคำขอคำนวณเฉพาะวิมโสตรีทศาไปยัง lahiri-api (/api/v1/hora/dasha)
func (h *Handler) HandleHoraDasha(w http.ResponseWriter, r *http.Request) {
	h.proxyToHoraService(w, r, "/api/v1/hora/dasha")
}

// HandleHoraPredict ส่งคำขอคำนวณข้อมูลพื้นดวงชะตาสำหรับทำนายไปยัง lahiri-api (/api/v1/hora/predict)
func (h *Handler) HandleHoraPredict(w http.ResponseWriter, r *http.Request) {
	h.proxyRawToHoraService(w, r, "/api/v1/hora/predict")
}

// TransitMockReq โครงสร้างคำขอทำนายดวงชะตารายเดือน พ.ศ. 2570 (Mock API)
type TransitMockReq struct {
	YearBE    int    `json:"year_be"`
	Month     int    `json:"month"`
	Username  string `json:"username"`
	Ascendant string `json:"ascendant"`
}

var thaiMonthNames = [12]string{
	"มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
	"กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
}

// HandleHoraTransitMock จำลอง API ทำนายดวงชะตารายเดือน (เดือน 1 - 12) ประจำปี พ.ศ. 2570
func (h *Handler) HandleHoraTransitMock(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	var req TransitMockReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": false,
			"message": "รูปแบบคำขอไม่ถูกต้อง: " + err.Error(),
		})
		return
	}

	if req.Month < 1 || req.Month > 12 {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": false,
			"message": "กรุณาระบุเดือนระหว่าง 1 ถึง 12",
		})
		return
	}

	if req.YearBE == 0 {
		req.YearBE = 2570
	}
	if req.Ascendant == "" {
		req.Ascendant = "ลัคนากำเนิด"
	}

	monthName := thaiMonthNames[req.Month-1]
	log.Printf("🌟 [TransitMock] พยากรณ์ดวงชะตาเดือน%s %d (เดือนที่ %d/12) สำหรับผู้ใช้ %s", monthName, req.YearBE, req.Month, req.Username)

	prediction := fmt.Sprintf(
		"### คำพยากรณ์ดวงชะตาประจำเดือน%s พ.ศ. %d\n"+
			"อิทธิพลของดาวจรสำคัญในเดือน%s พ.ศ. %d ส่งกระแสสัมพันธ์กับ%sของเจ้าชะตา มีเกณฑ์การเปลี่ยนแปลงไปในทิศทางที่โดดเด่นดังนี้:\n"+
			"- การงานและการศึกษา: มีโอกาสได้รับผิดชอบงานสำคัญหรือโปรเจกต์ใหม่ ผู้ใหญ่และผู้ร่วมงานให้ความไว้วางใจ\n"+
			"- การเงินและโชคลาภ: กระแสการเงินหมุนเวียนคล่องตัว มีเกณฑ์ได้ผลตอบแทนหรือรายได้เสริมจากความสามารถเฉพาะตัว\n"+
			"- ความรักและสุขภาพ: ความสัมพันธ์ราบรื่นและมีความเข้าใจอันดี ควรดูแลสุขภาพเรื่องการพักผ่อนให้เพียงพอ",
		monthName, req.YearBE, monthName, req.YearBE, req.Ascendant,
	)

	respPayload := map[string]any{
		"success": true,
		"message": fmt.Sprintf("พยากรณ์ดวงชะตาเดือน%s %d สำเร็จ", monthName, req.YearBE),
		"data": map[string]any{
			"month":            req.Month,
			"yearBE":           req.YearBE,
			"monthName":        monthName,
			"title":            fmt.Sprintf("คำพยากรณ์ดวงชะตาประจำเดือน%s พ.ศ. %d", monthName, req.YearBE),
			"subtitle":         fmt.Sprintf("วิเคราะห์ดาวจรเทียบ%s • เดือนที่ %d จาก 12 เดือน", req.Ascendant, req.Month),
			"prediction":       prediction,
			"transitHighlight": fmt.Sprintf("ดาวพฤหัสบดีและดาวศุกร์จรส่งกระแสศุภมงคลในเดือน%s %d", monthName, req.YearBE),
			"luckyHint":        fmt.Sprintf("✨ เดือน%s %d: แนะนำทำบุญแสงสว่างหรือบริจาคทานเพื่อเสริมสิริมงคล", monthName, req.YearBE),
		},
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(respPayload)
}

func (h *Handler) proxyRawToHoraService(w http.ResponseWriter, r *http.Request, endpointPath string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("❌ [Hora] Read body error (%s): %v", endpointPath, err)
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "error",
			"message": "ไม่สามารถอ่านข้อมูลคำขอได้: " + err.Error(),
		})
		return
	}

	targetURL := h.horaServiceURL + endpointPath
	log.Printf("🔮 [Hora] ส่งคำขอ Proxy ไปยัง %s: %s", targetURL, string(bodyBytes))

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, bytes.NewReader(bodyBytes))
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "error",
			"message": "Internal Server Error",
		})
		return
	}
	req.Header.Set("Content-Type", "application/json")

	start := time.Now()
	resp, err := h.httpClient.Do(req)
	if err != nil {
		log.Printf("❌ [Hora] เชื่อมต่อ lahiri-api (%s) ล้มเหลว (%v): %v", targetURL, time.Since(start).Round(time.Millisecond), err)
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "error",
			"message": fmt.Sprintf("ไม่สามารถเชื่อมต่อ lahiri-api (%s) ได้: %v", targetURL, err),
		})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "error",
			"message": "ไม่สามารถอ่านข้อมูลผลลัพธ์จาก lahiri-api ได้",
		})
		return
	}

	log.Printf("✅ [Hora] ได้รับผลลัพธ์จาก %s -> Status: %d | Size: %dB | Time: %v",
		targetURL,
		resp.StatusCode,
		len(respBody),
		time.Since(start).Round(time.Millisecond),
	)

	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
}

func (h *Handler) proxyToHoraService(w http.ResponseWriter, r *http.Request, endpointPath string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	// 1. อ่านและตรวจสอบ JSON Request จาก Frontend
	var payload HoraCalculatePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		log.Printf("❌ [Hora] Decode request error (%s): %v", endpointPath, err)
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "error",
			"message": "รูปแบบข้อมูลคำขอไม่ถูกต้อง: " + err.Error(),
		})
		return
	}

	if payload.CalculateReq.TimeZone == 0 {
		payload.CalculateReq.TimeZone = 7.0
	}
	if payload.CalculateReq.HouseSystem == "" {
		payload.CalculateReq.HouseSystem = "W"
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("❌ [Hora] Marshal payload error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "error",
			"message": "ไม่สามารถสร้างคำขอได้",
		})
		return
	}

	// 2. ส่งคำขอต่อไปยัง lahiri-api (เช่น http://localhost:8083/api/v1/hora/calculate)
	targetURL := h.horaServiceURL + endpointPath
	log.Printf("🔮 [Hora] ส่งคำขอไปยัง %s: %s", targetURL, string(bodyBytes))

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, bytes.NewReader(bodyBytes))
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "error",
			"message": "Internal Server Error",
		})
		return
	}
	req.Header.Set("Content-Type", "application/json")

	start := time.Now()
	resp, err := h.httpClient.Do(req)
	if err != nil {
		log.Printf("❌ [Hora] เชื่อมต่อ lahiri-api (%s) ล้มเหลว (%v): %v", targetURL, time.Since(start).Round(time.Millisecond), err)
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "error",
			"message": fmt.Sprintf("ไม่สามารถเชื่อมต่อ lahiri-api (%s) ได้: %v", targetURL, err),
		})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "error",
			"message": "ไม่สามารถอ่านข้อมูลผลลัพธ์จาก lahiri-api ได้",
		})
		return
	}

	log.Printf("✅ [Hora] ได้รับผลลัพธ์จาก %s -> Status: %d | Size: %dB | Time: %v",
		targetURL,
		resp.StatusCode,
		len(respBody),
		time.Since(start).Round(time.Millisecond),
	)

	// 3. ส่งต่อ Status Code และ JSON ที่แปลภาษาไทยพร้อมใช้งานแล้วจาก lahiri-api กลับไปยัง Frontend ทันที
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
}
