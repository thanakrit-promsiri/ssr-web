package config

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

// Config เก็บค่าการตั้งค่าหลักของเซิร์ฟเวอร์
type Config struct {
	Port           string
	AuthServiceURL string
	HoraServiceURL string
}

// Load โหลดค่าจากไฟล์ .env หรือใช้ค่าเริ่มต้นหากไม่ได้กำหนดไว้
func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("⚠️ ไม่พบไฟล์ .env ใช้ค่าเริ่มต้นระบบแทน")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	authURL := strings.TrimRight(os.Getenv("AUTH_SERVICE_URL"), "/")
	if authURL == "" {
		authURL = "http://localhost:8082"
	}

	horaURL := strings.TrimRight(os.Getenv("HORA_SERVICE_URL"), "/")
	if horaURL == "" {
		horaURL = "http://localhost:8083"
	}

	return &Config{
		Port:           port,
		AuthServiceURL: authURL,
		HoraServiceURL: horaURL,
	}
}
