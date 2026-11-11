package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
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

// รายการ Endpoint คงที่สำหรับทำนายดวงจร 12 เดือน (ป้องกัน Taint / Log Injection และ Path Traversal)
var validTransitEndpointPaths = [12]string{
	"/api/v1/hora/transitpredict_1",
	"/api/v1/hora/transitpredict_2",
	"/api/v1/hora/transitpredict_3",
	"/api/v1/hora/transitpredict_4",
	"/api/v1/hora/transitpredict_5",
	"/api/v1/hora/transitpredict_6",
	"/api/v1/hora/transitpredict_7",
	"/api/v1/hora/transitpredict_8",
	"/api/v1/hora/transitpredict_9",
	"/api/v1/hora/transitpredict_10",
	"/api/v1/hora/transitpredict_11",
	"/api/v1/hora/transitpredict_12",
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

// HandleHoraTransitPredict ส่งคำขอทำนายดวงชะตาดาวจรรายเดือนไปยัง lahiri-api (/api/v1/hora/transitpredict_1 ถึง /api/v1/hora/transitpredict_12)
func (h *Handler) HandleHoraTransitPredict(w http.ResponseWriter, r *http.Request) {
	transitEndpoint := r.PathValue("transitEndpoint")
	const prefix = "transitpredict_"
	if !strings.HasPrefix(transitEndpoint, prefix) {
		writeInvalidTransitMonthError(w)
		return
	}

	month, err := strconv.Atoi(strings.TrimPrefix(transitEndpoint, prefix))
	if err != nil || month < 1 || month > 12 {
		writeInvalidTransitMonthError(w)
		return
	}

	// ใช้ค่าคงที่จาก Array ที่ผ่านการตรวจสอบช่วง 1..12 แล้วเท่านั้น
	safeEndpointPath := validTransitEndpointPaths[month-1]
	h.proxyRawToHoraService(w, r, safeEndpointPath)
}

func writeInvalidTransitMonthError(w http.ResponseWriter) {
	writeJSONError(w, http.StatusBadRequest, map[string]any{
		"success": false,
		"message": "กรุณาระบุ endpoint ระหว่าง transitpredict_1 ถึง transitpredict_12",
	})
}

// maxHoraBodyBytes กำหนดขนาดสูงสุดของ Request Body ที่ยอมรับได้ (1 MB) เพื่อป้องกัน DoS/OOM
const maxHoraBodyBytes = 1 << 20 // 1 MB

func (h *Handler) proxyRawToHoraService(w http.ResponseWriter, r *http.Request, endpointPath string) {
	r.Body = http.MaxBytesReader(w, r.Body, maxHoraBodyBytes)
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("❌ [Hora] Read request body failed for endpoint %s: %v", sanitizeLogString(endpointPath), err)
		writeJSONError(w, http.StatusBadRequest, map[string]string{
			"status":  "error",
			"message": "ไม่สามารถอ่านข้อมูลคำขอได้: " + err.Error(),
		})
		return
	}

	h.forwardJSONToHora(w, r, endpointPath, bodyBytes, true)
}

func (h *Handler) proxyToHoraService(w http.ResponseWriter, r *http.Request, endpointPath string) {
	r.Body = http.MaxBytesReader(w, r.Body, maxHoraBodyBytes)
	var payload HoraCalculatePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		log.Printf("❌ [Hora] Invalid JSON request payload for endpoint %s: %v", sanitizeLogString(endpointPath), err)
		writeJSONError(w, http.StatusBadRequest, map[string]string{
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
		log.Println("❌ [Hora] Marshal payload error")
		writeJSONError(w, http.StatusInternalServerError, map[string]string{
			"status":  "error",
			"message": "ไม่สามารถสร้างคำขอได้",
		})
		return
	}

	h.forwardJSONToHora(w, r, endpointPath, bodyBytes, false)
}

// forwardJSONToHora ฟังก์ชันกลางสำหรับส่งต่อ JSON Request ไปยัง lahiri-api และส่งผลลัพธ์กลับไปยัง Frontend
func (h *Handler) forwardJSONToHora(w http.ResponseWriter, r *http.Request, endpointPath string, bodyBytes []byte, forwardCookies bool) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	if _, expired := hasSessionExpiryCookieAndExpired(r, time.Now()); expired {
		clearAuthCookie(w)
		writeJSONError(w, http.StatusUnauthorized, map[string]string{
			"status":  "error",
			"message": "เซสชันหมดอายุ (ครบ 15 นาที) กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
		})
		return
	}

	safeEndpoint := sanitizeLogString(endpointPath)
	targetURL := h.horaServiceURL + safeEndpoint
	log.Printf("🔮 [Hora] ส่งคำขอไปยัง %s (Payload: %dB)", targetURL, len(bodyBytes))

	// กำหนด Context Timeout สูงสุด 300 วินาทีสำหรับการคำนวณและพยากรณ์ด้วย AI (รองรับโมเดล DeepSeek)
	ctx, cancel := context.WithTimeout(r.Context(), 300*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(bodyBytes))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, map[string]string{
			"status":  "error",
			"message": "Internal Server Error",
		})
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if forwardCookies {
		for _, c := range r.Cookies() {
			req.AddCookie(c)
		}
	}

	start := time.Now()
	resp, err := h.httpClient.Do(req)
	if err != nil {
		log.Printf("❌ [Hora] เชื่อมต่อ lahiri-api (%s) ล้มเหลว (%v)", targetURL, time.Since(start).Round(time.Millisecond))
		writeJSONError(w, http.StatusBadGateway, map[string]string{
			"status":  "error",
			"message": fmt.Sprintf("ไม่สามารถเชื่อมต่อ lahiri-api (%s) ได้: %v", targetURL, err),
		})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, map[string]string{
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

// sanitizeLogString ลบอักขระขึ้นบรรทัดใหม่ (\r, \n) เพื่อป้องกัน Log Injection (CWE-117)
func sanitizeLogString(s string) string {
	cleaned := strings.ReplaceAll(s, "\r", "")
	return strings.ReplaceAll(cleaned, "\n", "")
}

func writeJSONError(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}
