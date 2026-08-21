import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../utils/constants';
import { PlanStep, PlanTool, SAVE_TOOL_KIND_LABELS, SaveToolKind, TaxSavePlan } from '../utils/taxSavePlan';
import { taxStyles as styles } from './TaxFormKit';

/**
 * การ์ด "สูตรลดหย่อนให้ภาษีเป็น 0" บนหน้าค่าลดหย่อน
 *
 * เป็น **การจำลองอย่างเดียว** — ไม่เขียนยอดลง profile.deductions ไม่ว่ากรณีใด
 * ถ้าเติมยอดตามแผนลงช่องกรอกให้ ผู้ใช้จะกลายเป็นอ้างสิทธิ์ที่ยังไม่ได้จ่าย แล้วประมาณการภาษี
 * จะต่ำกว่าความจริง ซึ่งเป็นทิศทางที่ผิดที่สุดของหน้านี้ (ประมาณต่ำ = วันยื่นเงินไม่พอ)
 *
 * สามอย่างที่การ์ดนี้ต้องพูดให้ครบ ไม่ใช่แค่ "ต้องซื้ออีกเท่าไหร่":
 *   1. เงินที่ใส่ไปหายจากกระเป๋าหรือไม่ (กองทุน = ยังเป็นของเรา · เบี้ย/บริจาค = ไม่กลับมา)
 *   2. ประหยัดภาษีกี่ % ของเงินที่ใส่ — ขั้นท้าย ๆ ที่ลากลงมาถึง 0 ประหยัดแค่ 5%
 *   3. อายุ: RMF ขายได้ตอน 55 คนอายุ 52 กับคนอายุ 30 ไม่ควรได้คำแนะนำเดียวกัน
 */

const baht = (n: number): string => `฿${Math.round(n).toLocaleString('th-TH')}`;
const pct = (r: number): string => `${(r * 100).toFixed(r >= 0.1 ? 0 : 1)}%`;

const KIND_SEQUENCE: SaveToolKind[] = ['have', 'invest', 'insure', 'give'];

const lockText = (t: PlanTool): string =>
  t.lockYears == null ? '' : t.lockYears <= 0 ? ' · ถอนได้แล้ว' : ` · ถือ ${t.lockYears} ปี`;

const roomText = (t: PlanTool): string =>
  t.headroom == null
    ? 'ระบบไม่รู้เพดานของรายการนี้ — ต้องกรอกตามสิทธิ์จริง'
    : `ใส่เพิ่มได้อีก ${baht(t.headroom)}`;

const StepRow: React.FC<{ step: PlanStep; index: number }> = ({ step, index }) => (
  <View style={styles.planStepRow}>
    <Text style={styles.planStepIdx}>{index}</Text>
    <View style={styles.planStepMain}>
      <Text style={styles.planStepLabel}>
        {step.tool.item.label}
        {lockText(step.tool)}
      </Text>
      <Text style={styles.planStepReason}>{step.tool.reason}</Text>
    </View>
    <View style={styles.planStepRight}>
      <Text style={styles.planStepAmount}>{baht(step.amount)}</Text>
      {/* สองบรรทัดสั้น ๆ แทน "ลดภาษี ฿X\n(20% ของเงินที่ใส่)" ที่วงเล็บทำให้อ่านสะดุด */}
      <Text style={styles.planStepSaved}>
        ลดภาษี {baht(step.taxSaved)}{'\n'}คุ้ม {pct(step.savedPerBaht)}
      </Text>
    </View>
  </View>
);

const ToolRow: React.FC<{ tool: PlanTool }> = ({ tool }) => (
  <View style={styles.planStepRow}>
    <Ionicons name="ellipse-outline" size={13} color={COLORS.textSecondary} style={{ marginTop: 3 }} />
    <View style={styles.planStepMain}>
      <Text style={styles.planStepLabel}>
        {tool.item.label}
        {lockText(tool)}
      </Text>
      <Text style={styles.planStepReason}>{tool.reason}</Text>
      <Text style={styles.planStepReason}>{roomText(tool)}</Text>
    </View>
  </View>
);

