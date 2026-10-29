package handler

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// roundTripFunc ใช้จำลองการทำงานของ Auth Microservice ในระดับ HTTP Transport
type roundTripFunc func(req *http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func newMockAuthHandler(expectedToken string) *Handler {
	h := New("http://auth-service")
	h.httpClient.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		status := http.StatusUnauthorized
		if req.URL.Path == "/api/v1/auth/verify" {
			if c, err := req.Cookie("auth_token"); err == nil && c.Value == expectedToken {
				status = http.StatusOK
			}
		}
		return &http.Response{
			StatusCode: status,
			Body:       io.NopCloser(strings.NewReader(`{"status":"ok"}`)),
			Header:     make(http.Header),
		}, nil
	})
	return h
}

// ==========================================
// 1. Unit Tests (ตรวจสอบความถูกต้องของแต่ละ Route)
// ==========================================

func TestHandleIndex(t *testing.T) {
	h := New("http://localhost:8082")
	mux := http.NewServeMux()
	if err := h.RegisterRoutes(mux); err != nil {
		t.Fatalf("RegisterRoutes failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if rec.Body.Len() == 0 {
		t.Fatal("expected non-empty HTML response")
	}
}

func TestHandleChat_NoCookie_Redirects(t *testing.T) {
	h := New("http://localhost:8082")
	req := httptest.NewRequest(http.MethodGet, "/chat.html", nil)
	rec := httptest.NewRecorder()

	h.HandleChat(rec, req)

	if rec.Code != http.StatusSeeOther {
		t.Fatalf("expected status 303 redirect, got %d", rec.Code)
	}
}

func TestHandleChat_Authorized(t *testing.T) {
	h := newMockAuthHandler("valid-token")

	req := httptest.NewRequest(http.MethodGet, "/chat.html", nil)
	req.AddCookie(&http.Cookie{Name: "auth_token", Value: "valid-token"})
	rec := httptest.NewRecorder()

	h.HandleChat(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if rec.Body.Len() == 0 {
		t.Fatal("expected non-empty chat.html response")
	}
}

func TestStaticDistrictJSON(t *testing.T) {
	h := New("http://localhost:8082")
	mux := http.NewServeMux()
	if err := h.RegisterRoutes(mux); err != nil {
		t.Fatalf("RegisterRoutes failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/static/district.json", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 for /static/district.json, got %d", rec.Code)
	}
	if rec.Body.Len() == 0 {
		t.Fatal("expected non-empty district.json body")
	}
}

// ==========================================
// 2. Load / Benchmark Tests (ทดสอบยิงพร้อมกันแบบ Parallel)
// ==========================================

// BenchmarkHandleIndex_Parallel ทดสอบเสิร์ฟหน้าแรก (index.html) จาก embed.FS พร้อมกันหลาย Goroutines
func BenchmarkHandleIndex_Parallel(b *testing.B) {
	h := New("http://localhost:8082")
	mux := http.NewServeMux()
	_ = h.RegisterRoutes(mux)

	b.ReportAllocs()
	b.ResetTimer()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				b.Fatalf("unexpected status: %d", rec.Code)
			}
		}
	})
}

// BenchmarkStaticJS_Parallel ทดสอบเสิร์ฟไฟล์ Static (/static/birth.js) จาก embed.FS พร้อมกัน
func BenchmarkStaticJS_Parallel(b *testing.B) {
	h := New("http://localhost:8082")
	mux := http.NewServeMux()
	_ = h.RegisterRoutes(mux)

	b.ReportAllocs()
	b.ResetTimer()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			req := httptest.NewRequest(http.MethodGet, "/static/birth.js", nil)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				b.Fatalf("unexpected status: %d", rec.Code)
			}
		}
	})
}

// BenchmarkHandleChat_Parallel ทดสอบเสิร์ฟหน้า /chat.html รวมขั้นตอนตรวจสอบสิทธิ์แบบ Parallel
func BenchmarkHandleChat_Parallel(b *testing.B) {
	h := newMockAuthHandler("valid-token")

	b.ReportAllocs()
	b.ResetTimer()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			req := httptest.NewRequest(http.MethodGet, "/chat.html", nil)
			req.AddCookie(&http.Cookie{Name: "auth_token", Value: "valid-token"})
			rec := httptest.NewRecorder()
			h.HandleChat(rec, req)

			if rec.Code != http.StatusOK {
				b.Fatalf("unexpected status: %d", rec.Code)
			}
		}
	})
}
