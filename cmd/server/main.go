package main

import (
	"log"
	"net/http"
	"time"

	"ssr-web/internal/config"
	"ssr-web/internal/handler"
)

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)

	cfg := config.Load()

	mux := http.NewServeMux()
	h := handler.New(cfg.AuthServiceURL, cfg.HoraServiceURL)
	if err := h.RegisterRoutes(mux); err != nil {
		log.Fatalf("Failed to register routes: %v", err)
	}

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      h.LoggingMiddleware(mux),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Println("==========================================================")
	log.Printf("🚀 SSR Web Server กำลังรันที่ http://localhost:%s", cfg.Port)
	log.Printf("🔐 Auth Microservice URL : %s", cfg.AuthServiceURL)
	log.Printf("🔮 Hora Microservice URL : %s", cfg.HoraServiceURL)
	log.Println("==========================================================")

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed: %v", err)
	}
}
