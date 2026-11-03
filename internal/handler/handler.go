package handler

import (
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"ssr-web/web"
)

// Handler จัดการ HTTP Requests สำหรับหน้าเว็บ SSR, API และไฟล์ Static
type Handler struct {
	authServiceURL string
	horaServiceURL string
	httpClient     *http.Client
}

// New สร้าง Handler พร้อมกำหนดค่าเริ่มต้นของ HTTP Client
func New(authServiceURL string, horaServiceURL ...string) *Handler {
	horaURL := "http://localhost:8083"
	if len(horaServiceURL) > 0 && horaServiceURL[0] != "" {
		horaURL = horaServiceURL[0]
	}

	return &Handler{
		authServiceURL: authServiceURL,
		horaServiceURL: horaURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// RegisterRoutes ลงทะเบียน Routes ทั้งหมดเข้ากับ ServeMux
func (h *Handler) RegisterRoutes(mux *http.ServeMux) error {
	// 1. Routes สำหรับหน้าเว็บหลัก (SSR)
	mux.HandleFunc("GET /{$}", h.HandleIndex)
	mux.HandleFunc("GET /index.html", h.HandleIndex)
	mux.HandleFunc("GET /chat.html", h.HandleChat)

	// 2. API Routes สำหรับคำนวณดวงชะตาโหราศาสตร์พระเวทและวิมโสตรีทศา (เชื่อม lahiri-api)
	// รองรับทั้ง /api/v1/hora/... และ /hora/... (เผื่อกรณี Nginx ดัก /api/ ไปที่ Auth Service)
	mux.HandleFunc("POST /api/v1/hora/calculate", h.HandleHoraCalculate)
	mux.HandleFunc("POST /hora/calculate", h.HandleHoraCalculate)
	mux.HandleFunc("POST /api/v1/hora/dasha", h.HandleHoraDasha)
	mux.HandleFunc("POST /hora/dasha", h.HandleHoraDasha)

	// 3. Route สำหรับเสิร์ฟไฟล์ Static โค้ดหลักจาก embed.FS (web/static/) ใน RAM
	staticFS, err := fs.Sub(web.Assets, "static")
	if err != nil {
		return err
	}
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServerFS(staticFS)))

	// 4. Hybrid Mode: เสิร์ฟไฟล์รูปภาพและ Favicon จากโฟลเดอร์ public/ บน Disk โดยตรง
	publicServer := http.FileServer(http.Dir("public"))
	mux.Handle("GET /public/", http.StripPrefix("/public/", publicServer))
	mux.HandleFunc("GET /favicon.ico", h.HandleFavicon)

	return nil
}

// HandleFavicon เสิร์ฟไฟล์ไอคอนจากโฟลเดอร์ public/ บน Disk
func (h *Handler) HandleFavicon(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, filepath.Join("public", "favicon.png"))
}

// HandleIndex เสิร์ฟหน้าลงทะเบียน/เข้าสู่ระบบ (index.html) หรือ Redirect ไป /chat.html หากมี Cookie auth_token
func (h *Handler) HandleIndex(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("auth_token"); err == nil && cookie.Value != "" {
		log.Printf("🔑 [Auth] พบ Cookie auth_token ที่หน้า %s -> Redirect ไป /chat.html", r.URL.Path)
		http.Redirect(w, r, "/chat.html", http.StatusSeeOther)
		return
	}
	h.serveEmbeddedHTML(w, "index.html")
}

// HandleChat ตรวจสอบสิทธิ์ผ่าน Auth Microservice ก่อนเสิร์ฟหน้า chat.html
func (h *Handler) HandleChat(w http.ResponseWriter, r *http.Request) {
	// 1. ตรวจสอบเบื้องต้นว่ามี Cookie หรือไม่
	cookie, err := r.Cookie("auth_token")
	if err != nil || cookie.Value == "" {
		log.Printf("🚫 [Auth] เข้าหน้า /chat.html โดยไม่มี Cookie auth_token -> Redirect ไป /index.html")
		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
		return
	}

	// 2. สร้าง Request เพื่อส่งต่อไปยัง Auth Microservice
	verifyURL := h.authServiceURL + "/api/v1/auth/verify"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, verifyURL, nil)
	if err != nil {
		log.Printf("❌ [Auth] สร้าง Request ไปยัง %s ล้มเหลว: %v", verifyURL, err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// 3. แนบ Cookie ของผู้ใช้งานส่งต่อไปด้วย
	req.AddCookie(cookie)

	// 4. ส่งคำขอผ่าน HTTP Client ที่กำหนด Timeout ไว้
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

	// 5. หากผ่านทุกขั้นตอน เสิร์ฟหน้า chat.html จาก embed.FS
	h.serveEmbeddedHTML(w, "chat.html")
}

// clearAuthCookie ล้าง Cookie auth_token ที่หมดอายุหรือไม่ถูกต้อง เพื่อป้องกัน Redirect Loop ระหว่าง /index.html กับ /chat.html
func clearAuthCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})
}

func (h *Handler) serveEmbeddedHTML(w http.ResponseWriter, name string) {
	data, err := fs.ReadFile(web.Assets, name)
	if err != nil {
		http.Error(w, "Page Not Found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(data)
}
