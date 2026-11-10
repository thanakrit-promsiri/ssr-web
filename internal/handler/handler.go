package handler

import (
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"strings"
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
			Timeout: 300 * time.Second,
		},
	}
}

// RegisterRoutes ลงทะเบียน Routes ทั้งหมดเข้ากับ ServeMux
func (h *Handler) RegisterRoutes(mux *http.ServeMux) error {
	// 1. Routes สำหรับหน้าเว็บหลัก (SSR)
	mux.HandleFunc("GET /{$}", h.HandleIndex)
	mux.HandleFunc("GET /index.html", h.HandleIndex)
	mux.HandleFunc("GET /chat.html", h.HandleChat)
	mux.HandleFunc("GET /transit.html", h.HandleTransit)

	// 1.1 Proxy Route สำหรับดึงสถานะ Serial Key จาก Auth Service
	mux.HandleFunc("GET /api/v1/auth/serial-keys", h.HandleAuthSerialKeys)
	mux.HandleFunc("GET /auth/serial-keys", h.HandleAuthSerialKeys)

	// 2. API Routes สำหรับคำนวณดวงชะตาโหราศาสตร์พระเวทและวิมโสตรีทศา (เชื่อม lahiri-api)
	// รองรับทั้ง /api/v1/hora/... และ /hora/... (เผื่อกรณี Nginx ดัก /api/ ไปที่ Auth Service)
	mux.HandleFunc("POST /api/v1/hora/calculate", h.HandleHoraCalculate)
	mux.HandleFunc("POST /hora/calculate", h.HandleHoraCalculate)
	mux.HandleFunc("POST /api/v1/hora/dasha", h.HandleHoraDasha)
	mux.HandleFunc("POST /hora/dasha", h.HandleHoraDasha)
	mux.HandleFunc("POST /api/v1/hora/predict", h.HandleHoraPredict)
	mux.HandleFunc("POST /hora/predict", h.HandleHoraPredict)
	mux.HandleFunc("POST /api/v1/hora/{transitEndpoint}", h.HandleHoraTransitPredict)
	mux.HandleFunc("POST /hora/{transitEndpoint}", h.HandleHoraTransitPredict)

	// 3. Route สำหรับเสิร์ฟไฟล์ Static โค้ดหลักจาก embed.FS (web/static/) ใน RAM
	staticFS, err := fs.Sub(web.Assets, "static")
	if err != nil {
		return err
	}
	staticServer := http.StripPrefix("/static/", http.FileServerFS(staticFS))
	mux.HandleFunc("GET /static/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".js") {
			setNoCacheHeaders(w)
		}
		staticServer.ServeHTTP(w, r)
	})

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
	h.verifyAuthAndServeHTML(w, r, "chat.html")
}

// HandleTransit ตรวจสอบสิทธิ์ผ่าน Auth Microservice ก่อนเสิร์ฟหน้า transit.html (ทำนายดวงชะตา พ.ศ. 2570)
func (h *Handler) HandleTransit(w http.ResponseWriter, r *http.Request) {
	h.verifyAuthAndServeHTML(w, r, "transit.html")
}

func setNoCacheHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
}

func (h *Handler) serveEmbeddedHTML(w http.ResponseWriter, name string) {
	data, err := fs.ReadFile(web.Assets, name)
	if err != nil {
		http.Error(w, "Page Not Found", http.StatusNotFound)
		return
	}
	setNoCacheHeaders(w)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(data)
}
