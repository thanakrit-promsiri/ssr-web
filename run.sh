#!/usr/bin/env bash
set -euo pipefail

# ย้ายมายังโฟลเดอร์ของโปรเจกต์เสมอไม่ว่าจะเรียกสคริปต์จากที่ไหน
cd "$(dirname "$0")"

APP_NAME="ssr-web"
WIN_BIN_NAME="server.exe"
MAIN_PKG="./cmd/server"
COVERAGE_FILE="coverage.out"
COVERAGE_HTML="coverage.html"
MIN_COVERAGE="${MIN_COVERAGE:-0}"

print_step() {
  printf "\n==========================================================\n"
  printf "%s\n" "$1"
  printf "==========================================================\n"
}

require_go() {
  if ! command -v go >/dev/null 2>&1; then
    echo "❌ ไม่พบคำสั่ง 'go' ใน PATH กรุณาติดตั้ง Go ก่อนใช้งาน" >&2
    exit 1
  fi
}

is_windows_env() {
  case "$(uname -s 2>/dev/null || echo unknown)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

detect_native_binary() {
  if is_windows_env; then
    echo "$WIN_BIN_NAME"
  else
    echo "$APP_NAME"
  fi
}

detect_race_flag() {
  if [[ "$(go env CGO_ENABLED 2>/dev/null || echo 0)" == "1" ]] && \
     (command -v gcc >/dev/null 2>&1 || command -v cc >/dev/null 2>&1 || command -v clang >/dev/null 2>&1); then
    echo "-race"
  else
    echo ""
  fi
}

verify_code() {
  print_step "🔍 [1/3] ตรวจสอบ Dependencies และ Static Analysis (go mod verify + go vet)"
  go mod verify
  go vet ./...
  echo "✅ ผ่านการตรวจสอบ go mod verify และ go vet เรียบร้อย"
}

run_tests_with_coverage() {
  print_step "🧪 [2/3] รัน Unit Tests ทั้งหมด พร้อมวัด Test Coverage"

  local race_flag
  race_flag="$(detect_race_flag)"

  if [[ -n "$race_flag" ]]; then
    echo "🛡️ เปิดใช้งาน Race Detector (-race)"
    go test -v -race -coverprofile="$COVERAGE_FILE" -covermode=atomic ./...
  else
    echo "ℹ️ ข้าม -race (CGO ปิดอยู่หรือไม่มี C Compiler ในสภาพแวดล้อมปัจจุบัน)"
    go test -v -coverprofile="$COVERAGE_FILE" -covermode=atomic ./...
  fi

  print_step "📊 สรุปผล Test Coverage ($COVERAGE_FILE)"
  go tool cover -func="$COVERAGE_FILE"

  local total_cov
  total_cov="$(go tool cover -func="$COVERAGE_FILE" | awk '/^total:/ {print $NF}')"
  echo ""
  echo "✅ Total Statement Coverage: ${total_cov:-N/A}"

  if [[ -n "$MIN_COVERAGE" ]] && [[ "$MIN_COVERAGE" != "0" ]] && [[ -n "${total_cov:-}" ]]; then
    local numeric_cov="${total_cov%%%}"
    if awk -v cov="$numeric_cov" -v min="$MIN_COVERAGE" 'BEGIN { exit !(cov + 0 < min + 0) }'; then
      echo "❌ Test Coverage (${total_cov}) ต่ำกว่าเกณฑ์ขั้นต่ำที่กำหนด (${MIN_COVERAGE}%)" >&2
      exit 1
    fi
    echo "✅ ผ่านเกณฑ์ Test Coverage ขั้นต่ำ (${MIN_COVERAGE}%)"
  fi
}

generate_coverage_html() {
  if [[ ! -f "$COVERAGE_FILE" ]]; then
    echo "❌ ไม่พบไฟล์ $COVERAGE_FILE กรุณารัน test ก่อน" >&2
    exit 1
  fi
  go tool cover -html="$COVERAGE_FILE" -o "$COVERAGE_HTML"
  echo "📄 สร้างรายงาน Coverage HTML สำเร็จ: ./$COVERAGE_HTML"
}

run_benchmarks() {
  print_step "⚡ รัน Parallel Load Benchmarks"
  go test -run='^$' -bench=. -benchmem ./...
}

build_for_target() {
  local target="${1:-linux}"
  print_step "📦 [3/3] Build Production Binary (target: $target)"

  case "$target" in
    linux)
      echo "🐧 กำลัง Build Binary สำหรับ Linux (amd64) -> ./$APP_NAME"
      GOOS=linux GOARCH=amd64 go build -v -ldflags="-s -w" -o "$APP_NAME" "$MAIN_PKG"
      chmod +x "$APP_NAME"
      echo "✅ Build สำเร็จ: ./$APP_NAME"
      ;;
    win|windows)
      echo "🪟 กำลัง Build Binary สำหรับ Windows (amd64) -> ./$WIN_BIN_NAME"
      GOOS=windows GOARCH=amd64 go build -v -ldflags="-s -w" -o "$WIN_BIN_NAME" "$MAIN_PKG"
      echo "✅ Build สำเร็จ: ./$WIN_BIN_NAME"
      ;;
    native)
      local out_bin
      out_bin="$(detect_native_binary)"
      echo "💻 กำลัง Build Binary สำหรับระบบปัจจุบัน -> ./$out_bin"
      go build -v -ldflags="-s -w" -o "$out_bin" "$MAIN_PKG"
      chmod +x "$out_bin" 2>/dev/null || true
      echo "✅ Build สำเร็จ: ./$out_bin"
      ;;
    all)
      echo "🌐 กำลัง Build Binary สำหรับทั้ง Linux และ Windows..."
      GOOS=linux GOARCH=amd64 go build -v -ldflags="-s -w" -o "$APP_NAME" "$MAIN_PKG"
      chmod +x "$APP_NAME"
      GOOS=windows GOARCH=amd64 go build -v -ldflags="-s -w" -o "$WIN_BIN_NAME" "$MAIN_PKG"
      echo "✅ Build สำเร็จทั้ง ./$APP_NAME และ ./$WIN_BIN_NAME"
      ;;
    *)
      echo "❌ ไม่รู้จัก Build Target '$target' (รองรับ: linux, win, native, all)" >&2
      exit 1
      ;;
  esac
}

