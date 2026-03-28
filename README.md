# 💰 Wealth Lab - ระบบจัดการการเงินส่วนตัว

แอปพลิเคชันมือถือสำหรับติดตามค่าใช้จ่ายรายวัน จัดการบิลประจำเดือน และวิเคราะห์พฤติกรรมการใช้เงิน พัฒนาด้วย React Native + Expo + TypeScript

## ✨ ฟีเจอร์หลัก

- 📝 **บันทึกรายจ่ายรายวัน** - จดบันทึกค่าใช้จ่ายพร้อมหมวดหมู่และรายละเอียด
- 💳 **จัดการค่าใช้จ่ายประจำ** - ตั้งค่าบิลรายเดือนที่ต้องจ่ายประจำ
- 📊 **สรุปรายงาน** - ดูยอดรวมรายวันและรายเดือน
- 💾 **เก็บข้อมูลในเครื่อง** - ไม่ต้องใช้อินเทอร์เน็ต ข้อมูลปลอดภัย
- 🎨 **UI สวยงามใช้งานง่าย** - ออกแบบเพื่อประสบการณ์ที่ดีที่สุด

## 🛠️ เทคโนโลยีที่ใช้

- **React Native** - Framework สำหรับพัฒนาแอปมือถือ Cross-platform
- **Expo** - เครื่องมือที่ช่วยให้พัฒนาและ deploy ได้รวดเร็ว
- **TypeScript** - เพิ่มความปลอดภัยและ maintainability ของโค้ด
- **React Navigation** - การนำทางระหว่างหน้าจอ
- **Supabase** - Backend as a Service สำหรับจัดเก็บข้อมูล
- **AsyncStorage** - จัดเก็บข้อมูล offline ในเครื่อง

## 📦 การติดตั้ง

### ข้อกำหนดเบื้องต้น

- Node.js (แนะนำเวอร์ชัน 20.16.0 ขึ้นไป)
- npm หรือ yarn
- แอป Expo Go บนมือถือ (ดาวน์โหลดจาก App Store หรือ Google Play)

### ขั้นตอนการติดตั้ง
```bash
git clone https://github.com/thehearttoona/wealth-lab.git
cd wealth-lab
npm install
```

### ตั้งค่า Environment Variables
```bash
cp .env.example .env
# แก้ไขค่าใน .env ให้ตรงกับ config ของคุณ
```

## 🚀 วิธีใช้งาน

### รันบนมือถือด้วย Expo Go
```bash
npm start
```

สแกน QR Code ที่ปรากฏด้วยแอป Expo Go:
- **iOS**: เปิดแอป Camera สแกน QR Code
- **Android**: เปิดแอป Expo Go และกด "Scan QR code"

### รันบน Emulator / Simulator
```bash
npm run android   # Android
npm run ios       # iOS (เฉพาะ macOS)
npm run web       # Web Browser
```

## 📱 วิธีใช้แอป

### เพิ่มรายจ่ายรายวัน

1. กดปุ่ม **"+ เพิ่มรายจ่ายวันนี้"** ที่หน้าหลัก
2. กรอกจำนวนเงิน และเลือกหมวดหมู่
3. กรอกรายละเอียด (ถ้ามี) แล้วกด **"บันทึก"**

### จัดการค่าใช้จ่ายประจำ

1. กดปุ่ม **"ค่าใช้จ่ายประจำ"** ที่หน้าหลัก
2. เพิ่มรายการพร้อมจำนวนเงิน หมวดหมู่ และวันที่ต้องจ่าย
3. ระบบจะคำนวณยอดรวมรายเดือนให้อัตโนมัติ

## 📂 โครงสร้างโปรเจค
```
wealth-lab/
├── src/
│   ├── navigation/       # React Navigation setup
│   ├── screens/          # หน้าจอต่างๆ
│   │   ├── HomeScreen.tsx
│   │   ├── AddExpenseScreen.tsx
│   │   └── RecurringBillsScreen.tsx
│   ├── services/         # Business logic และ API calls
│   │   └── storage.ts
│   ├── types/            # TypeScript type definitions
│   │   └── index.ts
│   └── utils/            # Utilities และ constants
│       └── constants.ts
├── supabase/             # Supabase configuration
├── assets/               # Images และ fonts
├── App.tsx               # Entry point
└── README.md
```

## 🎨 หมวดหมู่ค่าใช้จ่าย

🍜 อาหาร · 🚗 เดินทาง · 🛍️ ช้อปปิ้ง · 🎮 บันเทิง · 💊 สุขภาพ · 📚 การศึกษา · 🏠 ค่าเช่า · ⚡ ค่าน้ำค่าไฟ · 📦 อื่นๆ

## 🔒 ความปลอดภัยของข้อมูล

- ข้อมูลเก็บไว้ในเครื่องและ Supabase ที่เข้ารหัสแล้ว
- ไม่มีการส่งข้อมูลให้บุคคลที่สาม
- ไม่ต้องลงทะเบียนหรือสร้างบัญชีเพื่อใช้งานเบื้องต้น

## 📝 Roadmap

- [ ] กราฟแสดงสถิติรายเดือน
- [ ] Export ข้อมูลเป็น CSV
- [ ] หมวดหมู่แบบกำหนดเอง
- [ ] ระบบแจ้งเตือนก่อนครบกำหนดชำระ
- [ ] Dark Mode

## 🐛 Troubleshooting

**แอปไม่โหลดบนมือถือ** — ตรวจสอบว่ามือถือและคอมพิวเตอร์อยู่ใน Wi-Fi เดียวกัน หรือลอง `npm start -- --reset-cache`

## 📄 License

MIT License

## 👨‍💻 Developer

**Narin Srimongkhonthorn**
Full Stack Developer | React Native · Node.js · DevOps

- 🌐 Website: [devgenproject.com](https://devgenproject.com)
- 📧 Contact: [your@email.com]
- 💼 GitHub: [@thehearttoona](https://github.com/thehearttoona)
```

---

## สิ่งที่เปลี่ยนไป
```
✅ ชื่อจาก "Expense Tracker" → "Wealth Lab" ให้ตรงกับชื่อ repo
✅ ลบ "สร้างโดย GitHub Copilot" ออก → ใส่ชื่อคุณแทน
✅ เพิ่ม Supabase ใน Tech Stack (มีอยู่แล้วในโปรเจกต์)
✅ เพิ่ม git clone ในขั้นตอนติดตั้ง
✅ เพิ่ม .env.example step
✅ Profile section ท้าย README ดูเป็น professional