const TaxSavePlanCard: React.FC<{
  plan: TaxSavePlan;
  /** บอกว่าเลขในแผนคิดจากฐานไหน (กรอกจริง/ประมาณทั้งปี) — null = กรอกครบ 12 เดือนแล้ว */
  basisNote: string | null;
  excluded: string[];
  onToggleTool: (key: string) => void;
}> = ({ plan, basisNote, excluded, onToggleTool }) => {
  const [open, setOpen] = useState(false);

  // ชิปปิด/เปิด: รวมทั้งที่แผนใช้และที่ยังเหลือสิทธิ์ (ที่กดปิดไว้จะไปอยู่ leftover)
  const chipTools: PlanTool[] = [];
  const seen = new Set<string>();
  [...plan.steps.map((s) => s.tool), ...plan.leftover].forEach((t) => {
    if (seen.has(t.item.key)) return;
    seen.add(t.item.key);
    chipTools.push(t);
  });

  const headline = !plan.hasIncome
    ? 'ยังไม่ได้กรอกเงินได้ของปีนี้'
    : plan.taxNow <= 0
      ? 'ปีนี้ภาษีเป็น 0 อยู่แล้ว'
      : plan.steps.length === 0
        ? `ภาษี ${baht(plan.taxNow)} — ยังไม่มีสิทธิ์ที่เหลือให้ใช้`
        : `${baht(plan.taxNow)} → ${baht(plan.taxAfter)}`;

  // สองบรรทัดสั้น ๆ แทนประโยคเดียวยาว ๆ ที่ต่อสตริงซ้อนวงเล็บ
  // (เดิม: "ต้องลดหย่อนเพิ่ม X · จ่ายเงินจริง Y (เงินยังเป็นของเรา Z · จ่ายทิ้ง W)" ยาว ~90 ตัวอักษร)
  const subLine1 = !plan.hasIncome
    ? 'กรอกเงินเดือนที่หน้า "เงินได้รายเดือน" ก่อน แล้วแผนจะคิดให้เอง'
    : plan.taxNow <= 0
      ? 'ไม่ต้องซื้อสิทธิ์เพิ่ม — กางดูได้ว่าเหลือสิทธิ์อะไรไว้ใช้ปีที่รายได้สูงขึ้น'
      : `ต้องลดหย่อนเพิ่ม ${baht(plan.needToZero)} · จ่ายเงินจริง ${baht(plan.planSpend)}`;

  // เงินที่ใส่ไป "ยังเป็นของเรา" (กองทุน) กับ "จ่ายทิ้ง" (เบี้ย/บริจาค) ต่างกันคนละเรื่อง
  // แยกมาเป็นบรรทัดของตัวเองเสมอ ไม่ยัดเข้าไปในวงเล็บท้ายประโยคเดิม
  const subLine2 =
    plan.hasIncome && plan.taxNow > 0 && (plan.keptTHB > 0 || plan.goneTHB > 0)
      ? [
          plan.keptTHB > 0 ? `เงินยังเป็นของเรา ${baht(plan.keptTHB)}` : null,
          plan.goneTHB > 0 ? `จ่ายทิ้ง ${baht(plan.goneTHB)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  return (
    <View style={styles.planCard}>
      <TouchableOpacity style={styles.planHead} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <View style={styles.planHeadInfo}>
          <Text style={styles.planTitle}>สูตรลดหย่อนให้ภาษีเป็น 0</Text>
          <Text style={styles.planBig}>{headline}</Text>
          <Text style={styles.planSub}>{subLine1}</Text>
          {subLine2 && <Text style={styles.planSub}>{subLine2}</Text>}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.primary} />
      </TouchableOpacity>

      {open && (
        <View style={styles.planBody}>
          {basisNote && <Text style={styles.planSub}>{basisNote}</Text>}
          {plan.age != null && (
            <Text style={styles.planSub}>
              จัดลำดับตามอายุ {plan.age} ปี ณ สิ้นปีภาษี — ตัวที่ปลดล็อกเร็วกว่าอยู่บน (RMF ขายได้เมื่ออายุ 55)
            </Text>
          )}

          {/* จุดคุ้มสุด — ต้องอยู่ก่อนรายการ ไม่ใช่เชิงอรรถท้ายการ์ด
              ขั้นบันไดไม่เป็นเชิงเส้น: บาทที่ลากเงินได้สุทธิจากขั้น 5% ลงมาถึง 0 ประหยัดแค่ 5%
              ถ้าโชว์แค่ "ถึง 0" ผู้ใช้จะจ่ายเงินก้อนท้ายที่คุ้มน้อยที่สุดโดยไม่รู้ตัว */}
          {plan.hasIncome &&
            plan.taxNow > 0 &&
            (plan.needToLowValue > 0 ? (
              <View style={styles.planMilestoneBox}>
                <Text style={styles.planMilestoneTitle}>ใส่เท่าไหร่ถึงคุ้ม</Text>
                <View style={styles.planMilestoneRow}>
                  <Text style={styles.planMilestoneLabel}>
                    ใส่ {baht(plan.needToLowValue)} → ภาษีเหลือ {baht(plan.taxAtLowValue)}
                  </Text>
                  <Text style={styles.planMilestoneRate}>
                    คุ้ม {pct(plan.savedPerBahtToLowValue)}
                  </Text>
                </View>
                <View style={styles.planMilestoneRow}>
                  <Text style={styles.planMilestoneLabel}>
                    ใส่เพิ่มอีก {baht(plan.needToZero - plan.needToLowValue)} → ภาษีเหลือ 0
                  </Text>
                  <Text style={styles.planMilestoneRateWeak}>
                    คุ้ม {pct(plan.savedPerBahtToZero)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.planMilestone}>
                ทุกบาทที่ลดหย่อนเพิ่มจากนี้ประหยัดภาษี {pct(plan.lowValueRate)} เท่านั้น —
                ซื้อสิทธิ์เพื่อกดให้ถึง 0 จึงคุ้มน้อยที่สุด
              </Text>
            ))}

          {!plan.reachedZero && plan.hasIncome && plan.taxNow > 0 && (
            <Text style={styles.planNote}>
              สิทธิ์ที่เหลือไม่พอกดให้ถึง 0 — ต่ำสุดที่ทำได้คือภาษี {baht(plan.taxAfter)}
            </Text>
          )}

          {/* จ่ายไปแล้วแต่ยังไม่ได้กรอก — ต้องมาก่อนทุกอย่าง เพราะไม่ต้องควักเงินเพิ่มเลย
              ระบบไม่เดายอดให้ (สลิป/ใบเสร็จเท่านั้น) จึงไม่ถูกนับเป็นตัวเลขในแผน */}
          {plan.fillFirst.length > 0 && (
            <>
              <Text style={styles.planKindTitle}>กรอกก่อน — จ่ายไปแล้ว ไม่ต้องจ่ายเพิ่ม</Text>
              <Text style={styles.planKindNote}>
                ยอดพวกนี้ต้องดูจากสลิป/ใบเสร็จ ระบบเดาแทนไม่ได้ — กรอกแล้วแผนด้านล่างจะสั้นลง
              </Text>
              {plan.fillFirst.map((t) => (
                <ToolRow key={t.item.key} tool={t} />
              ))}
            </>
          )}

          {KIND_SEQUENCE.map((kind) => {
            const steps = plan.steps.filter((s) => s.tool.kind === kind);
            if (steps.length === 0) return null;
            return (
              <View key={kind}>
                <Text style={styles.planKindTitle}>{SAVE_TOOL_KIND_LABELS[kind]}</Text>
                {steps.map((s) => (
                  <StepRow key={s.tool.item.key} step={s} index={plan.steps.indexOf(s) + 1} />
                ))}
              </View>
            );
          })}

          {plan.leftover.length > 0 && (
            <>
              <Text style={styles.planKindTitle}>ทางเลือกอื่นที่ยังเหลือสิทธิ์</Text>
              {plan.leftover.map((t) => (
                <ToolRow key={t.item.key} tool={t} />
              ))}
            </>
          )}

          {chipTools.length > 0 && (
            <>
              <Text style={styles.planKindTitle}>ไม่อยากใช้ตัวไหน กดปิดได้</Text>
              <Text style={styles.planKindNote}>
                ปิดแล้วแผนจะจัดลำดับใหม่ให้ทันที (ปิดไว้ชั่วคราวในหน้านี้ ไม่ได้บันทึก)
              </Text>
              <View style={styles.planChipRow}>
                {chipTools.map((t) => {
                  const off = excluded.includes(t.item.key);
                  return (
                    <TouchableOpacity
                      key={t.item.key}
                      style={[styles.planChip, off && styles.planChipOff]}
                      onPress={() => onToggleTool(t.item.key)}
                    >
                      <Ionicons
                        name={off ? 'close' : 'checkmark'}
                        size={12}
                        color={off ? COLORS.textSecondary : COLORS.success}
                      />
                      <Text style={off ? styles.planChipTextOff : styles.planChipText}>
                        {t.item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {plan.notes.map((n, i) => (
            <Text key={i} style={styles.planNote}>
              {n}
            </Text>
          ))}

          {/* ท้ายการ์ดเดิมเป็นสองย่อหน้ายาว ตัดเหลือสองประโยค เก็บสาระเดิมครบ:
              (1) แผนนี้ไม่เขียนลงช่องกรอก (2) ผิดเงื่อนไขต้องคืนภาษี */}
          <Text style={styles.planFoot}>
            แผนนี้เป็นการจำลอง ไม่ได้บันทึกลงช่องลดหย่อน — กรอกเมื่อจ่ายจริงแล้วเท่านั้น{'\n'}
            ก่อนซื้อ อ่านเงื่อนไขของสิทธิ์นั้นในรายการด้านล่างก่อนทุกครั้ง (ผิดเงื่อนไขต้องคืนภาษีพร้อมเงินเพิ่ม)
          </Text>
        </View>
      )}
    </View>
  );
};

export default TaxSavePlanCard;
