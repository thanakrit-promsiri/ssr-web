# Project Context & Agent Guidelines: ssr-web

เอกสารนี้ระบุบริบท กฎเกณฑ์ และแนวทางปฏิบัติของโปรเจกต์ **ssr-web** เพื่อให้ AI Agent และนักพัฒนาเข้าใจและทำงานต่อได้อย่างถูกต้อง

> **หมายเหตุ**: รายละเอียดและไดอะแกรมทั้งหมดถูกรวบรวมไว้ที่ [.agents/rules/project-context.md](file:///.agents/rules/project-context.md)

---

## สรุปภาพรวมสถาปัตยกรรม (Architecture Summary)

- **ภาษาและรูปแบบ**: Go (Golang) โครงสร้างตาม **Standard Go Layout** (`cmd/`, `internal/`, `web/`, `public/`)
- **บทบาท**: ทำหน้าที่เป็น **BFF (Backend-For-Frontend)** และ **SSR Router Gateway**
- **พอร์ตและบริการภายนอก**:
  - `PORT`: ค่าเริ่มต้น `8081` (เสิร์ฟหน้าเว็บและ Proxy)
  - `AUTH_SERVICE_URL`: ค่าเริ่มต้น `http://localhost:8082` (ตรวจสอบ `auth_token` Cookie)
  - `HORA_SERVICE_URL`: ค่าเริ่มต้น `http://localhost:8083` (คำนวณโหราศาสตร์พระเวท `lahiri-api`)

---

## หลักการจัดการไฟล์ Static & ประสิทธิภาพ (Hybrid & Performance)

1. **`web/` (Embedded via `embed.FS`)**:
   - ไฟล์ HTML, JS, JSON ข้อมูลอำเภอ/จังหวัด ถูกฝังใน Binary ของ Go
   - เสิร์ฟผ่าน RAM รวดเร็วระดับไมโครวินาที
   - **ข้อควรจำ**: เมื่อแก้ไขไฟล์ในโฟลเดอร์นี้ ต้องรัน `./run.sh` หรือ `go build` เพื่อ Compile ใหม่เสมอ
2. **`public/` (Disk-Based via `http.Dir`)**:
   - เก็บไฟล์รูปภาพและ Favicon (`favicon.png`, `avatar.jpg`) บนดิสก์
   - ไม่ถูกฝังใน Binary เพื่อป้องกันขนาดไฟล์บวม และสามารถเปลี่ยนรูปได้ทันทีโดยไม่ต้อง Rebuild
3. **Zero-Dependency Markdown & Fast Rendering**:
   - ไม่โหลดไลบรารีภายนอกผ่าน CDN (เช่น `marked.js`) ใน `<head>` เพื่อป้องกันปัญหา Render-Blocking และ Network Latency
   - ใช้ Internal Markdown Renderer (`renderMarkdown()` ใน `web/static/hora-common.js`) ประมวลผลใน RAM ระดับไมโครวินาที รองรับทั้งหน้าดวงกำเนิดและหน้าทำนายดาวจร 12 เดือน

---

## กฎความปลอดภัยและความเป็นส่วนตัว (Privacy & Storage Rules)

1. **Session Storage Only (Zero-Persistence)**:
   - ข้อมูลวันเกิด (`user_birth_info`), ผลลัพธ์ตำแหน่งดาว (`user_hora_result`), ผลลัพธ์คำทำนาย (`user_predict_result`) และดวงจร 12 เดือน (`user_transit_2570`) จะต้องจัดเก็บใน `sessionStorage` เท่านั้น (ห้ามบันทึกถาวรลงฐานข้อมูลหรือ `localStorage`)
   - เมื่อผู้ใช้ปิดแท็บหรือเบราว์เซอร์ ข้อมูลส่วนตัวจะถูกล้างทิ้งอัตโนมัติ
2. **Locking State**:
   - เมื่อคำนวณตำแหน่งดาวและแสดงผลสำเร็จ: ซ่อนปุ่มแก้ไขข้อมูลวันเกิด
   - เมื่อพยากรณ์พื้นดวงชะตาสำเร็จ (`data.prediction` สำเร็จและบันทึกลง `sessionStorage` แล้ว): **ซ่อนปุ่มทำนายดวงชะตา (AI Predict) ทันที** เพื่อป้องกันการส่งคำขอทำนายซ้ำซ้อน
   - เมื่อพยากรณ์ดวงจรเดือนใดสำเร็จแล้ว: ซ่อนปุ่มของเดือนนั้น และเปิดแสดงเฉพาะปุ่มของเดือนถัดไปตามลำดับ
3. **DOM XSS & DoS Prevention (SonarCloud Compliance)**:
   - ห้ามนำ HTML ที่โหลดจาก `fetch()` มาใส่ `innerHTML` โดยตรง ให้ใช้ `DOMParser` ร่วมกับ `replaceChildren` และ `document.importNode` เสมอ
   - การเติมข้อมูลลงใน `<template>` ให้ใช้ `textContent` ผ่าน helper เช่น `fillFields()`
   - ครอบ `http.MaxBytesReader` จำกัดขนาด Request Body ไว้ที่ 1 MB บนทุก Endpoint ของ `/hora/*` เพื่อป้องกัน Denial of Service (OOM)
   - ฟังก์ชัน Log ทุกจุดต้องผ่าน `sanitizeLogString()` เพื่อตัดอักขระ `\r\n` ป้องกัน Log Injection (CWE-117)

---

## API Proxy Endpoints & การจัดการผลลัพธ์

- `POST /hora/calculate` และ `POST /api/v1/hora/calculate`: Proxy คำนวณสมผุสดาวและนักษัตร
- `POST /hora/dasha` และ `POST /api/v1/hora/dasha`: Proxy คำนวณวิมโสตรีทศา
- `POST /hora/predict` และ `POST /api/v1/hora/predict`: Proxy คำนวณข้อมูลพื้นดวงและทำนายด้วย AI
  - **กรณี AI สำเร็จ (`data.prediction` มีข้อความ)**: แสดงคำพยากรณ์จัดรูปเล่มสวยงาม พร้อมปุ่มคัดลอกคำทำนาย แสดง Prompt ด้านล่าง และซ่อนปุ่มทำนายทันที
  - **กรณี AI ไม่พร้อมใช้งาน (`data.prediction: ""` หรือมี `warning`)**: แสดง Warning Banner ชัดเจน แสดง Prompt สำหรับนำไปผูกดวง และคงปุ่มให้สามารถกดลองใหม่ได้
- `POST /hora/{transitEndpoint}` และ `POST /api/v1/hora/{transitEndpoint}`: Proxy คำนวณดาวจรและพยากรณ์ดวงชะตารายเดือนปี 2570 (`transitpredict_1` ถึง `transitpredict_12`)
- `GET /transit.html`: หน้าพยากรณ์ดวงชะตารายเดือน พ.ศ. 2570 (ตรวจสอบสิทธิ์ `auth_token` และเงื่อนไขข้อมูล 4 ตัวก่อนเข้าใช้งาน)

---

## Nginx Upstream Configuration (ข้อกำหนดสำหรับ Windows)

- **ห้ามใช้ `localhost` ใน Nginx บน Windows**:
  - การใช้ `proxy_pass http://localhost:8081/;` จะทำให้ Nginx พยายามเชื่อมต่อไปยัง IPv6 `[::1]:8081` ก่อนเสมอ ซึ่งจะติด TCP Timeout (Error 10060: `WSAETIMEDOUT`) นานถึง 21 วินาทีต่อ Request
- **ข้อบังคับ**: ต้องระบุเป็น IPv4 โดยตรงเสมอ เช่น:
  ```nginx
  proxy_pass http://127.0.0.1:8081/;
  proxy_pass http://127.0.0.1:8082/api/;
  ```

---

## ระบบ Daily Log Rotation (`internal/logger`)

- หมุนไฟล์ Log อัตโนมัติทุกวันลงในโฟลเดอร์ `logs/app-YYYY-MM-DD.log`
- **Dual Output**: ข้อความ Log แสดงออกทั้งหน้าจอ Console และเขียนลงไฟล์ประจำวันพร้อมกัน (`io.MultiWriter`)
- **Auto-Cleanup**: ตรวจสอบและลบไฟล์ Log เก่าที่เกิน **7 วัน** ทิ้งอัตโนมัติในพื้นหลัง (Background Goroutine)

---

## คำสั่งสำคัญสำหรับรันและทดสอบ

```bash
# รันเซิร์ฟเวอร์แบบ Production Binary (WSL / Linux)
./run.sh

# รันในโหมด Development (go run)
./run.sh dev

# Build Binary สำหรับ Windows
go build -o server.exe ./cmd/server

# รัน Unit Tests ทั้งหมด
go test -v ./...

# รัน Parallel Load Benchmark
./run.sh bench
```

อ่านรายละเอียดโครงสร้างไฟล์ ลอจิก API และ Workflow เพิ่มเติมได้ที่ [.agents/rules/project-context.md](file:///.agents/rules/project-context.md)
