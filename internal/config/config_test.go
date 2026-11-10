package config

import (
	"os"
	"testing"
)

func TestLoad_DefaultsAndCustomEnv(t *testing.T) {
	_ = os.Unsetenv("PORT")
	_ = os.Unsetenv("AUTH_SERVICE_URL")
	_ = os.Unsetenv("HORA_SERVICE_URL")

	cfgDefault := Load()
	if cfgDefault.Port == "" {
		t.Fatal("expected non-empty default port")
	}
	if cfgDefault.AuthServiceURL == "" {
		t.Fatal("expected non-empty default AuthServiceURL")
	}
	if cfgDefault.HoraServiceURL == "" {
		t.Fatal("expected non-empty default HoraServiceURL")
	}

	t.Setenv("PORT", "9090")
	t.Setenv("AUTH_SERVICE_URL", "http://127.0.0.1:8082/")
	t.Setenv("HORA_SERVICE_URL", "http://127.0.0.1:8083/")

	cfgCustom := Load()
	if cfgCustom.Port != "9090" {
		t.Fatalf("expected port 9090, got %s", cfgCustom.Port)
	}
	if cfgCustom.AuthServiceURL != "http://127.0.0.1:8082" {
		t.Fatalf("expected trimmed AuthServiceURL, got %s", cfgCustom.AuthServiceURL)
	}
	if cfgCustom.HoraServiceURL != "http://127.0.0.1:8083" {
		t.Fatalf("expected trimmed HoraServiceURL, got %s", cfgCustom.HoraServiceURL)
	}
}
