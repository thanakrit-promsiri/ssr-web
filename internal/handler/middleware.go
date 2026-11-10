package handler

import (
	"log"
	"net/http"
	"time"
)

// statusRecorder ดักจับ HTTP Status Code และขนาดข้อมูลที่ส่งกลับเพื่อนำไปแสดงใน Debug Log
type statusRecorder struct {
	http.ResponseWriter
	statusCode int
	bytesSent  int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.statusCode = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	n, err := r.ResponseWriter.Write(b)
	r.bytesSent += n
	return n, err
}

// LoggingMiddleware แสดง Log ทุก HTTP Request ที่วิ่งเข้ามาที่เซิร์ฟเวอร์ พร้อมเวลาที่ใช้และ Status Code
func (h *Handler) LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
		}

		clientIP := r.Header.Get("X-Forwarded-For")
		if clientIP == "" {
			clientIP = r.RemoteAddr
		}

		hasCookie := "ไม่มี"
		if c, err := r.Cookie("auth_token"); err == nil && c.Value != "" {
			hasCookie = "มี"
		}

		next.ServeHTTP(rec, r)

		duration := time.Since(start)
		safeMethod := sanitizeLogString(r.Method)
		safeURI := sanitizeLogString(r.URL.RequestURI())
		safeIP := sanitizeLogString(clientIP)

		log.Printf(
			"🌐 [HTTP] %s %s | Status: %d | Size: %dB | Time: %v | Cookie(auth_token): %s | IP: %s",
			safeMethod,
			safeURI,
			rec.statusCode,
			rec.bytesSent,
			duration.Round(time.Microsecond),
			hasCookie,
			safeIP,
		)
	})
}
