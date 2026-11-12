package handler

import (
	"crypto/sha256"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	// heartbeatTTL กำหนดอายุของ Tab ฝั่ง Client ระหว่างที่เปิดหน้าใช้งานอยู่ (90 วินาที ต่ออายุทุก 30 วินาที)
	heartbeatTTL         = 90 * time.Second
	defaultTabSlot       = "_ssr"
	maxPresenceBodyBytes = 4096
	maxTrackedTabIDLen   = 64
	maxTabsPerSession    = 16
	pruneInterval        = 30 * time.Second
)

// activeSessionTracker เก็บสถานะผู้ใช้งานที่กำลังใช้งานระบบอยู่ในหน่วยความจำ (RAM Only)
// โดยแฮช auth_token ด้วย SHA-256 และแยกนับราย Tab เพื่อไม่เก็บข้อมูลส่วนตัวหรือ Token จริงไว้ในเซิร์ฟเวอร์
type activeSessionTracker struct {
	mu        sync.Mutex
	sessions  map[[32]byte]map[string]time.Time
	lastPrune time.Time
}

func newActiveSessionTracker() *activeSessionTracker {
	return &activeSessionTracker{
		sessions: make(map[[32]byte]map[string]time.Time),
	}
}

func hashSessionToken(token string) [32]byte {
	return sha256.Sum256([]byte(token))
}

func sanitizeTabID(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || len(trimmed) > maxTrackedTabIDLen {
		return ""
	}
	return sanitizeLogString(trimmed)
}

func (t *activeSessionTracker) pruneExpiredLocked(now time.Time) {
	for tokenHash, tabs := range t.sessions {
		for tabID, expiresAt := range tabs {
			if !expiresAt.After(now) {
				delete(tabs, tabID)
			}
		}
		if len(tabs) == 0 {
			delete(t.sessions, tokenHash)
		}
	}
	t.lastPrune = now
}

func (t *activeSessionTracker) Touch(token, tabID string, expiresAt, now time.Time) {
	if t == nil || token == "" || !expiresAt.After(now) {
		return
	}
	slot := sanitizeTabID(tabID)
	if slot == "" {
		slot = defaultTabSlot
	}
	digest := hashSessionToken(token)

	t.mu.Lock()
	defer t.mu.Unlock()

	if now.Sub(t.lastPrune) >= pruneInterval {
		t.pruneExpiredLocked(now)
	}

	tabs, exists := t.sessions[digest]
	if !exists {
		tabs = make(map[string]time.Time)
		t.sessions[digest] = tabs
	}
	// เมื่อ Tab จริงส่ง Heartbeat เข้ามา ให้ลบ Slot ชั่วคราว _ssr เพื่อให้อัปเดตเป็น 0 ทันทีเมื่อปิด Tab
	if slot != defaultTabSlot {
		delete(tabs, defaultTabSlot)
	}
	if _, alreadyTracked := tabs[slot]; !alreadyTracked && len(tabs) >= maxTabsPerSession {
		return
	}
	tabs[slot] = expiresAt
}

func (t *activeSessionTracker) HasToken(token string, now time.Time) bool {
	if t == nil || token == "" {
		return false
	}
	digest := hashSessionToken(token)

	t.mu.Lock()
	defer t.mu.Unlock()

	tabs, exists := t.sessions[digest]
	if !exists {
		return false
	}
	for tabID, expiresAt := range tabs {
		if !expiresAt.After(now) {
			delete(tabs, tabID)
		}
	}
	if len(tabs) == 0 {
		delete(t.sessions, digest)
		return false
	}
	return true
}

func (t *activeSessionTracker) RemoveTab(token, tabID string) {
	if t == nil || token == "" {
		return
	}
	slot := sanitizeTabID(tabID)
	if slot == "" {
		t.RemoveToken(token)
		return
	}
	digest := hashSessionToken(token)

	t.mu.Lock()
	defer t.mu.Unlock()

	if tabs, exists := t.sessions[digest]; exists {
		delete(tabs, slot)
		if len(tabs) == 0 {
			delete(t.sessions, digest)
		}
	}
}

