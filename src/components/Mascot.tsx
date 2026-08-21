import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, {
  Path,
  Circle,
  G,
  Ellipse,
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { COLORS } from '../utils/constants';

/**
 * "น้องหมุด" — มาสคอตของ Pakmut Wealth
 *
 * ทำไมเป็นรูปหมุด: ชื่อแบรนด์คือ "ปักหมุด" ตัวการ์ตูนจึงเป็นหมุดปักแผนที่ที่มีหน้า
 * ไม่ใช่กระปุกออมสิน/กระทิงที่แอปการเงินใช้กันจนไม่เหลือความเป็นตัวเอง
 *
 * ทำไมวาดเป็น SVG ไม่ใช่ไฟล์ภาพ: แอปนี้ไม่มี asset pipeline (กราฟทั้งสองใบก็วาดเอง ดู §7.3)
 * สีมาจาก COLORS ตัวเดียวกับทั้งแอป · ย่อขยายได้ไม่แตก · ไม่มี network request
 *
 * ⚠️ ห้ามใส่ <Text> ของ SVG ลงในนี้ — ฟอนต์ไทยที่โหลดผ่าน expo-font ไม่ถูกใช้กับ SVG text
 * บนเว็บ ตัวหนังสือจะกลายเป็นฟอนต์ระบบ (ญาติของกฎ §1.2) ทุกอย่างในนี้จึงเป็นรูปทรงล้วน
 *
 * ── สองแกน (เปลี่ยนกติกา 2026-08-20 ตามที่เจ้าของเลือก) ──
 *   `stage` = "มาไกลแค่ไหนแล้ว" → คุม **สีตัว · ขนาด · แขน · ของประดับ** (การเติบโต)
 *   `state` = "ตอนนี้เป็นยังไง" → คุม **หน้า** กับ **สีของของประกอบรอบตัว**
 *                                  (คลื่นสัญญาณของ alert · ประกายของ cheer · ฟองของ sleep)
 *
 * เดิมสีตัวเป็นของอารมณ์ พอย้ายไปเป็นของขั้น สัญญาณสถานะจึงต้องมีที่ยืนใหม่ — จึงย้ายไป
 * อยู่ที่ของประกอบรอบตัว (alert = คลื่นแดง · cheer = ประกายเขียว) บวกกับหน้าที่แยกกันได้อยู่แล้ว
 * โดยไม่ต้องพึ่งสี (ตากลม/ตาหยี/ตาปิดโค้ง/ตาเบิก+ปากกลม/คิ้วห่วง)
 * ⚠️ ผลข้างเคียงที่ต้องรู้: จอว่าง (`sleep`) ไม่ใช่สีเทาอีกแล้ว มันจะเป็นสีของขั้นปัจจุบัน
 *
 * ── สัดส่วน "น่ารัก" (baby schema) ──
 * วงหน้าใหญ่ (r18 ในหัว r24.5) · ตาโต (r3.9) และ **อยู่ต่ำกว่ากลางวงหน้า** ·
 * **ไฮไลต์ในตาสองจุด** (ตัวที่ให้ผลมากที่สุด — เปลี่ยน "รูดำ" เป็น "ตาที่มีชีวิต") ·
 * แก้มชมพู + ปากเล็กและอยู่ต่ำ
 *
 * ── มิติ (ไม่ใช่แบนอีกแล้ว) ──
 * ไล่เฉดในตัว + ขอบเข้ม + ไล่เฉดในวงหน้า ทุกเฉด **ผสมจาก COLORS** ด้วย `shade()`
 * ไม่ได้เพิ่มสีใหม่เข้าระบบ
 *
 * ⚠️ ปลายหมุดต้องยาวถึง y66 เสมอ: แบบปลายทู่น่ารักกว่าตอนใหญ่ แต่พอย่อเหลือ 22px
 * เงามันกลายเป็นก้อนกลม อ่านไม่ออกว่าเป็นหมุด (favicon อยู่ที่ 16px)
 */
export type MascotState =
  /** ปกติ — ยิ้มเฉย ๆ ใช้เป็นค่าเริ่มต้น */
  | 'happy'
  /** ดีใจ — ปลดล็อกได้/ทำสำเร็จ มีประกายรอบตัว */
  | 'cheer'
  /** หลับ — ยังไม่มีของให้ทำ (สถานะว่าง) */
  | 'sleep'
  /** ตื่นตัว — มีสัญญาณให้ลงมือวันนี้ */
  | 'alert'
  /** เศร้า — ติดลบ/พลาดเป้า */
  | 'sad';

/**
 * ขั้นการเติบโต 1–5 — ค่าเริ่มต้นคือ 2 (ทรงมาตรฐาน)
 *
 * ⚠️ เกณฑ์เลื่อนขั้นต้องมาจากของที่ **ขึ้นอย่างเดียว** (เลเวลที่ผ่าน · รอบที่ปิด · ไม้ที่ลงสะสม)
 * ห้ามผูกกับมูลค่าพอร์ต — ตลาดลงทีน้องหมุดถูกลดขั้น = ลงโทษคนที่ทำถูกอยู่แล้ว
 * และผลักให้ขายตอนไม่ควรขาย
 */
export type MascotStage = 1 | 2 | 3 | 4 | 5;

/** ข้อความบอกสถานะให้ screen reader — จอไม่ได้พูดแทนรูปเสมอไป */
const LABELS: Record<MascotState, string> = {
  happy: 'น้องหมุดยิ้ม',
  cheer: 'น้องหมุดดีใจ',
  sleep: 'น้องหมุดหลับ',
  alert: 'น้องหมุดตื่นตัว',
  sad: 'น้องหมุดเศร้า',
};

/** สีตัวหมุดตามอารมณ์ — ชุดเดียวกับสีสถานะทั้งแอป ไม่มีสีนอก COLORS */
const TONES: Record<MascotState, string> = {
  happy: COLORS.primary,
  cheer: COLORS.success,
  sleep: COLORS.textSecondary,
  alert: COLORS.error,
  sad: COLORS.textSecondary,
};

/** ผสมสองสีเข้าด้วยกัน (t = 0..1) — ใช้ทำสีประจำขั้นจากสีที่มีอยู่แล้วใน COLORS */
const blend = (a: string, b: string, t: number): string => {
  const ah = a.replace('#', '');
  const bh = b.replace('#', '');
  let out = '#';
  for (let i = 0; i < 6; i += 2) {
    const x = parseInt(ah.slice(i, i + 2), 16);
    const y = parseInt(bh.slice(i, i + 2), 16);
    out += Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
};

/**
 * ผสมสีกับขาว/ดำเพื่อทำไฮไลต์กับเงา — เป็นทางเดียวที่ไฟล์นี้สร้างเฉดใหม่ได้
 * (t > 0 = สว่างขึ้น, t < 0 = เข้มขึ้น) ทุกเฉดจึงสืบมาจาก COLORS เสมอ
 */
const shade = (hex: string, t: number): string => {
  const h = hex.replace('#', '');
  const to = t >= 0 ? 255 : 0;
  const k = Math.abs(t);
  let out = '#';
  for (let i = 0; i < 6; i += 2) {
    const v = parseInt(h.slice(i, i + 2), 16);
    out += Math.round(v + (to - v) * k)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
};

// ── พิกัดกลางของทุกอารมณ์ ──
// viewBox เผื่อขอบไว้รอบตัว (-5 -7 74 82) เพราะขั้นสูง ๆ ตัวใหญ่ขึ้นและมีมงกุฎ/ออร่าโผล่พ้นหัว
const VIEW_BOX = '-5 -7 74 82';
const VIEW_RATIO = 74 / 82;
const BODY_D =
  'M32 66 C26 55 7.5 43.5 7.5 26.5 A24.5 24.5 0 1 1 56.5 26.5 C56.5 43.5 38 55 32 66 Z';
const FX = 32; // กลางหน้า
const FY = 25; // กลางวงหน้า
const FR = 18; // รัศมีวงหน้า
const EX = 7.1; // ตาห่างจากกลางเท่าไร
const EY = 26.5; // ความสูงของตา — ต่ำกว่ากลางวงหน้า คือหัวใจของความน่ารัก
const BX = 12; // แก้มห่างจากกลาง
const BY = 31.3;

/**
 * ขั้นไหนได้อะไร — โตขึ้น = ตัวใหญ่ขึ้น · สีเข้ม/เปลี่ยนสี · มีแขน · ได้ของประดับทีละชิ้น
 *
 * `body` เป็นฟังก์ชันเพราะสีทุกตัวต้องคำนวณจาก COLORS ตอนรัน ไม่ใช่ hex ที่พิมพ์ทิ้งไว้
 * ขั้น 5 ตัวเป็นสีทอง ของประดับจึงต้องสลับไปใช้ทองเข้ม (`accentText`) ไม่งั้นจมหายไปกับตัว
 */
const STAGES: Record<
  MascotStage,
  {
    scale: number;
    body: () => string;
    deco: () => string;
    arms: boolean;
    ring: boolean;
    crown: boolean;
    aura: boolean;
  }
> = {
  1: {
    scale: 0.8,
    body: () => shade(COLORS.primary, 0.26),
    deco: () => COLORS.accent,
    arms: false, ring: false, crown: false, aura: false,
  },
  2: {
    scale: 0.92,
    body: () => COLORS.primary,
    deco: () => COLORS.accent,
    arms: true, ring: false, crown: false, aura: false,
  },
  3: {
    scale: 1.0,
    body: () => COLORS.primary,
    deco: () => COLORS.accent,
    arms: true, ring: true, crown: false, aura: false,
  },
  4: {
    scale: 1.06,
    body: () => blend(COLORS.primary, COLORS.success, 0.42),
    deco: () => COLORS.accent,
    arms: true, ring: true, crown: true, aura: false,
  },
  5: {
    scale: 1.12,
    body: () => COLORS.accent,
    deco: () => COLORS.accentText,
    arms: true, ring: true, crown: true, aura: true,
  },
};

/** แก้มชมพู — ใช้ COLORS.error จาง ๆ ไม่ใช่สีชมพูตัวใหม่ */
const Blush: React.FC<{ opacity?: number }> = ({ opacity = 0.32 }) => (
  <G>
    <Ellipse cx={FX - BX} cy={BY} rx={3.5} ry={2.2} fill={COLORS.error} opacity={opacity} />
    <Ellipse cx={FX + BX} cy={BY} rx={3.5} ry={2.2} fill={COLORS.error} opacity={opacity} />
  </G>
);

/** ตากลม + ไฮไลต์สองจุด — จุดใหญ่บน จุดเล็กล่าง คือสิ่งที่ทำให้ตา "แวว" ห้ามตัดออก */
const RoundEyes: React.FC<{ r?: number; ink: string; face: string }> = ({
  r = 3.9,
  ink,
  face,
}) => (
  <G>
    {[-1, 1].map((s) => (
      <G key={s}>
        <Circle cx={FX + s * EX} cy={EY} r={r} fill={ink} />
        <Circle cx={FX + s * EX + r * 0.33} cy={EY - r * 0.38} r={r * 0.38} fill={face} />
        <Circle
          cx={FX + s * EX - r * 0.36}
          cy={EY + r * 0.34}
          r={r * 0.19}
          fill={face}
          opacity={0.75}
        />
      </G>
    ))}
  </G>
);

/** ตาโค้ง: up = ^ ^ (ดีใจ) · ไม่ up = โค้งลง (หลับ) */
const ArcEyes: React.FC<{ up: boolean; ink: string; w?: number; h?: number; sw?: number }> = ({
  up,
  ink,
  w = 3.4,
  h = 3.2,
  sw = 2.4,
}) => (
  <G>
    {[-1, 1].map((s) => {
      const cx = FX + s * EX;
      const y0 = EY + (up ? 1.2 : -1);
      const y1 = up ? EY - h : EY + h;
      return (
        <Path
          key={s}
          d={`M${cx - w} ${y0} Q${cx} ${y1} ${cx + w} ${y0}`}
          stroke={ink}
          strokeWidth={sw}
          strokeLinecap="round"
          fill="none"
        />
      );
    })}
  </G>
);

/** แขนสั้นป้อมปลายมือกลม — ต้องยื่นพ้นเงาตัว ไม่งั้นอ่านเป็นปุ่มข้างตัว */
const Arms: React.FC<{ color: string }> = ({ color }) => (
  <G>
    {[-1, 1].map((s) => (
      <G key={s}>
        <Path
          d={`M${32 + s * 18} 36 Q${32 + s * 26} 34.5 ${32 + s * 27.5} 41.5`}
          stroke={color}
          strokeWidth={3.6}
          strokeLinecap="round"
          fill="none"
        />
        <Circle cx={32 + s * 27.5} cy={41.5} r={3.3} fill={color} />
      </G>
    ))}
  </G>
);

export const Mascot: React.FC<{
  state?: MascotState;
  /** ขั้นการเติบโต 1–5 (ค่าเริ่มต้น 2) — คุมรูปทรง ไม่คุมสี */
  stage?: MascotStage;
  /** ความสูงเป็น px — กว้างคิดตามอัตราส่วนของ viewBox ให้เอง */
  size?: number;
  /** ทับสีตัวหมุด (ปกติมาจากอารมณ์) — ใช้ตอนวางบนพื้นเข้ม เช่นหัวพอร์ต */
  tone?: string;
  style?: StyleProp<ViewStyle>;
}> = ({ state = 'happy', stage = 2, size = 72, tone, style }) => {
  // id ของ gradient ต้องไม่ซ้ำกันข้าม instance — บนเว็บทุกตัวอยู่ใน document เดียวกัน
  // ถ้าใช้ id คงที่ มาสคอตตัวที่สองจะไปดูด gradient ของตัวแรก (สีเพี้ยนทั้งจอ)
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const cfg = STAGES[stage] ?? STAGES[2];
  // สีตัว = ขั้น (ทับได้ด้วย tone ตอนวางบนพื้นเข้ม) · สีของประกอบรอบตัว = อารมณ์
  const base = tone || cfg.body();
  const accent = TONES[state];
  const face = COLORS.surface;
  const ink = COLORS.text;
  const rim = shade(base, -0.3);
  const limb = shade(base, -0.2);
  const gold = cfg.deco();
  const width = Math.round(size * VIEW_RATIO);

  return (
    <View style={style} accessibilityRole="image" accessibilityLabel={LABELS[state]}>
      <Svg width={width} height={size} viewBox={VIEW_BOX}>
        <Defs>
          {/* ไล่เฉดในตัว: สว่างบนซ้าย เข้มล่างขวา — ตัวเลยอ่านเป็นทรงกลม ไม่ใช่แผ่นแบน */}
          <RadialGradient id={`b${uid}`} cx="38%" cy="28%" r="78%">
            <Stop offset="0" stopColor={shade(base, 0.3)} />
            <Stop offset="1" stopColor={shade(base, -0.22)} />
          </RadialGradient>
          <LinearGradient id={`f${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="1" stopColor="#EEF2F8" />
          </LinearGradient>
        </Defs>

        {/* เงาใต้ตัว — ทำให้หมุดดู "ปัก" อยู่กับพื้น ไม่ใช่ลอย (อยู่นอกกลุ่มที่ย่อขยาย) */}
        <Ellipse cx={32} cy={69} rx={13 * cfg.scale} ry={3} fill={ink} opacity={0.12} />

        {/* ทั้งตัวย่อขยายรอบ "จุดที่ปักลงพื้น" (32,68) ปลายหมุดจึงอยู่ที่เดิมทุกขั้น */}
        <G scale={cfg.scale} originX={32} originY={68}>
          {/* ออร่าของขั้นสูงสุด — ต้องวาดก่อนตัว ไม่งั้นทับหน้า */}
          {cfg.aura && <Circle cx={32} cy={26.5} r={25} fill={gold} opacity={0.14} />}

          <Path d={BODY_D} fill={`url(#b${uid})`} stroke={rim} strokeWidth={1.1} />
          {cfg.arms && <Arms color={limb} />}

          <Circle cx={FX} cy={FY} r={FR} fill={`url(#f${uid})`} />

          {state === 'happy' && (
            <G>
              <Blush />
              <RoundEyes ink={ink} face={face} />
              <Path
                d="M29.3 32.9 Q32 36 34.7 32.9"
                stroke={ink}
                strokeWidth={2}
                strokeLinecap="round"
                fill="none"
              />
            </G>
          )}

          {state === 'cheer' && (
            <G>
              <Blush opacity={0.42} />
              {/* ตาหยี ^ ^ — บอกความดีใจได้โดยไม่ต้องพึ่งสี */}
              <ArcEyes up ink={ink} />
              <Path d="M28.6 32.2 Q32 37 35.4 32.2 Z" fill={ink} />
              {/* ประกายรอบตัว — ต้องอยู่นอกวงหัวและต้องเป็น "จุด"
                  ลองเป็นขีดเฉียงแล้วมันอ่านเป็นหนวด/เขาที่งอกจากหัว */}
              <Circle cx="7.5" cy="13" r="2.2" fill={accent} />
              <Circle cx="56.5" cy="13" r="2.2" fill={accent} />
              <Circle cx="3.2" cy="25" r="1.4" fill={accent} opacity={0.7} />
              <Circle cx="60.8" cy="25" r="1.4" fill={accent} opacity={0.7} />
            </G>
          )}

          {state === 'sleep' && (
            <G>
              <Blush opacity={0.22} />
              {/* ตาปิดโค้งลง — ขีดตรงอ่านเป็น "หลับตาแข็ง" ส่วนโค้งอ่านเป็นหลับสบาย */}
              <ArcEyes up={false} ink={ink} h={2.8} sw={2.2} />
              <Path
                d="M30 33 Q32 34.8 34 33"
                stroke={ink}
                strokeWidth={1.9}
                strokeLinecap="round"
                fill="none"
              />
              {/* ฟองลมหายใจ — แทน "zzz" ที่เขียนเป็นตัวอักษรไม่ได้ ต้องพ้นวงหัว */}
              <Circle cx="52.5" cy="8.5" r="1.8" fill={accent} opacity={0.55} />
              <Circle cx="58" cy="3.6" r="2.6" fill={accent} opacity={0.35} />
            </G>
          )}

          {state === 'alert' && (
            <G>
              <Blush />
              {/* ตาเบิก + ปากกลม — ต้องต่างจาก happy ให้ออกตั้งแต่ตอนย่อเหลือ 40px */}
              <RoundEyes r={4.5} ink={ink} face={face} />
              <Ellipse cx="32" cy="33.4" rx={2.4} ry={2.8} fill={ink} />
              <Path d="M3 20 Q0 26.5 3 33" stroke={accent} strokeWidth={2.6} strokeLinecap="round" fill="none" />
              <Path d="M61 20 Q64 26.5 61 33" stroke={accent} strokeWidth={2.6} strokeLinecap="round" fill="none" />
            </G>
          )}

          {state === 'sad' && (
            <G>
              <Blush />
              <RoundEyes ink={ink} face={face} />
              {/* คิ้วห่วง: ปลายด้าน "ใน" ต้องยกขึ้น — เอียงกลับด้านจะกลายเป็นหน้าโกรธทันที */}
              <Path d="M20.6 20.6 Q24.9 18.6 28.6 20.9" stroke={ink} strokeWidth={1.8}
                strokeLinecap="round" fill="none" />
              <Path d="M43.4 20.6 Q39.1 18.6 35.4 20.9" stroke={ink} strokeWidth={1.8}
                strokeLinecap="round" fill="none" />
              <Path d="M29.3 35 Q32 32 34.7 35" stroke={ink} strokeWidth={2}
                strokeLinecap="round" fill="none" />
            </G>
          )}

          {/* ── ของประดับของขั้น: วาดหลังหน้าเสมอ ── */}
          {cfg.ring && (
            <Circle cx={FX} cy={FY} r={FR + 1.6} fill="none" stroke={gold} strokeWidth={1.1} opacity={0.9} />
          )}
          {cfg.crown && (
            /* มงกุฎต้องคาบขอบหัว ไม่ใช่ลอยเหนือหัว ไม่งั้นอ่านเป็นหมวกที่หล่นไม่ลง */
            <Path
              d="M23.5 9.5 L25.5 3.2 L28.8 7 L32 1.6 L35.2 7 L38.5 3.2 L40.5 9.5 Z"
              fill={gold}
              stroke={shade(gold, -0.3)}
              strokeWidth={0.7}
              strokeLinejoin="round"
            />
          )}
          {cfg.aura && (
            <G>
              <Circle cx="11" cy="6" r="2" fill={gold} />
              <Circle cx="53" cy="6" r="2" fill={gold} />
            </G>
          )}
        </G>
      </Svg>
    </View>
  );
};

/**
 * จอว่างมาตรฐานของทั้งแอป: น้องหมุดหลับ + ข้อความอธิบาย จัดกึ่งกลาง
 *
 * มีตัวนี้เพราะทุกจอเคยเขียน `styles.emptyText` ของตัวเอง ขนาด/สี/ระยะไม่ตรงกันสักจอ
 * และจอว่างคือจอที่คนเห็นบ่อยที่สุดตอนเพิ่งเริ่มใช้แอป — มันคือหน้าตาแรกของแอป ไม่ใช่เศษที่เหลือ
 *
 * ใช้กับ "ทั้งจอ/ทั้งรายการยังไม่มีของ" เท่านั้น ห้ามใช้กับช่องว่างรายวัน/ผลของตัวกรอง
 * (เช่น "วันนี้ยังไม่มีรายจ่าย") — อันนั้นโผล่ทุกวันจนมาสคอตกลายเป็นสัญญาณรบกวน
 */
export const MascotEmpty: React.FC<{
  state?: MascotState;
  size?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}> = ({ state = 'sleep', size = 84, style, children }) => (
  <View style={[emptyStyles.box, style]}>
    <Mascot state={state} size={size} />
    <Text style={emptyStyles.text}>{children}</Text>
  </View>
);

const emptyStyles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  text: {
    fontSize: 12.5,
    fontFamily: 'NotoSansThai_300Light',
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 460,
  },
});
