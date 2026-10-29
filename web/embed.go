package web

import "embed"

// Assets ฝังไฟล์หน้าเว็บ HTML และโฟลเดอร์ static ทั้งหมดเข้าสู่ Binary ของ Go
//
//go:embed index.html chat.html static
var Assets embed.FS
