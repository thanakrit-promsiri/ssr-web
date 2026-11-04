# Project Context & Agent Guidelines: ssr-web

เอกสารนี้ระบุบริบท กฎเกณฑ์ และแนวทางปฏิบัติของโปรเจกต์ **ssr-web** เพื่อให้ AI Agent และนักพัฒนาสามารถเข้าใจและทำงานต่อได้อย่างถูกต้อง

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

## หลักการจัดการไฟล์ Static (Hybrid Model)

1. **`web/` (Embedded via `embed.FS`)**:
   - ไฟล์ HTML, JS, JSON ข้อมูลอำเภอ/จังหวัด ถูกฝังใน Binary ของ Go
   - เสิร์ฟผ่าน RAM รวดเร็วระดับไมโครวินาที
   - **ข้อควรจำ**: เมื่อแก้ไขไฟล์ในโฟลเดอร์นี้ ต้องรัน `./run.sh` เพื่อ Compile ใหม่เสมอ
2. **`public/` (Disk-Based via `http.Dir`)**:
   - เก็บไฟล์รูปภาพและ Favicon (`favicon.png`, `avatar.jpg`)
   - ไม่ถูกฝังใน Binary เพื่อป้องกันขนาดไฟล์บวม และสามารถเปลี่ยนรูปได้ทันทีโดยไม่ต้อง Rebuild

---

## กฎความปลอดภัยและความเป็นส่วนตัว (Privacy & Storage Rules)

1. **Session Storage Only**:
   - ข้อมูลวันเกิด (`user_birth_info`) และผลลัพธ์ตำแหน่งดาว (`user_hora_result`) จะต้องจัดเก็บใน `sessionStorage` เท่านั้น (ห้ามบันทึกถาวรลงฐานข้อมูลหรือ `localStorage`)
   - เมื่อผู้ใช้ปิดแท็บหรือเบราว์เซอร์ ข้อมูลส่วนตัวจะถูกล้างทิ้งอัตโนมัติ
2. **Locking State**:
   - เมื่อคำนวณตำแหน่งดาวและแสดงผลสำเร็จแล้ว ระบบจะซ่อนปุ่มและป้องกันไม่ให้แก้ไขข้อมูลวันเกิดซ้ำจนกว่าจะออกจากระบบ

---

## คำสั่งสำคัญสำหรับรันและทดสอบ (WSL / Ubuntu)

```bash
# รันเซิร์ฟเวอร์แบบ Production Binary
./run.sh

# รันในโหมด Development (go run)
./run.sh dev

# รัน Unit Tests และ Parallel Load Benchmark
./run.sh bench
```

อ่านรายละเอียดโครงสร้างไฟล์ ลอจิก API และ Workflow เพิ่มเติมได้ที่ [.agents/rules/project-context.md](file:///.agents/rules/project-context.md)
