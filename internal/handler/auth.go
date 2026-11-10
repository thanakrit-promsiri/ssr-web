package handler

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"
)

// HandleAuthSerialKeys Proxy ดึงข้อมูลสถานะ Serial Key จาก Auth Service (/api/v1/auth/serial-keys)
func (h *Handler) HandleAuthSerialKeys(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	setNoCacheHeaders(w)

	targetURL := h.authServiceURL + "/api/v1/auth/serial-keys"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL, nil)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": false,
			"message": "Internal Server Error",
		})
		return
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		log.Printf("❌ [Auth] ดึงข้อมูล Serial Keys จาก %s ล้มเหลว: %v", targetURL, err)
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": false,
			"message": "ไม่สามารถเชื่อมต่อระบบตรวจสอบ Serial Key ได้",
		})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": false,
			"message": "ไม่สามารถอ่านข้อมูลสถานะ Serial Key ได้",
		})
		return
	}

	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(body)
}

// verifyAuthAndServeHTML ตรวจสอบ Cookie auth_token กับ Auth Microservice ก่อนเสิร์ฟหน้า HTML ที่ต้องใช้สิทธิ์
func (h *Handler) verifyAuthAndServeHTML(w http.ResponseWriter, r *http.Request, pageName string) {
	cookie, err := r.Cookie("auth_token")
	if err != nil || cookie.Value == "" {
		log.Printf("🚫 [Auth] เข้าหน้า /%s โดยไม่มี Cookie auth_token -> Redirect ไป /index.html", pageName)
		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
		return
	}

	verifyURL := h.authServiceURL + "/api/v1/auth/verify"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, verifyURL, nil)
	if err != nil {
		log.Printf("❌ [Auth] สร้าง Request ไปยัง %s ล้มเหลว: %v", verifyURL, err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	req.AddCookie(cookie)

	start := time.Now()
	resp, err := h.httpClient.Do(req)
	if err != nil {
		log.Printf("❌ [Auth] เชื่อมต่อ Auth Service (%s) ล้มเหลว (%v): %v -> ล้าง Cookie และ Redirect", verifyURL, time.Since(start).Round(time.Millisecond), err)
		clearAuthCookie(w)
		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
		return
	}
	defer resp.Body.Close()

	log.Printf("🔐 [Auth] ตรวจสอบสิทธิ์กับ %s -> Status: %d (ใช้เวลา %v)", verifyURL, resp.StatusCode, time.Since(start).Round(time.Millisecond))

	if resp.StatusCode != http.StatusOK {
		log.Printf("⚠️ [Auth] Token ไม่ผ่านการตรวจสอบ (Status %d) -> ล้าง Cookie และ Redirect ไป /index.html", resp.StatusCode)
		clearAuthCookie(w)
		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
		return
	}

	h.serveEmbeddedHTML(w, pageName)
}

// clearAuthCookie ล้าง Cookie auth_token ที่หมดอายุหรือไม่ถูกต้อง เพื่อป้องกัน Redirect Loop ระหว่าง /index.html กับ /chat.html
func clearAuthCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}
