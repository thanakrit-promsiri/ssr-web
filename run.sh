#!/usr/bin/env bash
set -euo pipefail

# ย้ายมายังโฟลเดอร์ของโปรเจกต์เสมอไม่ว่าจะเรียกสคริปต์จากที่ไหน
cd "$(dirname "$0")"

APP_NAME="ssr-web"
MAIN_PKG="./cmd/server"

MODE="${1:-run}"

case "$MODE" in
  dev)
    echo "🔧 กำลังรันในโหมดพัฒนา (go run)..."
    go run "$MAIN_PKG"
    ;;
  build)
    echo "📦 กำลัง Build Binary สำหรับ Linux ($APP_NAME)..."
    GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "$APP_NAME" "$MAIN_PKG"
    chmod +x "$APP_NAME"
    echo "✅ Build สำเร็จ: ./$APP_NAME"
    ;;
  bench|test)
    echo "⚡ กำลังรัน Unit Tests และ Parallel Load Benchmark..."
    go test -v -bench=. -benchmem ./internal/handler
    ;;
  run|start)
    echo "📦 กำลัง Build และรัน $APP_NAME..."
    go build -ldflags="-s -w" -o "$APP_NAME" "$MAIN_PKG"
    chmod +x "$APP_NAME"
    exec "./$APP_NAME"
    ;;
  *)
    echo "วิธีใช้งาน: ./run.sh [run|dev|build|bench]"
    echo "  ./run.sh        - Build เป็น Binary (./ssr-web) แล้วรันทันที (ค่าเริ่มต้น)"
    echo "  ./run.sh dev    - รันด้วยคำสั่ง go run ./cmd/server"
    echo "  ./run.sh build  - Build เฉพาะไฟล์ Binary (./ssr-web) โดยไม่รัน"
    echo "  ./run.sh bench  - รัน Unit Tests และ Load Benchmark (go test -bench)"
    exit 1
    ;;
esac
