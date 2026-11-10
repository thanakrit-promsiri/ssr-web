package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestNewDailyRotatingWriter(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "log_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	w, err := NewDailyRotatingWriter(tempDir, "testapp", 7)
	if err != nil {
		t.Fatalf("NewDailyRotatingWriter failed: %v", err)
	}
	defer w.Close()

	msg := "Hello Daily Log Rotation\n"
	n, err := w.Write([]byte(msg))
	if err != nil {
		t.Fatalf("Write failed: %v", err)
	}
	if n != len(msg) {
		t.Fatalf("expected written %d bytes, got %d", len(msg), n)
	}

	today := time.Now().Format("2006-01-02")
	expectedFile := filepath.Join(tempDir, fmt.Sprintf("testapp-%s.log", today))

	data, err := os.ReadFile(expectedFile)
	if err != nil {
		t.Fatalf("failed to read expected log file %s: %v", expectedFile, err)
	}
	if string(data) != msg {
		t.Fatalf("expected log content %q, got %q", msg, string(data))
	}
}

func TestDailyRotatingWriter_Rotation(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "log_test_rotation_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	w, err := NewDailyRotatingWriter(tempDir, "testapp", 7)
	if err != nil {
		t.Fatalf("NewDailyRotatingWriter failed: %v", err)
	}
	defer w.Close()

	// เขียน Log วันนี้
	today := time.Now()
	_, _ = w.writeAt([]byte("Day 1 Log\n"), today)

	// จำลองเวลาข้ามไปวันพรุ่งนี้
	tomorrow := today.AddDate(0, 0, 1)
	_, _ = w.writeAt([]byte("Day 2 Log\n"), tomorrow)

	day1File := filepath.Join(tempDir, fmt.Sprintf("testapp-%s.log", today.Format("2006-01-02")))
	day2File := filepath.Join(tempDir, fmt.Sprintf("testapp-%s.log", tomorrow.Format("2006-01-02")))

	day1Data, err := os.ReadFile(day1File)
	if err != nil {
		t.Fatalf("day 1 file read failed: %v", err)
	}
	if string(day1Data) != "Day 1 Log\n" {
		t.Fatalf("day 1 file content mismatch: expected %q, got %q", "Day 1 Log\n", string(day1Data))
	}

	day2Data, err := os.ReadFile(day2File)
	if err != nil || string(day2Data) != "Day 2 Log\n" {
		t.Fatalf("day 2 file check failed: %v", err)
	}
}

func TestDailyRotatingWriter_CleanupOldLogs(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "log_test_cleanup_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	now := time.Now()

	// สร้างไฟล์ log ย้อนหลัง 10 วัน, 8 วัน, และวันนี้
	oldFile10 := filepath.Join(tempDir, fmt.Sprintf("testapp-%s.log", now.AddDate(0, 0, -10).Format("2006-01-02")))
	oldFile8 := filepath.Join(tempDir, fmt.Sprintf("testapp-%s.log", now.AddDate(0, 0, -8).Format("2006-01-02")))
	recentFile := filepath.Join(tempDir, fmt.Sprintf("testapp-%s.log", now.AddDate(0, 0, -3).Format("2006-01-02")))

	_ = os.WriteFile(oldFile10, []byte("old10"), 0644)
	_ = os.WriteFile(oldFile8, []byte("old8"), 0644)
	_ = os.WriteFile(recentFile, []byte("recent"), 0644)

	w, err := NewDailyRotatingWriter(tempDir, "testapp", 7)
	if err != nil {
		t.Fatalf("NewDailyRotatingWriter failed: %v", err)
	}
	defer w.Close()

	w.cleanupOldLogs(now)

	// ไฟล์ 10 วัน และ 8 วันต้องถูกลบ
	if _, err := os.Stat(oldFile10); !os.IsNotExist(err) {
		t.Fatalf("expected oldFile10 to be deleted")
	}
	if _, err := os.Stat(oldFile8); !os.IsNotExist(err) {
		t.Fatalf("expected oldFile8 to be deleted")
	}

	// ไฟล์ 3 วันต้องยังอยู่
	if _, err := os.Stat(recentFile); err != nil {
		t.Fatalf("expected recentFile to exist, got %v", err)
	}
}

func TestDailyRotatingWriter_ConcurrentWrites(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "log_test_concurrent_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	w, err := NewDailyRotatingWriter(tempDir, "testapp", 7)
	if err != nil {
		t.Fatalf("NewDailyRotatingWriter failed: %v", err)
	}
	defer w.Close()

	var wg sync.WaitGroup
	workers := 10
	iterations := 50

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				_, _ = w.Write([]byte(fmt.Sprintf("worker %d line %d\n", id, j)))
			}
		}(i)
	}

	wg.Wait()

	today := time.Now().Format("2006-01-02")
	logFile := filepath.Join(tempDir, fmt.Sprintf("testapp-%s.log", today))
	info, err := os.Stat(logFile)
	if err != nil || info.Size() == 0 {
		t.Fatalf("expected non-empty log file, size: %v, err: %v", info.Size(), err)
	}
}

func TestInitDailyLogger_And_Defaults(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "log_test_init_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// ทดสอบค่า Default เมื่อส่ง prefix ว่าง และ maxAgeDays <= 0
	w, cleanup, err := InitDailyLogger(tempDir, "", 0)
	if err != nil {
		t.Fatalf("InitDailyLogger failed: %v", err)
	}
	if w.prefix != "app" || w.maxAgeDays != 7 {
		t.Fatalf("expected default prefix=app, maxAgeDays=7, got %s, %d", w.prefix, w.maxAgeDays)
	}
	cleanup()
	// เรียก Close ซ้ำเมื่อปิดไปแล้ว
	_ = w.Close()
}
