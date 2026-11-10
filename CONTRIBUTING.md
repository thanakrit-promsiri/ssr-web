# แนวทางการมีส่วนร่วมพัฒนา (Contributing Guide)

ขอบคุณที่ร่วมพัฒนาโปรเจกต์ **`ssr-web`** (บูมบามเอไอ พยากรณ์) เอกสารนี้ระบุแนวทางปฏิบัติและมาตรฐานของโค้ดเพื่อให้โครงสร้างโปรเจกต์มีความสะอาด ปลอดภัย และดูแลรักษาได้ง่าย

---

## 1. หลักการสถาปัตยกรรม (Clean Architecture & Guidelines)

1. **การแยกชั้นความรับผิดชอบ (Separation of Concerns)**:
   - **`cmd/server/main.go`**: เป็น Composition Root เท่านั้น ห้ามใส่ Business Logic
   - **`internal/handler/`**: แยกไฟล์ตามโดเมนหน้าที่อย่างชัดเจน (`handler.go` สำหรับ SSR/Static, `auth.go` สำหรับระบบสิทธิ์, `hora.go` สำหรับ BFF Proxy โหราศาสตร์)
   - **`web/` vs `public/`**:
     - โค้ด HTML, JS, Template และ JSON ต้องอยู่ใน `web/` เพื่อฝังเข้า Binary ผ่าน `embed.FS`
     - รูปภาพขนาดใหญ่และไอคอนต้องอยู่ใน `public/` บนดิสก์เท่านั้น
2. **การแยก View ออกจาก Logic (Frontend)**:
   - ห้ามเขียน Inline JavaScript ขนาดใหญ่ในไฟล์ `.html` ให้แยกไปไว้ใน `web/static/*.js`
   - โครงสร้าง HTML ที่สร้างแบบไดนามิกต้องแยกไว้ใน `<template>` (`*-template.html`) และโหลดผ่าน `DOMParser` + `document.importNode`
   - ฟังก์ชันกลางที่ใช้ร่วมกันหลายหน้าให้จัดเก็บไว้ใน `web/static/hora-common.js`
3. **ความปลอดภัยและระบบจัดเก็บข้อมูล (Zero-Persistence & DOM XSS)**:
   - ข้อมูลผู้ใช้และผลลัพธ์การทำนายต้องเก็บใน `sessionStorage` เท่านั้น ห้ามเก็บลง `localStorage`
   - ห้ามนำข้อมูลจาก `fetch()` ไปใส่ใน `innerHTML` โดยตรง ให้ใช้ `textContent` หรือ DOM Nodes เสมอ

---

## 2. ขั้นตอนการพัฒนาและส่ง Pull Request

1. สร้าง Branch ใหม่จาก `main`:
   ```bash
   git checkout -b feat/ชื่อฟีเจอร์ของคุณ
   ```
2. เมื่อแก้ไขไฟล์ในโฟลเดอร์ `web/` **ต้องสั่ง Build ใหม่เสมอ** เพื่อให้ `embed.FS` อัปเดตไฟล์ล่าสุดเข้าสู่ Binary:
   ```bash
   go build -o server.exe ./cmd/server
   ```
3. รันการตรวจสอบโค้ดและชุดทดสอบ Unit Tests ทั้งหมดก่อน Commit:
   ```bash
   go vet ./...
   go test -v ./...
   ```
4. ใช้รูปแบบข้อความ Commit ตามมาตรฐาน **Conventional Commits** เช่น:
   - `feat(transit): add monthly transit prediction for BE 2570`
   - `fix(birth): handle Buddhist calendar year from iOS date picker`
   - `refactor(handler): extract auth proxy handlers into auth.go`
