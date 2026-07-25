// ค้นหากองทุนไทยจากแคตตาล็อก static (public/funds.json — กองทุน active ~3000 กอง จาก SEC Open Data)
// SEC API ค้นด้วยชื่อไม่ได้ (profiles ไม่มี search param) เลยดึงรายชื่อมาเก็บเป็นไฟล์ แล้วค้นในเครื่อง
// NAV ยังกรอกเอง (endpoint NAV ของ SEC ให้ค่าล่าสุดแบบเบาๆ ไม่ได้)

export interface FundCatalogItem {
  id: string;    // proj_id เช่น M0008_2537
  abbr: string;  // ชื่อย่อ เช่น RKF4, KFF6MHX
  name: string;  // ชื่อเต็มภาษาไทย
}

let cache: FundCatalogItem[] | null = null;
let loading: Promise<FundCatalogItem[]> | null = null;

async function loadCatalog(): Promise<FundCatalogItem[]> {
  if (cache) return cache;
  if (loading) return loading;
  loading = fetch('/funds.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((data: FundCatalogItem[]) => {
      cache = Array.isArray(data) ? data : [];
      return cache;
    })
    .catch((err) => {
      console.error('Error loading fund catalog:', err);
      return [];
    });
  return loading;
}

export async function searchFundList(query: string): Promise<FundCatalogItem[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const catalog = await loadCatalog();
  // ให้ที่ขึ้นต้นด้วยคำค้น (ชื่อย่อ) มาก่อน แล้วค่อยที่มีคำค้นอยู่ข้างใน
  const starts: FundCatalogItem[] = [];
  const contains: FundCatalogItem[] = [];
  for (const f of catalog) {
    const abbr = f.abbr.toLowerCase();
    const name = f.name.toLowerCase();
    if (abbr.startsWith(q)) starts.push(f);
    else if (abbr.includes(q) || name.includes(q)) contains.push(f);
    if (starts.length >= 15) break;
  }
  return [...starts, ...contains].slice(0, 15);
}
