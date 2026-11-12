package handler

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	// sessionCookieTTL กำหนดอายุสูงสุดของ Session Cookie (30 นาที = 1800 วินาที)
	sessionCookieTTL        = 30 * time.Minute
	sessionExpiryCookieName = "ssr_session_exp"
	sessionCookieMaxAge     = int(sessionCookieTTL / time.Second)
)

// HandleAuthSerialKeys Proxy ดึงข้อมูลสถานะ Serial Key จาก Auth Service (/api/v1/auth/serial-keys)
func (h *Handler) HandleAuthSerialKeys(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	setNoCacheHeaders(w)

	targetURL := h.authServiceURL + "/api/v1/auth/serial-keys"
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
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

// verifyAuthAndServeHTML ตรวจสอบ Cookie auth_token และอายุเซสชัน 30 นาที ก่อนเสิร์ฟหน้า HTML ที่ต้องใช้สิทธิ์
func (h *Handler) verifyAuthAndServeHTML(w http.ResponseWriter, r *http.Request, pageName string) {
	cookie, err := r.Cookie("auth_token")
	if err != nil || cookie.Value == "" {
		log.Printf("🚫 [Auth] เข้าหน้า /%s โดยไม่มี Cookie auth_token -> Redirect ไป /index.html", pageName)
		clearSessionExpiryCookie(w)
		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
		return
	}

	now := time.Now()
	hasExpiryCookie, expired := hasSessionExpiryCookieAndExpired(r, now)
	if expired {
		log.Printf("⏰ [Auth] เซสชันหมดอายุ (ครบ 30 นาที) ที่หน้า /%s -> ล้าง Cookie และ Redirect ไป /index.html?expired=1", pageName)
		clearAuthCookie(w)
		http.Redirect(w, r, "/index.html?expired=1", http.StatusSeeOther)
		return
	}

	verifyURL := h.authServiceURL + "/api/v1/auth/verify"
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, verifyURL, nil)
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

	if !hasExpiryCookie {
		setSessionExpiryCookie(w, now)
	}

	h.serveEmbeddedHTML(w, pageName)
}

func newSessionCookie(name, value string, maxAge int, expires time.Time) *http.Cookie {
	c := &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	}
	if !expires.IsZero() {
		c.Expires = expires
	}
	return c
}

// setSessionExpiryCookie กำหนด Cookie ssr_session_exp ให้มีอายุ 30 นาที (Max-Age=1800)
func setSessionExpiryCookie(w http.ResponseWriter, now time.Time) {
	exp := now.Add(sessionCookieTTL)
	http.SetCookie(w, newSessionCookie(sessionExpiryCookieName, strconv.FormatInt(exp.Unix(), 10), sessionCookieMaxAge, exp))
}

// clearSessionExpiryCookie ลบ Cookie ssr_session_exp เพื่อให้การเข้าสู่ระบบรอบใหม่เริ่มนับอายุ 30 นาทีใหม่
func clearSessionExpiryCookie(w http.ResponseWriter) {
	http.SetCookie(w, newSessionCookie(sessionExpiryCookieName, "", -1, time.Time{}))
}

// hasSessionExpiryCookieAndExpired คืนค่า (hasCookie, expired) สำหรับตรวจสอบอายุของ ssr_session_exp
func hasSessionExpiryCookieAndExpired(r *http.Request, now time.Time) (bool, bool) {
	c, err := r.Cookie(sessionExpiryCookieName)
	if err != nil {
		return false, false
	}
	expUnix, parseErr := strconv.ParseInt(strings.TrimSpace(c.Value), 10, 64)
	if parseErr != nil || expUnix <= 0 {
		return true, true
	}
	return true, now.Unix() >= expUnix
}

// clearAuthCookie ล้าง Cookie auth_token และ ssr_session_exp ที่หมดอายุหรือไม่ถูกต้อง เพื่อป้องกัน Redirect Loop ระหว่าง /index.html กับ /chat.html
func clearAuthCookie(w http.ResponseWriter) {
	http.SetCookie(w, newSessionCookie("auth_token", "", -1, time.Time{}))
	clearSessionExpiryCookie(w)
}
