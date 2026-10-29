package main

import (
	"log"
	"net/http"
	"time"

	"ssr-web/internal/config"
	"ssr-web/internal/handler"
)

func main() {
	cfg := config.Load()

	mux := http.NewServeMux()
	h := handler.New(cfg.AuthServiceURL)
	if err := h.RegisterRoutes(mux); err != nil {
		log.Fatalf("Failed to register routes: %v", err)
	}

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("🚀 SSR Web Server กำลังรันที่พอร์ต http://localhost:%s (Auth: %s)", cfg.Port, cfg.AuthServiceURL)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed: %v", err)
	}
}
