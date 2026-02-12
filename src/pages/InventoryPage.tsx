// src/pages/InventoryPage.tsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../QuoteService";
const BOT_SERVER_URL = "http://localhost:5000";
// ⚠️ OpenAI API 키 입력
const OPENAI_API_KEY = "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";


type InventoryItem = {
  id?: string;
  quote_id: string;
  contract_date: string;
  drawing_no: string;
  spec: string;
  bank_account: string;
  tax_invoice: string;
  deposit_status: string;
  sebal_status: string;
  customer_name: string;
  items: any[];
  special_order: boolean;
  interior: string;
  depositor: string;
  delivery_date: string;
  total_amount: number;
  inventory_status: string;
  container_type: string;
  contract_type: string;
};

type UsedInventoryItem = {
  id: string;
  item_number: number;
  spec: string;
  quantity: number;
  condition: string;
  price: number;
  note: string;
  photo_url: string;
  photo_urls?: string[];
  status: string;
  created_at: string;
  usage?: string[];
  has_interior?: boolean;
  floor?: string[];
  door?: string[];
  electric?: string;
  aircon?: string;
  sink?: string;
  toilet?: string;
};

const SPEC_OPTIONS = ["3x3", "3x4", "3x6", "3x9"];
type DepositTabType = "all" | "paid" | "unpaid";
type MainTabType = "new" | "used";

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const yy = year.slice(2);
  return `${yy}/${month}/${day} ${weekDays[date.getDay()]}`;
};

// GPT 홍보글 생성
const generatePromoWithGPT = async (item: UsedInventoryItem, platform: "jungonara" | "blog"): Promise<string> => {
  const infoParts: string[] = [];
  infoParts.push(`규격: ${item.spec}`);
  infoParts.push(`상태: ${item.condition}`);
  infoParts.push(`수량: ${item.quantity}대`);
  infoParts.push(item.price ? `가격: ${item.price}만원` : "가격: 문의");
  
  if (item.usage && item.usage.length > 0) infoParts.push(`용도: ${item.usage.join(", ")}`);
  if (item.has_interior) infoParts.push("내장: 있음");
  if (item.floor && item.floor.length > 0) infoParts.push(`바닥: ${item.floor.join(", ")}`);
  if (item.door && item.door.length > 0) infoParts.push(`출입문: ${item.door.join(", ")}`);
  if (item.electric) infoParts.push(`전기: ${item.electric}`);
  if (item.aircon) infoParts.push(`에어컨: ${item.aircon}`);
  if (item.sink) infoParts.push(`싱크대: ${item.sink}`);
  if (item.toilet) infoParts.push(`화장실: ${item.toilet}`);
  if (item.note) infoParts.push(`특이사항: ${item.note}`);

  const systemPrompt = `너는 중고컨테이너 판매 글 작성 전문가야.
아래 샘플글 스타일을 정확히 따라해. 특히 🔸컨테이너 마감사양🔸 섹션을 상세하게 작성해야 해.

[샘플글]
🔷다락형/농막/화장실*싱크대완비/ 중고 할인판매/컨테이너숙소/체류형쉼터🔷

"바닥 합판 MDF 아님❌️ OSB 아님❌️
최고급 말레이시아산 18T 라민보드!! 품질자부"

중고 A급 상품, 할인 판매합니다
가격: ➡️ 150만원 (부가세별도)
사이즈 3m*6m

🔸컨테이너 마감사양🔸
✔️ 전기: 누전차단기, 스위치, 콘센트, LED등, 접지 포함
✔️ 바닥: 모노륨장판 마감
✔️ 출입문: 양개문
✔️ 화장실: 완비
✔️ 싱크대: 완비
✔️ 에어컨: 있음

컨테이너 제작 공장 직영입니다😁
위치 화성시입니다.
010-8773-7557

방충망 서비스, 상차 해 드립니다~
운임 및 하차 별도 (전화로 문의 주세요)

===

[필수 작성 규칙]
1. 제목은 🔷로 감싸고, 용도/규격/상태를 슬래시(/)로 나열
2. 가격은 ➡️ 이모지 사용, 부가세별도 명시
3. 🔸컨테이너 마감사양🔸 섹션은 반드시 작성하고, 제공된 옵션을 ✔️로 하나씩 상세히 나열해:
   - 전기 옵션이 있으면: ✔️ 전기: (기본전기/한전허가용 사양)
   - 바닥 옵션이 있으면: ✔️ 바닥: (데코타일/기본장판/모노륨장판/3.2t철판/전기온돌판넬)
   - 출입문 옵션이 있으면: ✔️ 출입문: (양개문/폴딩도어/패션도어/슬라이딩도어)
   - 화장실이 있음이면: ✔️ 화장실: 완비
   - 싱크대가 있음이면: ✔️ 싱크대: 완비
   - 에어컨이 있음이면: ✔️ 에어컨: 있음
   - 내장이 있으면: ✔️ 내장: 있음
4. 용도가 있으면 제목과 본문에 포함 (농막, 창고, 사무실, 숙소, 체류형쉼터 등)
5. 마무리는 항상: 공장직영 + 위치 화성시 + 010-8773-7557 + 방충망 서비스/상차 안내
6. "중고" 컨테이너임을 명시하고 상태(A급/B급/C급) 강조
7. 옵션이 없는 항목은 생략해도 됨`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `이 중고 컨테이너 ${platform === "jungonara" ? "중고나라" : "블로그"} 판매글 써줘:\n\n${infoParts.join("\n")}` }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    const data = await response.json();
    if (data.choices && data.choices[0]) {
      return data.choices[0].message.content;
    }
    throw new Error("No response");
  } catch (error) {
    console.error("GPT API 에러:", error);
    // 에러시 기본 템플릿 반환
    const priceText = item.price ? `${item.price}만원` : "가격문의";
    return `🔷중고컨테이너/${item.spec}/${item.condition}🔷

중고 ${item.condition} 컨테이너 판매합니다
가격: ➡️ ${priceText} (부가세별도)
사이즈: ${item.spec}
수량: ${item.quantity}대
${item.note ? `\n📝 ${item.note}` : ""}

컨테이너 제작 공장 직영입니다😁
위치 화성시입니다.
010-8773-7557

방충망 서비스, 상차 해 드립니다~
운임 및 하차 별도 (전화로 문의 주세요)`;
  }
};

