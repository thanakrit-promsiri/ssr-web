package logger

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// DailyRotatingWriter จัดการการเขียน Log ลงไฟล์โดยหมุนไฟล์ใหม่ทุกวัน และลบไฟล์เก่าทิ้งอัตโนมัติ
type DailyRotatingWriter struct {
	mu         sync.Mutex
	logDir     string
	prefix     string
	maxAgeDays int
	currentDay string
	file       *os.File
	out        io.Writer
}

// NewDailyRotatingWriter สร้าง DailyRotatingWriter ใหม่ตามโฟลเดอร์ คำนำหน้า และจำนวนวันที่ต้องการเก็บ
func NewDailyRotatingWriter(logDir, prefix string, maxAgeDays int) (*DailyRotatingWriter, error) {
	if logDir == "" {
		logDir = "logs"
	}
	if prefix == "" {
		prefix = "app"
	}
	if maxAgeDays <= 0 {
		maxAgeDays = 7
	}

	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create log directory %s: %w", logDir, err)
	}

	w := &DailyRotatingWriter{
		logDir:     logDir,
		prefix:     prefix,
		maxAgeDays: maxAgeDays,
	}

	if err := w.rotateIfNeeded(time.Now()); err != nil {
		return nil, err
	}

	return w, nil
}

// Write เขียนข้อมูลลงทั้ง Console (os.Stdout) และไฟล์ Log ประจำวันแบบ Thread-safe
func (w *DailyRotatingWriter) Write(p []byte) (n int, err error) {
	return w.writeAt(p, time.Now())
}

// writeAt รองรับการระบุเวลาสำหรับการบันทึก log และการทดสอบ Rotation
func (w *DailyRotatingWriter) writeAt(p []byte, now time.Time) (n int, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if err := w.rotateIfNeeded(now); err != nil {
		// หาก rotate ล้มเหลว ยังคงพยายามส่งออกหน้าจอ Console
		_, _ = os.Stdout.Write(p)
		return 0, err
	}

	return w.out.Write(p)
}

// rotateIfNeeded ตรวจสอบและสลับไฟล์เมื่อขึ้นวันใหม่ (00:00)
func (w *DailyRotatingWriter) rotateIfNeeded(now time.Time) error {
	dayStr := now.Format("2006-01-02")
	if w.file != nil && w.currentDay == dayStr {
		return nil
	}

	if w.file != nil {
		_ = w.file.Close()
		w.file = nil
	}

	if err := os.MkdirAll(w.logDir, 0755); err != nil {
		return fmt.Errorf("failed to ensure log dir: %w", err)
	}

	filePath := filepath.Join(w.logDir, fmt.Sprintf("%s-%s.log", w.prefix, dayStr))
	f, err := os.OpenFile(filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("failed to open log file %s: %w", filePath, err)
	}

	w.file = f
	w.currentDay = dayStr
	w.out = io.MultiWriter(os.Stdout, f)

	// ลบไฟล์ Log เก่าที่เกินอายุแบบ Asynchronous เพื่อไม่ให้บล็อกการทำงานหลัก
	go w.cleanupOldLogs(now)

	return nil
}

// cleanupOldLogs ลบไฟล์ Log ที่มีอายุเกิน maxAgeDays
func (w *DailyRotatingWriter) cleanupOldLogs(now time.Time) {
	entries, err := os.ReadDir(w.logDir)
	if err != nil {
		return
	}

	cutoff := now.AddDate(0, 0, -w.maxAgeDays)
	prefixWithDash := w.prefix + "-"

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasPrefix(name, prefixWithDash) || !strings.HasSuffix(name, ".log") {
			continue
		}

		// ดึงวันที่จากชื่อไฟล์ เช่น "app-2026-11-06.log" -> "2026-11-06"
		datePart := strings.TrimPrefix(name, prefixWithDash)
		datePart = strings.TrimSuffix(datePart, ".log")

		fileDate, err := time.Parse("2006-01-02", datePart)
		if err != nil {
			continue
		}

		if fileDate.Before(cutoff) {
			_ = os.Remove(filepath.Join(w.logDir, name))
		}
	}
}

// Close ปิดไฟล์ Log ปัจจุบัน
func (w *DailyRotatingWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.file != nil {
		err := w.file.Close()
		w.file = nil
		return err
	}
	return nil
}

// InitDailyLogger ตั้งค่า Standard Logger ของ Go ให้หมุนไฟล์ตามวัน และส่งออกทั้ง Console และไฟล์
func InitDailyLogger(logDir, prefix string, maxAgeDays int) (*DailyRotatingWriter, func(), error) {
	writer, err := NewDailyRotatingWriter(logDir, prefix, maxAgeDays)
	if err != nil {
		return nil, func() {}, err
	}

	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)
	log.SetOutput(writer)

	cleanup := func() {
		_ = writer.Close()
	}

	return writer, cleanup, nil
}