warn_if_missing_env() {
  if [[ ! -f ".env" ]] && [[ -f ".env.example" ]]; then
    echo "ℹ️ ไม่พบไฟล์ .env (จะใช้ค่าเริ่มต้นของระบบ หรือสามารถคัดลอกจาก .env.example ได้)"
  fi
}

clean_artifacts() {
  print_step "🧹 ล้างไฟล์ Build และ Test Artifacts"
  rm -f "$APP_NAME" "$WIN_BIN_NAME" "$COVERAGE_FILE" "$COVERAGE_HTML"
  echo "✅ ล้างไฟล์เรียบร้อย"
}

show_help() {
  cat <<EOF
วิธีใช้งาน: ./run.sh [command]

คำสั่งที่รองรับ:
  ./run.sh [run|start]         - ตรวจสอบโค้ด -> รันเทส + Coverage -> Build -> รันเซิร์ฟเวอร์ (ค่าเริ่มต้น)
  ./run.sh build [target]      - ตรวจสอบโค้ด -> รันเทส + Coverage -> Build Binary
                                 target: linux (ค่าเริ่มต้น), win, native, all
  ./run.sh build-win           - ทางลัดสำหรับ ./run.sh build win (สร้าง server.exe)
  ./run.sh test | check        - ตรวจสอบโค้ด + รัน Unit Tests ทั้งหมด + แสดงผล Coverage
  ./run.sh cover | coverage    - รันเทส + Coverage + สร้างรายงาน HTML (coverage.html)
  ./run.sh bench               - ตรวจสอบโค้ด + รันเทส + Coverage + Parallel Load Benchmarks
  ./run.sh ci                  - รันขั้นตอนเหมือน CI ทั้งหมด (verify + vet + test + coverage HTML + build native)
  ./run.sh dev                 - ตรวจสอบ go vet แล้วรันด้วย go run ./cmd/server
  ./run.sh clean               - ลบไฟล์ Binary และรายงาน Coverage ชั่วคราว

ตัวแปรสภาพแวดล้อมเพิ่มเติม:
  MIN_COVERAGE=<เปอร์เซ็นต์>    - กำหนดเกณฑ์ขั้นต่ำของ Test Coverage (เช่น MIN_COVERAGE=80 ./run.sh test)
EOF
}

require_go

MODE="${1:-run}"

case "$MODE" in
  dev)
    print_step "🔧 โหมดพัฒนา (Development)"
    go mod verify
    go vet ./...
    warn_if_missing_env
    echo "🚀 กำลังรันเซิร์ฟเวอร์ด้วย go run $MAIN_PKG ..."
    exec go run "$MAIN_PKG"
    ;;
  test|check)
    verify_code
    run_tests_with_coverage
    ;;
  cover|coverage)
    verify_code
    run_tests_with_coverage
    generate_coverage_html
    ;;
  bench)
    verify_code
    run_tests_with_coverage
    run_benchmarks
    ;;
  build)
    TARGET="${2:-linux}"
    verify_code
    run_tests_with_coverage
    build_for_target "$TARGET"
    ;;
  build-win)
    verify_code
    run_tests_with_coverage
    build_for_target "win"
    ;;
  ci)
    verify_code
    run_tests_with_coverage
    generate_coverage_html
    build_for_target "native"
    ;;
  run|start)
    verify_code
    run_tests_with_coverage
    build_for_target "native"
    warn_if_missing_env
    RUN_BIN="$(detect_native_binary)"
    print_step "🚀 กำลังเริ่มทำงาน ./$RUN_BIN ..."
    exec "./$RUN_BIN"
    ;;
  clean)
    clean_artifacts
    ;;
  help|-h|--help)
    show_help
    ;;
  *)
    echo "❌ ไม่รู้จักคำสั่ง '$MODE'" >&2
    echo ""
    show_help
    exit 1
    ;;
esac