export default function InventoryPage({ 
  onBack,
  onNavigate 
}: { 
  onBack: () => void;
  onNavigate?: (view: string) => void;
}) {
  const [allQuotes, setAllQuotes] = useState<{ quote_id: string; contract_date: string; drawing_no: string; }[]>([]);
  const [allItems, setAllItems] = useState<InventoryItem[]>([]);
  const [usedItems, setUsedItems] = useState<UsedInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [depositTab, setDepositTab] = useState<DepositTabType>("all");
const [specFilter, setSpecFilter] = useState<string | null>(null);  // ← 이 줄 추가
  const [mainTab, setMainTab] = useState<MainTabType>("new");
  const [showPhotoModal, setShowPhotoModal] = useState<string[] | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showPromoModal, setShowPromoModal] = useState<{ item: UsedInventoryItem; platform: "jungonara" | "blog" } | null>(null);
  const [promoText, setPromoText] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [editUsedItem, setEditUsedItem] = useState<UsedInventoryItem | null>(null);
  
  const [newItem, setNewItem] = useState({
    customer_name: "",
    spec: "3x6",
    inventory_status: "작업지시완료",
    container_type: "신품",
    contract_date: new Date().toISOString().slice(0, 10),
    total_amount: 0,
    qty: 1,
    deposit_status: "대기",
    drawing_no: "",
  });

  const loadInventory = async () => {
    setLoading(true);
    const [inventoryRes, quotesRes, usedRes] = await Promise.all([
      supabase.from("inventory").select("*"),
      supabase.from("quotes").select("quote_id, contract_date, drawing_no").eq("status", "confirmed"),
      supabase.from("used_inventory").select("*").order("created_at", { ascending: false })
    ]);
    
    if (inventoryRes.data) {
      const sorted = [...inventoryRes.data].sort((a, b) => {
        const dateA = a.contract_date || "";
        const dateB = b.contract_date || "";
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        return (Number(b.drawing_no) || 0) - (Number(a.drawing_no) || 0);
      });
      setAllItems(sorted as InventoryItem[]);
    }
    setAllQuotes(quotesRes.data || []);
    setUsedItems(usedRes.data || []);
    setLoading(false);
  };

  useEffect(() => { loadInventory(); }, []);

  const postToJungonara = async (item: UsedInventoryItem) => {
    if (!confirm(`"${item.spec} ${item.condition}" 중고나라 자동 등록하시겠습니까?\n\n※ PC에서 봇 서버가 실행 중이어야 합니다.`)) {
      return;
    }

    try {
      const response = await fetch(`${BOT_SERVER_URL}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id }),
      });
      const result = await response.json();
      
      if (result.success) {
        alert("✅ 봇이 시작되었습니다!\n\nPC 브라우저에서 자동으로 중고나라 글쓰기가 진행됩니다.");
      } else {
        alert(`❌ 실패: ${result.message}`);
      }
    } catch (error) {
      alert("❌ 봇 서버에 연결할 수 없습니다.\n\nPC에서 서버를 실행해주세요:\npython jungonara_server.py");
    }
  };

  const normalizeSpec = (spec: string) => {
    if (!spec) return null;
    const s = spec.toLowerCase().replace(/\s/g, "").replace("*", "x");
    if (s.includes("3x6")) return "3x6";
    if (s.includes("3x9")) return "3x9";
    if (s.includes("3x3")) return "3x3";
    if (s.includes("3x4")) return "3x4";
    return null;
  };

const filteredItems = useMemo(() => {
    let items = allItems;
    if (specFilter) {
      items = items.filter(item => normalizeSpec(item.spec) === specFilter && item.inventory_status === "출고대기");
    }
    if (depositTab === "all") return items;
    if (depositTab === "paid") return items.filter(item => item.deposit_status === "완료");
    if (depositTab === "unpaid") return items.filter(item => item.deposit_status !== "완료" && item.deposit_status !== "대기");
    return items;
  }, [allItems, depositTab, specFilter]);

  const paidCount = useMemo(() => allItems.filter(item => item.deposit_status === "완료").length, [allItems]);
  const unpaidCount = useMemo(() => allItems.filter(item => item.deposit_status !== "완료" && item.deposit_status !== "대기").length, [allItems]);

  const completedCounts = useMemo(() => {
    const counts: { [key: string]: number } = { "3x3": 0, "3x4": 0, "3x6": 0, "3x9": 0 };
    allItems.filter(item => item.inventory_status === "작업지시완료").forEach(item => {
      const specKey = normalizeSpec(item.spec);
      if (specKey && specKey in counts) counts[specKey]++;
    });
    return counts;
  }, [allItems]);

  const nextDrawingNo = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const inventoryNumbers = allItems.filter(item => {
      if (!item.contract_date) return false;
      const d = new Date(item.contract_date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).map(item => parseInt(item.drawing_no) || 0);
    const quotesNumbers = allQuotes.filter(item => {
      if (!item.contract_date) return false;
      const d = new Date(item.contract_date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).map(item => parseInt(item.drawing_no) || 0);
    const allNumbers = [...inventoryNumbers, ...quotesNumbers].filter(n => n > 0);
    return allNumbers.length > 0 ? Math.max(...allNumbers) + 1 : 1;
  }, [allItems, allQuotes]);

  const waitingItems = useMemo(() => allItems.filter(item => item.inventory_status === "출고대기"), [allItems]);
  const waitingBySpec = useMemo(() => {
    const grouped: { [key: string]: number } = {};
    waitingItems.forEach(item => {
      const spec = normalizeSpec(item.spec) || item.spec || "미정";
      grouped[spec] = (grouped[spec] || 0) + 1;
    });
    return grouped;
  }, [waitingItems]);

  const updateField = async (quote_id: string, field: string, value: any) => {
    const { error } = await supabase.from("inventory").update({ [field]: value }).eq("quote_id", quote_id);
    if (error) { alert(`업데이트 실패: ${error.message}`); return; }
    setAllItems(prev => prev.map(c => c.quote_id === quote_id ? { ...c, [field]: value } : c));
  };

  const handleMoveToContract = async (item: InventoryItem, targetType: string) => {
    const typeName = targetType === "order" ? "수주" : "영업소";
    if (!confirm(`이 항목을 계약견적 "${typeName}"으로 이동하시겠습니까?`)) return;
    const newQuoteId = `${item.quote_id}_${targetType}_${Date.now()}`;
    const existingOptions = item.items?.map((i: any) => i.displayName || i.optionName || "").filter(Boolean).join(", ") || "";
    const newItems = existingOptions ? [{ displayName: `재고, ${existingOptions}` }] : [{ displayName: "재고" }];
    const { error: insertError } = await supabase.from("quotes").insert({
      quote_id: newQuoteId, status: "confirmed", contract_type: targetType, contract_date: item.contract_date,
      drawing_no: item.drawing_no, spec: item.spec, customer_name: item.customer_name, interior: item.interior,
      delivery_date: item.delivery_date, total_amount: item.total_amount, items: newItems,
      deposit_status: item.deposit_status || "", bank_account: item.bank_account || "",
      tax_invoice: item.tax_invoice || "", depositor: item.depositor || "", source: "inventory",
    });
    if (insertError) { alert("이동 실패: " + insertError.message); return; }
    await supabase.from("inventory").update({ inventory_status: "출고완료", interior: `${item.interior || ""} [${typeName}이동]`.trim() }).eq("quote_id", item.quote_id);
    alert(`계약견적 "${typeName}"으로 이동 완료!`);
    loadInventory();
  };

  const handleAddNew = async () => {
    if (!newItem.spec) { alert("규격을 선택해주세요."); return; }
    const qty = newItem.qty || 1;
    const startNo = newItem.drawing_no ? parseInt(newItem.drawing_no) || nextDrawingNo : nextDrawingNo;
    const inserts = [];
    for (let i = 0; i < qty; i++) {
      inserts.push({
        quote_id: `INV_${Date.now()}_${i}`, contract_date: newItem.contract_date, drawing_no: String(startNo + i),
        customer_name: newItem.customer_name, spec: newItem.spec, inventory_status: newItem.inventory_status,
        container_type: newItem.container_type, total_amount: newItem.total_amount, deposit_status: newItem.deposit_status, items: [],
      });
    }
    const { error } = await supabase.from("inventory").insert(inserts);
    if (error) { alert("추가 실패: " + error.message); return; }
    setShowAddModal(false);
    setNewItem({ 
      customer_name: "", 
      spec: "3x6", 
      inventory_status: "작업지시완료", 
      container_type: "신품", 
      contract_date: new Date().toISOString().slice(0, 10), 
      total_amount: 0, 
      qty: 1, 
      deposit_status: "대기",
      drawing_no: "" 
    });
    loadInventory();
  };

  const handleDelete = async (quote_id: string, spec: string) => {
    if (!confirm(`"${spec}" 항목을 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from("inventory").delete().eq("quote_id", quote_id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    loadInventory();
  };

  const getPhotoUrls = (item: UsedInventoryItem): string[] => {
    const urls: string[] = [];
    if (item.photo_urls && Array.isArray(item.photo_urls)) {
      urls.push(...item.photo_urls);
    }
    if (item.photo_url && !urls.includes(item.photo_url)) {
      urls.unshift(item.photo_url);
    }
    return urls;
  };

  const openPromoModal = async (item: UsedInventoryItem, platform: "jungonara" | "blog") => {
    setShowPromoModal({ item, platform });
    setPromoText("");
    setPromoLoading(true);
    const text = await generatePromoWithGPT(item, platform);
    setPromoText(text);
    setPromoLoading(false);
  };

  const copyPromoText = () => {
    navigator.clipboard.writeText(promoText).then(() => {
      alert("홍보글이 복사되었습니다!");
    });
  };

  const regeneratePromo = async () => {
    if (!showPromoModal) return;
    setPromoLoading(true);
    const text = await generatePromoWithGPT(showPromoModal.item, showPromoModal.platform);
    setPromoText(text);
    setPromoLoading(false);
  };

  const thStyle: React.CSSProperties = { padding: "10px 8px", border: "1px solid #1e4a6e", whiteSpace: "nowrap", backgroundColor: "#2e5b86", color: "#ffffff", fontWeight: 700, fontSize: 13, textAlign: "center" };
  const getStatusColor = (status: string) => {
    switch (status) {
      case "작업지시완료": return "#28a745";
      case "출고대기": return "#ffc107";
      case "찜": return "#e91e63";
      case "출고완료": return "#6c757d";
      default: return "#17a2b8";
    }
  };
  const tabStyle = (isActive: boolean): React.CSSProperties => ({ padding: "12px 24px", border: "none", borderBottom: isActive ? "3px solid #2e5b86" : "3px solid transparent", background: isActive ? "#fff" : "#f5f5f5", color: isActive ? "#2e5b86" : "#666", fontWeight: isActive ? 800 : 500, fontSize: 14, cursor: "pointer" });

  return (
    <div style={{ padding: 16, background: "#f6f7fb", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>재고현황 <span style={{ fontSize: 12, fontWeight: 400, color: "#666", marginLeft: 8 }}>(총 {allItems.length + usedItems.length}건)</span></h2>
        {mainTab === "new" && <button onClick={() => setShowAddModal(true)} style={{ padding: "8px 16px", background: "#28a745", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>+ 새 항목 추가</button>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setMainTab("new")} style={{ padding: "12px 24px", background: mainTab === "new" ? "#2e5b86" : "#e5e7eb", color: mainTab === "new" ? "#fff" : "#666", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>신품 재고 ({allItems.length})</button>
        <button onClick={() => setMainTab("used")} style={{ padding: "12px 24px", background: mainTab === "used" ? "#f59e0b" : "#e5e7eb", color: mainTab === "used" ? "#fff" : "#666", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>중고 재고 ({usedItems.length})</button>
      </div>

      {mainTab === "new" && (
        <>
         <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#28a745", marginBottom: 12 }}>작업지시 완료</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {["3x3", "3x4", "3x6", "3x9"].map(spec => (
                  <div key={spec} style={{ background: "#f0f9f0", padding: "10px 16px", borderRadius: 8, textAlign: "center", minWidth: 60 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#28a745" }}>{completedCounts[spec] || 0}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{spec}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#ffc107", marginBottom: 12 }}>출고대기 <span style={{ background: "#ffc107", color: "#000", padding: "2px 8px", borderRadius: 10, fontSize: 12 }}>{waitingItems.length}대</span></div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {["3x3", "3x4", "3x6", "3x9"].map(spec => (
                  <div key={spec} onClick={() => setSpecFilter(specFilter === spec ? null : spec)} style={{ background: specFilter === spec ? "#ffc107" : "#fffbeb", padding: "10px 16px", borderRadius: 8, textAlign: "center", minWidth: 60, cursor: "pointer", border: specFilter === spec ? "2px solid #e65100" : "2px solid transparent" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: specFilter === spec ? "#000" : "#f59e0b" }}>{waitingBySpec[spec] || 0}</div>
                    <div style={{ fontSize: 11, color: specFilter === spec ? "#000" : "#666", fontWeight: specFilter === spec ? 700 : 400 }}>{spec}</div>
                  </div>
                ))}
              </div>
            
            </div>
          </div>

          <div style={{ display: "flex", background: "#fff", borderRadius: "12px 12px 0 0", border: "1px solid #e5e7eb", borderBottom: "none" }}>
            <button style={tabStyle(depositTab === "all")} onClick={() => setDepositTab("all")}>전체 ({allItems.length})</button>
            <button style={tabStyle(depositTab === "paid")} onClick={() => setDepositTab("paid")}>✅ 입금완료 ({paidCount})</button>
            <button style={{ ...tabStyle(depositTab === "unpaid"), color: depositTab === "unpaid" ? "#dc3545" : "#666" }} onClick={() => setDepositTab("unpaid")}>❌ 미입금 ({unpaidCount})</button>
          </div>

          <div style={{ background: "#fff", borderRadius: "0 0 12px 12px", border: "1px solid #e5e7eb", borderTop: "none", overflow: "hidden" }}>
            {loading ? <div style={{ textAlign: "center", padding: 40 }}>로딩 중...</div> : filteredItems.length === 0 ? <div style={{ textAlign: "center", padding: 40 }}>재고 없음</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr>
                    <th style={thStyle}>상태</th><th style={thStyle}>영업소</th><th style={thStyle}>타입</th><th style={thStyle}>등록일</th><th style={thStyle}>규격</th><th style={thStyle}>발주처</th><th style={thStyle}>도면번호</th><th style={thStyle}>세발</th><th style={thStyle}>입금</th><th style={thStyle}>메모</th><th style={thStyle}>출고일</th><th style={thStyle}>삭제</th>
                  </tr></thead>
                  <tbody>
                    {filteredItems.map((item) => {
                      const isCompleted = item.inventory_status === "출고완료" || item.inventory_status === "찜";
                      const isUnpaid = item.deposit_status !== "완료" && item.deposit_status !== "대기";
                      return (
                        <tr key={item.quote_id} style={{ background: isCompleted ? "#f0f0f0" : "#fff", opacity: isCompleted ? 0.6 : 1, outline: isUnpaid && !isCompleted ? "2px solid #dc3545" : "none" }}>
                          <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                            <select value={item.inventory_status || "작업지시완료"} onChange={(e) => updateField(item.quote_id, "inventory_status", e.target.value)} style={{ padding: 4, borderRadius: 4, fontSize: 11, background: getStatusColor(item.inventory_status || "작업지시완료"), color: item.inventory_status === "출고대기" ? "#000" : "#fff", fontWeight: 700, border: "1px solid #ddd" }}>
                              <option value="작업지시완료">작업지시완료</option><option value="출고대기">출고대기</option><option value="찜">찜</option><option value="출고완료">출고완료</option>
                            </select>
                          </td>
                          <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                            <button onClick={() => handleMoveToContract(item, "branch")} style={{ padding: "4px 8px", background: "#6f42c1", color: "#fff", border: "none", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>→영업소</button>
                          </td>
                          <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                            <select value={item.container_type || "신품"} onChange={(e) => updateField(item.quote_id, "container_type", e.target.value)} style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}>
                              <option value="신품">신품</option><option value="중고">중고</option><option value="리스">리스</option>
                            </select>
                          </td>
                          <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>{formatDateDisplay(item.contract_date)}</td>
                          <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                            <select value={normalizeSpec(item.spec) || "3x6"} onChange={(e) => updateField(item.quote_id, "spec", e.target.value)} style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontWeight: 700 }}>
                              {SPEC_OPTIONS.map(spec => <option key={spec} value={spec}>{spec}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: 8, border: "1px solid #eee" }}><input defaultValue={item.customer_name || ""} onBlur={(e) => updateField(item.quote_id, "customer_name", e.target.value)} style={{ width: 80, padding: 4, border: "1px solid #ddd", borderRadius: 4 }} /></td>
                          <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}><input defaultValue={item.drawing_no || ""} onBlur={(e) => updateField(item.quote_id, "drawing_no", e.target.value)} style={{ width: 40, padding: 4, border: "1px solid #ddd", borderRadius: 4, textAlign: "center", fontWeight: 700 }} /></td>
                          <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                            <select value={item.sebal_status || ""} onChange={(e) => updateField(item.quote_id, "sebal_status", e.target.value)} style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11, background: item.sebal_status === "완료" ? "#28a745" : item.sebal_status === "계약금만" ? "#ffc107" : "#fff", color: item.sebal_status === "완료" ? "#fff" : "#000", fontWeight: 600 }}>
                              <option value="">-</option><option value="완료">완료</option><option value="미완료">미완료</option><option value="계약금만">계약금만</option>
                            </select>
                          </td>
                          <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                            <select value={item.deposit_status || ""} onChange={(e) => updateField(item.quote_id, "deposit_status", e.target.value)} style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11, background: item.deposit_status === "완료" ? "#28a745" : "#fff", color: item.deposit_status === "완료" ? "#fff" : "#000" }}>
                              <option value="">-</option><option value="대기">대기</option><option value="완료">완료</option><option value="계약금">계약금</option><option value="미입금">미입금</option>
                            </select>
                          </td>
                          <td style={{ padding: 8, border: "1px solid #eee" }}><input defaultValue={item.interior || ""} onBlur={(e) => updateField(item.quote_id, "interior", e.target.value)} style={{ width: 100, padding: 4, border: "1px solid #ddd", borderRadius: 4 }} /></td>
                          <td style={{ padding: 8, border: "1px solid #eee" }}><input type="date" value={item.delivery_date || ""} onChange={(e) => updateField(item.quote_id, "delivery_date", e.target.value)} style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }} /></td>
                          <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}><button onClick={() => handleDelete(item.quote_id, item.spec)} style={{ padding: "4px 8px", background: "#dc3545", color: "#fff", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>삭제</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {mainTab === "used" && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          {loading ? <div style={{ textAlign: "center", padding: 40 }}>로딩 중...</div> : usedItems.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#888" }}>중고 재고가 없습니다.<br/>앱에서 등록해주세요.</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr>
                  <th style={thStyle}>번호</th><th style={thStyle}>사진</th><th style={thStyle}>규격</th><th style={thStyle}>수량</th><th style={thStyle}>상태</th><th style={thStyle}>가격</th><th style={thStyle}>옵션</th><th style={thStyle}>특이사항</th><th style={thStyle}>등록일</th><th style={thStyle}>판매</th><th style={thStyle}>홍보</th><th style={thStyle}>삭제</th>
                </tr></thead>
                <tbody>
                  {usedItems.map((item) => {
                    const photoUrls = getPhotoUrls(item);
                    return (
                      <tr key={item.id}>
                        <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center", fontWeight: 700 }}>{item.item_number || "-"}</td>
                        <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                          {photoUrls.length > 0 ? (
                            <div style={{ display: "flex", gap: 4, justifyContent: "center", cursor: "pointer" }} onClick={() => { setShowPhotoModal(photoUrls); setCurrentPhotoIndex(0); }}>
                              {photoUrls.slice(0, 3).map((url, idx) => (
                                <img key={idx} src={url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, border: "1px solid #ddd" }} />
                              ))}
                              {photoUrls.length > 3 && (
                                <div style={{ width: 40, height: 40, borderRadius: 4, background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>+{photoUrls.length - 3}</div>
                              )}
                            </div>
                          ) : "-"}
                        </td>
                        <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center", fontWeight: 700 }}>{item.spec}</td>
                        <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>{item.quantity}</td>
                        <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                          <span style={{ padding: "4px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: item.condition === "A급" ? "#28a745" : item.condition === "B급" ? "#ffc107" : "#dc3545", color: item.condition === "B급" ? "#000" : "#fff" }}>{item.condition}</span>
                        </td>
                        <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>{item.price ? `${item.price}만원` : "-"}</td>
                        <td 
                          style={{ padding: 8, border: "1px solid #eee", fontSize: 11, cursor: "pointer", background: "#f9f9f9" }}
                          onClick={() => setEditUsedItem(item)}
                          title="클릭해서 수정"
                        >
                          {[
                            item.has_interior && "내장",
                            item.electric,
                            item.floor?.join(","),
                            item.door?.join(","),
                            item.aircon && "에어컨",
                            item.sink && "싱크대",
                            item.toilet && "화장실",
                          ].filter(Boolean).join(", ") || "클릭해서 추가"}
                        </td>
                        <td style={{ padding: 8, border: "1px solid #eee" }}>
                          <input
                            defaultValue={item.note || ""}
                            onBlur={async (e) => {
                              await supabase.from("used_inventory").update({ note: e.target.value }).eq("id", item.id);
                            }}
                            style={{ width: 80, padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}
                            placeholder="특이사항"
                          />
                        </td>
                        <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center", fontSize: 11 }}>{item.created_at ? new Date(item.created_at).toLocaleDateString() : "-"}</td>
                        <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                          <select value={item.status || "판매중"} onChange={async (e) => { await supabase.from("used_inventory").update({ status: e.target.value }).eq("id", item.id); loadInventory(); }} style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11, background: item.status === "판매완료" ? "#6c757d" : "#28a745", color: "#fff" }}>
                            <option value="판매중">판매중</option><option value="판매완료">판매완료</option>
                          </select>
                        </td>
                        <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <button onClick={() => postToJungonara(item)} style={{ padding: "4px 6px", background: "#06c755", color: "#fff", border: "none", borderRadius: 4, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>자동등록</button>
                            <button onClick={() => openPromoModal(item, "jungonara")} style={{ padding: "4px 6px", background: "#888", color: "#fff", border: "none", borderRadius: 4, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>복사</button>
                            <button onClick={() => openPromoModal(item, "blog")} style={{ padding: "4px 6px", background: "#03c75a", color: "#fff", border: "none", borderRadius: 4, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>블로그</button>
                          </div>
                        </td>
                        <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                          <button onClick={async () => { if (!confirm("삭제?")) return; await supabase.from("used_inventory").delete().eq("id", item.id); loadInventory(); }} style={{ padding: "4px 8px", background: "#dc3545", color: "#fff", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>삭제</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 사진 모달 */}
      {showPhotoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }} onClick={() => setShowPhotoModal(null)}>
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
            <img src={showPhotoModal[currentPhotoIndex]} alt="" style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 8 }} />
            {showPhotoModal.length > 1 && (
              <>
                <button onClick={() => setCurrentPhotoIndex(prev => (prev - 1 + showPhotoModal.length) % showPhotoModal.length)} style={{ position: "absolute", left: -50, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "#fff", border: "none", fontSize: 20, cursor: "pointer" }}>◀</button>
                <button onClick={() => setCurrentPhotoIndex(prev => (prev + 1) % showPhotoModal.length)} style={{ position: "absolute", right: -50, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "#fff", border: "none", fontSize: 20, cursor: "pointer" }}>▶</button>
              </>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
              {showPhotoModal.map((url, idx) => (
                <img key={idx} src={url} alt="" onClick={() => setCurrentPhotoIndex(idx)} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 4, cursor: "pointer", border: currentPhotoIndex === idx ? "3px solid #fff" : "1px solid #666" }} />
              ))}
            </div>
            <div style={{ textAlign: "center", color: "#fff", marginTop: 8, fontSize: 14 }}>{currentPhotoIndex + 1} / {showPhotoModal.length}</div>
            <button onClick={() => setShowPhotoModal(null)} style={{ position: "absolute", top: -40, right: 0, background: "none", border: "none", color: "#fff", fontSize: 30, cursor: "pointer" }}>✕</button>
          </div>
        </div>
      )}

      {/* 홍보글 모달 */}
      {showPromoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }} onClick={() => setShowPromoModal(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "90%", maxWidth: 500, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
              {showPromoModal.platform === "jungonara" ? "중고나라" : "블로그"} 홍보글
              <span style={{ fontSize: 12, color: "#666", fontWeight: 400 }}>AI 자동생성</span>
            </h3>
            
            {getPhotoUrls(showPromoModal.item).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#666" }}>첨부할 사진 ({getPhotoUrls(showPromoModal.item).length}장)</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {getPhotoUrls(showPromoModal.item).map((url, idx) => (
                    <img key={idx} src={url} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 4 }} />
                  ))}
                </div>
              </div>
            )}
            
            {promoLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#666" }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>✨</div>
                AI가 홍보글을 작성하고 있습니다...
              </div>
            ) : (
              <textarea 
                value={promoText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPromoText(e.target.value)}
                style={{ width: "100%", height: 300, padding: 12, border: "1px solid #ddd", borderRadius: 8, fontSize: 13, lineHeight: 1.6, resize: "none", boxSizing: "border-box" }}
              />
            )}
            
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowPromoModal(null)} style={{ flex: 1, padding: 12, background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>닫기</button>
              <button onClick={regeneratePromo} disabled={promoLoading} style={{ padding: "12px 16px", background: "#6c757d", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", opacity: promoLoading ? 0.5 : 1 }}>🔄 재생성</button>
              <button onClick={copyPromoText} disabled={promoLoading || !promoText} style={{ flex: 1, padding: 12, background: showPromoModal.platform === "jungonara" ? "#06c755" : "#03c75a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", opacity: promoLoading || !promoText ? 0.5 : 1 }}>📋 복사하기</button>
            </div>
            
            <div style={{ marginTop: 12, textAlign: "center" }}>
              {showPromoModal.platform === "jungonara" ? (
                <a href="https://web.joongna.com/write" target="_blank" rel="noopener noreferrer" style={{ color: "#06c755", fontSize: 13 }}>→ 중고나라 글쓰기 바로가기</a>
              ) : (
                <a href="https://blog.naver.com/PostWriteForm.naver" target="_blank" rel="noopener noreferrer" style={{ color: "#03c75a", fontSize: 13 }}>→ 네이버 블로그 글쓰기 바로가기</a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 새 항목 추가 모달 */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }} onClick={() => setShowAddModal(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "90%", maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px 0" }}>새 재고 추가</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>내린날짜</label>
              <input type="date" value={newItem.contract_date} onChange={(e) => setNewItem({ ...newItem, contract_date: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 12 }}><label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>상태</label><select value={newItem.inventory_status} onChange={(e) => setNewItem({ ...newItem, inventory_status: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}><option value="작업지시완료">작업지시완료</option><option value="출고대기">출고대기</option><option value="찜">찜</option><option value="출고완료">출고완료</option></select></div>
            <div style={{ marginBottom: 12 }}><label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>타입</label><select value={newItem.container_type} onChange={(e) => setNewItem({ ...newItem, container_type: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}><option value="신품">신품</option><option value="중고">중고</option><option value="리스">리스</option></select></div>
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}><label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>도면번호 <span style={{ color: "#2e5b86", fontSize: 12 }}>(자동: {nextDrawingNo})</span></label><input value={newItem.drawing_no} onChange={(e) => setNewItem({ ...newItem, drawing_no: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} placeholder={String(nextDrawingNo)} /></div>
              <div style={{ width: 80 }}><label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>수량</label><input type="number" min={1} value={newItem.qty} onChange={(e) => setNewItem({ ...newItem, qty: Number(e.target.value) || 1 })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} /></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>규격 *</label><select value={newItem.spec} onChange={(e) => setNewItem({ ...newItem, spec: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, fontWeight: 700 }}>{SPEC_OPTIONS.map(spec => <option key={spec} value={spec}>{spec}</option>)}</select></div>
            <div style={{ marginBottom: 12 }}><label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>입금</label><select value={newItem.deposit_status} onChange={(e) => setNewItem({ ...newItem, deposit_status: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}><option value="">-</option><option value="대기">대기</option><option value="완료">완료</option><option value="계약금">계약금</option><option value="미입금">미입금</option></select></div>
            <div style={{ marginBottom: 16 }}><label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>발주처</label><input value={newItem.customer_name} onChange={(e) => setNewItem({ ...newItem, customer_name: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} placeholder="발주처 입력" /></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: 12, background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={handleAddNew} style={{ flex: 1, padding: 12, background: "#28a745", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