func (t *activeSessionTracker) RemoveToken(token string) {
	if t == nil || token == "" {
		return
	}
	digest := hashSessionToken(token)

	t.mu.Lock()
	defer t.mu.Unlock()

	delete(t.sessions, digest)
}

func (t *activeSessionTracker) Count(now time.Time) int {
	if t == nil {
		return 0
	}
	t.mu.Lock()
	defer t.mu.Unlock()

	t.pruneExpiredLocked(now)
	return len(t.sessions)
}

type presencePayload struct {
	TabID string `json:"tab_id"`
	All   bool   `json:"all"`
}

func decodePresencePayload(w http.ResponseWriter, r *http.Request) presencePayload {
	var p presencePayload
	if r.Body == nil {
		return p
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxPresenceBodyBytes)
	_ = json.NewDecoder(r.Body).Decode(&p)
	_, _ = io.Copy(io.Discard, r.Body)
	return p
}

// HandleActiveUsers คืนค่าจำนวนผู้ใช้งานปัจจุบันที่กำลังใช้งานระบบอยู่ในขณะนี้
func (h *Handler) HandleActiveUsers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	setNoCacheHeaders(w)

	count := h.sessions.Count(time.Now())
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success":      true,
		"active_users": count,
	})
}

// HandleSessionHeartbeat ต่ออายุสถานะผู้ใช้งานออนไลน์จาก Tab ที่เปิดหน้า /chat.html หรือ /transit.html
func (h *Handler) HandleSessionHeartbeat(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	setNoCacheHeaders(w)

	cookie, err := r.Cookie("auth_token")
	if err != nil || cookie.Value == "" {
		clearSessionExpiryCookie(w)
		writeJSONError(w, http.StatusUnauthorized, map[string]any{
			"success": false,
			"message": "Unauthorized",
		})
		return
	}

	now := time.Now()
	hasExpiryCookie, sessionExp, expired := inspectSessionExpiryCookie(r, now)
	if expired {
		h.sessions.RemoveToken(cookie.Value)
		clearAuthCookie(w)
		writeJSONError(w, http.StatusUnauthorized, map[string]any{
			"success": false,
			"message": "เซสชันหมดอายุ (ครบ 30 นาที) กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
		})
		return
	}

	if !h.sessions.HasToken(cookie.Value, now) {
		status, verifyErr := h.verifyAuthToken(r.Context(), cookie)
		if verifyErr != nil || status != http.StatusOK {
			clearAuthCookie(w)
			writeJSONError(w, http.StatusUnauthorized, map[string]any{
				"success": false,
				"message": "Unauthorized",
			})
			return
		}
	}

	if !hasExpiryCookie {
		setSessionExpiryCookie(w, now)
		sessionExp = now.Add(sessionCookieTTL)
	}

	payload := decodePresencePayload(w, r)
	tabExpiresAt := now.Add(heartbeatTTL)
	if sessionExp.Before(tabExpiresAt) {
		tabExpiresAt = sessionExp
	}
	h.sessions.Touch(cookie.Value, payload.TabID, tabExpiresAt, now)

	_ = json.NewEncoder(w).Encode(map[string]any{
		"success":      true,
		"active_users": h.sessions.Count(now),
	})
}

// HandleSessionLeave ลบ Tab หรือ Session ปัจจุบันออกจากรายการผู้ใช้งานออนไลน์ทันทีเมื่อปิดหน้าหรือออกจากระบบ
func (h *Handler) HandleSessionLeave(w http.ResponseWriter, r *http.Request) {
	setNoCacheHeaders(w)

	cookie, err := r.Cookie("auth_token")
	if err != nil || cookie.Value == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	payload := decodePresencePayload(w, r)
	if payload.All || sanitizeTabID(payload.TabID) == "" {
		h.sessions.RemoveToken(cookie.Value)
	} else {
		h.sessions.RemoveTab(cookie.Value, payload.TabID)
	}

	w.WriteHeader(http.StatusNoContent)
}
