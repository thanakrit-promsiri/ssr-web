package handler

import (
	"encoding/json"
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

func TestHandleIndex_WithCookie_RedirectsToChat(t *testing.T) {
	h := New("http://localhost:8082")
	req := httptest.NewRequest(http.MethodGet, "/index.html", nil)
	req.AddCookie(&http.Cookie{Name: "auth_token", Value: "some-token"})
	rec := httptest.NewRecorder()

	h.HandleIndex(rec, req)

	if rec.Code != http.StatusSeeOther {
		t.Fatalf("expected status 303 redirect, got %d", rec.Code)
	}
	if loc := rec.Header().Get("Location"); loc != "/chat.html" {
		t.Fatalf("expected redirect location /chat.html, got %s", loc)
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

func TestStaticJSNoCacheHeaders(t *testing.T) {
	h := New("http://localhost:8082")
	mux := http.NewServeMux()
	if err := h.RegisterRoutes(mux); err != nil {
		t.Fatalf("RegisterRoutes failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/static/birth.js", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 for /static/birth.js, got %d", rec.Code)
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "no-store") {
		t.Fatalf("expected Cache-Control to contain no-store, got %q", cc)
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

func TestHandleHoraCalculate_ProxiesLahiriAPI(t *testing.T) {
	sampleUpstreamJSON := `{
		"status": "success",
		"calculateResp": {
			"metadata": {
				"julian_day": 2447518.6395833334,
				"ayanamsa_name": "Lahiri",
				"ayanamsa_degrees": "23° 42' 11.19\"",
				"location": {"latitude": 13.7563, "longitude": 100.5018}
			},
			"planets": [
				{
					"name": "Sun",
					"name_thai": "อาทิตย์",
					"symbol": "๑",
					"degree_formatted": "07° 49' 03\"",
					"position": {"sign": "Sagittarius", "sign_thai": "ธนู", "degree": 7, "minute": 49, "second": 3.38},
					"nakshatra": "Mula",
					"nakshatra_thai": "มูละ",
					"pada": 3,
					"lord": "Ketu",
					"lord_thai": "เกตุ (๙)",
					"is_retrograde": false,
					"is_combust": false,
					"dignity": "Friend",
					"dignity_thai": "มิตร",
					"house": 11,
					"house_name_thai": "ลาภะ",
					"house_thai": "11 (ลาภะ)",
					"navamsa": {"sign": "Gemini", "sign_thai": "เมถุน", "index": 3}
				}
			]
		}
	}`

	h := New("http://auth-service", "http://hora-service")
	h.httpClient.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path != "/api/v1/hora/calculate" {
			t.Fatalf("unexpected upstream path: %s", req.URL.Path)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(sampleUpstreamJSON)),
			Header:     make(http.Header),
		}, nil
	})

	reqBody := `{"calculateReq":{"year":1988,"month":12,"day":23,"hour_thai":10.35,"time_zone":7.0,"latitude":13.7563,"longitude":100.5018,"house_system":"W"}}`
	req := httptest.NewRequest(http.MethodPost, "/hora/calculate", strings.NewReader(reqBody))
	rec := httptest.NewRecorder()

	h.HandleHoraCalculate(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if got["status"] != "success" {
		t.Fatalf("expected status success, got %v", got["status"])
	}
}

func TestHandleHoraPredict_ProxiesLahiriAPI(t *testing.T) {
	samplePredictJSON := `{
		"success": true,
		"message": "พยากรณ์พื้นดวงชะตาสำเร็จ",
		"data": {
			"status": "success",
			"prompt": "[Vedic Sidereal(Lahiri)/WholeSign]\nASC:Aq 03°39'23\"|D9:Sc|Nak:Dhanishta(4,Ma)",
			"prediction": "คำพยากรณ์พื้นดวงชะตากำเนิด...",
			"workspace_slug": "testuser01",
			"thread_slug": "testuser01-hora"
		}
	}`

	h := New("http://auth-service", "http://hora-service")
	h.httpClient.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path != "/api/v1/hora/predict" {
			t.Fatalf("unexpected upstream path: %s", req.URL.Path)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(samplePredictJSON)),
			Header:     make(http.Header),
		}, nil
	})

	reqBody := `{"year":1988,"month":12,"day":23,"hour_thai":10.35,"latitude":13.7563,"longitude":100.5018}`
	req := httptest.NewRequest(http.MethodPost, "/hora/predict", strings.NewReader(reqBody))
	rec := httptest.NewRecorder()

	h.HandleHoraPredict(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if got["success"] != true {
		t.Fatalf("expected success true, got %v", got["success"])
	}
	data, ok := got["data"].(map[string]any)
	if !ok || data["prompt"] == "" {
		t.Fatalf("expected non-empty prompt in data, got %v", got["data"])
	}
	if data["prediction"] != "คำพยากรณ์พื้นดวงชะตากำเนิด..." {
		t.Fatalf("expected non-empty prediction, got %v", data["prediction"])
	}
}

func TestHandleHoraPredict_AIUnavailableWarning(t *testing.T) {
	sampleWarningJSON := `{
		"success": true,
		"message": "คำนวณข้อมูลพื้นดวงชะตาสำเร็จ (ระบบทำนาย AI ไม่พร้อมใช้งานชั่วคราว)",
		"data": {
			"status": "success",
			"prompt": "[Vedic Sidereal(Lahiri)/WholeSign]\nASC:Aq 03°39'23\"|D9:Sc|Nak:Dhanishta(4,Ma)",
			"prediction": "",
			"warning": "ไม่สามารถเชื่อมต่อบริการทำนาย AI ได้ในขณะนี้ ระบบได้ส่งคืนข้อมูลพื้นดวงชะตาสำหรับการผูกดวงแล้ว"
		}
	}`

	h := New("http://auth-service", "http://hora-service")
	h.httpClient.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path != "/api/v1/hora/predict" {
			t.Fatalf("unexpected upstream path: %s", req.URL.Path)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(sampleWarningJSON)),
			Header:     make(http.Header),
		}, nil
	})

	reqBody := `{"year":1988,"month":12,"day":23,"hour_thai":10.35,"latitude":13.7563,"longitude":100.5018}`
	req := httptest.NewRequest(http.MethodPost, "/hora/predict", strings.NewReader(reqBody))
	rec := httptest.NewRecorder()

	h.HandleHoraPredict(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if got["success"] != true {
		t.Fatalf("expected success true, got %v", got["success"])
	}
	data, ok := got["data"].(map[string]any)
	if !ok || data["prompt"] == "" {
		t.Fatalf("expected non-empty prompt in data, got %v", got["data"])
	}
	if data["warning"] == "" {
		t.Fatalf("expected warning message, got empty")
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
