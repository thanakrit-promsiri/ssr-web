package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

func handleIndex(w http.ResponseWriter, r *http.Request) {
	filePath := filepath.Join("html", "index.html")
	http.ServeFile(w, r, filePath)
}

func handleChat(w http.ResponseWriter, r *http.Request) {
	// 1. ตรวจสอบเบื้องต้นว่ามี Cookie หรือไม่
	cookie, err := r.Cookie("auth_token")
	if err != nil || cookie.Value == "" {
		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
		return
	}

	// 2. สร้าง Request เพื่อส่งต่อไปยัง Auth Microservice
	authServiceURL := "http://localhost:7777/api/v1/auth/verify"

	req, err := http.NewRequest("GET", authServiceURL, nil)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// 3. แนบ Cookie ของผู้ใช้งานส่งต่อไปด้วย
	req.AddCookie(cookie)

	// 4. ส่งคำขอผ่าน HTTP Client ของ Go
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		http.Redirect(w, r, "/index.html", http.StatusSeeOther)
		return
	}
	defer resp.Body.Close()

	// 5. หากผ่านทุกขั้นตอน เสิร์ฟหน้า chat.html
	filePath := filepath.Join("html", "chat.html")
	http.ServeFile(w, r, filePath)
}

func main() {
	// โหลดค่าจากไฟล์ .env
	if err := godotenv.Load(); err != nil {
		log.Println("⚠️ ไม่พบไฟล์ .env ใช้ค่าเริ่มต้นระบบแทน")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "6666" // ค่าเริ่มต้น
	}

	// 1. Routes สำหรับหน้าเว็บหลัก (SSR)
	http.HandleFunc("/", handleIndex)
	http.HandleFunc("/index.html", handleIndex)
	http.HandleFunc("/chat.html", handleChat)

	// 2. Route สำหรับเสิร์ฟไฟล์ Static ทั้งหมดในโฟลเดอร์ html/static/ (รองรับเป็นร้อยไฟล์อัตโนมัติ)
	// เมื่อมีการเรียกผ่าน /static/... Go จะวิ่งไปหาไฟล์ในโฟลเดอร์ html/static/ ทันทีโดยไม่ชนกับหน้าเว็บหลัก
	fs := http.FileServer(http.Dir("html/static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	log.Printf("🚀 SSR Web Server กำลังรันที่พอร์ต http://localhost:%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}