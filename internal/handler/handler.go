package handler

import (
	"io/fs"
	"net/http"
	"path/filepath"
	"time"

	"ssr-web/web"
)

// Handler จัดการ HTTP Requests สำหรับหน้าเว็บ SSR และไฟล์ Static
type Handler struct {
	authServiceURL string
	httpClient     *http.Client
}

// New สร้าง Handler พร้อมกำหนดค่าเริ่มต้นของ HTTP Client
func New(authServiceURL string) *Handler {
	return &Handler{
		authServiceURL: authServiceURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// RegisterRoutes ลงทะเบียน Routes ทั้งหมดเข้ากับ ServeMux
func (h *Handler) RegisterRoutes(mux *http.ServeMux) error {
	// 1. Routes สำหรับหน้าเว็บหลัก (SSR)
	mux.HandleFunc("GET /{$}", h.HandleIndex)
	mux.HandleFunc("GET /index.html", h.HandleIndex)
	mux.HandleFunc("GET /chat.html", h.HandleChat)

	// 2. Route สำหรับเสิร์ฟไฟล์ Static โค้ดหลักจาก embed.FS (web/static/) ใน RAM
	staticFS, err := fs.Sub(web.Assets, "static")
	if err != nil {
		return err
	}
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServerFS(staticFS)))

	// 3. Hybrid Mode: เสิร์ฟไฟล์รูปภาพและ Favicon จากโฟลเดอร์ public/ บน Disk โดยตรง
	// ช่วยให้ไฟล์ Binary ไม่บวม และเปลี่ยนรูปภาพได้ทันทีโดยไม่ต้อง Compile ใหม่
	publicServer := http.FileServer(http.Dir("public"))
	mux.Handle("GET /public/", http.StripPrefix("/public/", publicServer))
	mux.HandleFunc("GET /favicon.ico", h.HandleFavicon)

	return nil
}

// HandleFavicon เสิร์ฟไฟล์ไอคอนจากโฟลเดอร์ public/ บน Disk
func (h *Handler) HandleFavicon(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, filepath.Join("public", "favicon.png"))
}

// HandleIndex เสิร์ฟหน้าลงทะเบียน/เข้าสู่ระบบ (index.html)
func (h *Handler) HandleIndex(w http.ResponseWriter, r *http.Request) {
	h.serveEmbeddedHTML(w, "index.html")
}

// HandleChat ตรวจสอบสิทธิ์ผ่าน Auth Microservice ก่อนเสิร์ฟหน้า chat.html
func (h *Handler) HandleChat(w http.ResponseWriter, r *http.Request) {
	// 1. ตรวจสอบเบื้องต้นว่ามี Cookie หรือไม่
	cookie, err := r.Cookie("auth_token")
	if err != nil || cookie.Value == "" {
		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
		return
	}

	// 2. สร้าง Request เพื่อส่งต่อไปยัง Auth Microservice
	verifyURL := h.authServiceURL + "/api/v1/auth/verify"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, verifyURL, nil)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// 3. แนบ Cookie ของผู้ใช้งานส่งต่อไปด้วย
	req.AddCookie(cookie)

	// 4. ส่งคำขอผ่าน HTTP Client ที่กำหนด Timeout ไว้
	resp, err := h.httpClient.Do(req)
	if err != nil {
		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
		return
	}

	// 5. หากผ่านทุกขั้นตอน เสิร์ฟหน้า chat.html จาก embed.FS
	h.serveEmbeddedHTML(w, "chat.html")
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
