// src/pages/InventoryPage.tsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../QuoteService";

type InventoryItem = {
  id?: string;
  quote_id: string;
  contract_date: string;
  drawing_no: string;
  spec: string;
  bank_account: string;
  tax_invoice: string;
  deposit_status: string;
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

// 규격 옵션
const SPEC_OPTIONS = ["3x3", "3x4", "3x6", "3x9"];


type DepositTabType = "all" | "paid" | "unpaid";

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const yy = year.slice(2);
  return `${yy}/${month}/${day} ${weekDays[date.getDay()]}`;
};

export default function InventoryPage({ 
  onBack,
  onNavigate 
}: { 
  onBack: () => void;
  onNavigate?: (view: string) => void;
}) {

   // ✅ 여기로 이동
  const [allQuotes, setAllQuotes] = useState<{
    quote_id: string;
    contract_date: string;
    drawing_no: string;
  }[]>([]);
  
  const [allItems, setAllItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [depositTab, setDepositTab] = useState<DepositTabType>("all");
  
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
  
  // ✅ inventory와 quotes 둘 다 조회
  const [inventoryRes, quotesRes] = await Promise.all([
    supabase.from("inventory").select("*"),
    supabase.from("quotes").select("quote_id, contract_date, drawing_no").eq("status", "confirmed")
  ]);
    
  if (inventoryRes.error) console.error("Inventory load error:", inventoryRes.error);
  if (quotesRes.error) console.error("Quotes load error:", quotesRes.error);
  
  if (inventoryRes.data) {
    const sorted = [...inventoryRes.data].sort((a, b) => {
      const dateA = a.contract_date || "";
      const dateB = b.contract_date || "";
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      const numA = Number(a.drawing_no) || 0;
      const numB = Number(b.drawing_no) || 0;
      return numB - numA;
    });
    setAllItems(sorted as InventoryItem[]);
  }
  
  setAllQuotes(quotesRes.data || []);
  setLoading(false);
};

  useEffect(() => {
    loadInventory();
  }, []);

  // ✅ 규격 정규화 함수
  const normalizeSpec = (spec: string) => {
    if (!spec) return null;
    const s = spec.toLowerCase().replace(/\s/g, "").replace("*", "x");
    if (s.includes("3x6")) return "3x6";
    if (s.includes("3x9")) return "3x9";
    if (s.includes("3x3")) return "3x3";
    if (s.includes("3x4")) return "3x4";
    if (s.includes("2x3")) return "2x3";
    if (s.includes("4x9")) return "4x9";
    return null;
  };

  // ✅ 탭별 필터링
  const filteredItems = useMemo(() => {
    if (depositTab === "all") return allItems;
    if (depositTab === "paid") return allItems.filter(item => item.deposit_status === "완료");
    if (depositTab === "unpaid") return allItems.filter(item => item.deposit_status !== "완료" && item.deposit_status !== "대기");
    return allItems;
  }, [allItems, depositTab]);

  // ✅ 탭별 카운트
  const paidCount = useMemo(() => allItems.filter(item => item.deposit_status === "완료").length, [allItems]);
  const unpaidCount = useMemo(() => allItems.filter(item => item.deposit_status !== "완료" && item.deposit_status !== "대기").length, [allItems]);

  // ✅ 작업지시완료 완료 카운트 (규격별)
  const completedCounts = useMemo(() => {
    const counts: { [key: string]: number } = { "3x3": 0, "3x4": 0, "3x6": 0, "3x9": 0 };
    allItems
    .filter(item => item.inventory_status === "작업지시완료완료")
      .forEach(item => {
        const specKey = normalizeSpec(item.spec);
        if (specKey && specKey in counts) {
          counts[specKey]++;
        }
      });
    return counts;
  }, [allItems]);

// ✅ 현재 월의 다음 도면번호 계산 (inventory + quotes 통합)
const nextDrawingNo = useMemo(() => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // inventory에서 이번 달 도면번호
  const inventoryNumbers = allItems
    .filter(item => {
      if (!item.contract_date) return false;
      const d = new Date(item.contract_date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .map(item => parseInt(item.drawing_no) || 0);

  // quotes에서 이번 달 도면번호
  const quotesNumbers = allQuotes
    .filter(item => {
      if (!item.contract_date) return false;
      const d = new Date(item.contract_date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .map(item => parseInt(item.drawing_no) || 0);

  // 통합
  const allNumbers = [...inventoryNumbers, ...quotesNumbers].filter(n => n > 0);
  const maxNo = allNumbers.length > 0 ? Math.max(...allNumbers) : 0;
  
  return maxNo + 1;
}, [allItems, allQuotes]);

const currentMonthLabel = `${new Date().getMonth() + 1}월`;
  
  // ✅ 출고대기 항목
  const waitingItems = useMemo(() => {
   return allItems.filter(item => item.inventory_status === "출고대기");
  }, [allItems]);

  const waitingBySpec = useMemo(() => {
    const grouped: { [key: string]: number } = {};
    waitingItems.forEach(item => {
      const spec = normalizeSpec(item.spec) || item.spec || "미정";
      grouped[spec] = (grouped[spec] || 0) + 1;
    });
    return grouped;
  }, [waitingItems]);

  // ✅ 업데이트
  const updateField = async (quote_id: string, field: string, value: any) => {
    const { error } = await supabase
      .from("inventory")
      .update({ [field]: value })
      .eq("quote_id", quote_id);

    if (error) {
      console.error("Update error:", error);
      alert(`업데이트 실패: ${error.message}`);
      return;
    }

    setAllItems(prev => prev.map(c =>
      c.quote_id === quote_id ? { ...c, [field]: value } : c
    ));
  };

  // ✅ 구분 클릭 시 해당 항목을 quotes 테이블로 이동
  const handleMoveToContract = async (item: InventoryItem, targetType: string) => {
    const typeName = targetType === "order" ? "수주" : "영업소";
    if (!confirm(`이 항목을 계약견적 "${typeName}"으로 이동하시겠습니까?`)) return;
    
    const newQuoteId = `${item.quote_id}_${targetType}_${Date.now()}`;
    
    // ✅ 기존 옵션 앞에 "재고" 추가
    const existingOptions = item.items && item.items.length > 0 
      ? item.items.map((i: any) => i.displayName || i.optionName || "").filter(Boolean).join(", ")
      : "";
    const newItems = existingOptions 
      ? [{ displayName: `재고, ${existingOptions}` }]
      : [{ displayName: "재고" }];

    const { error: insertError } = await supabase.from("quotes").insert({
      quote_id: newQuoteId,
      status: "confirmed",
      contract_type: targetType,
      contract_date: item.contract_date,
      drawing_no: item.drawing_no,
      spec: item.spec,
      customer_name: item.customer_name,
      interior: item.interior,
      delivery_date: item.delivery_date,
      total_amount: item.total_amount,
      items: newItems,  // ✅ "재고" 포함된 옵션
      deposit_status: item.deposit_status || "",
      bank_account: item.bank_account || "",
      tax_invoice: item.tax_invoice || "",
      depositor: item.depositor || "",
      source: "inventory",
    });
    
    if (insertError) {
      alert("이동 실패: " + insertError.message);
      return;
    }
    
    await supabase
      .from("inventory")
      .update({ 
        inventory_status: "출고완료",
        interior: `${item.interior || ""} [${typeName}이동]`.trim()
      })
      .eq("quote_id", item.quote_id);
      
    alert(`계약견적 "${typeName}"으로 이동 완료!`);
    loadInventory();
  };
    
const handleAddNew = async () => {
  if (!newItem.spec) {
    alert("규격을 선택해주세요.");
    return;
  }

  const qty = newItem.qty || 1;
  
  // 도면번호 시작점 결정
  let startNo: number;
  if (newItem.drawing_no) {
    // 직접 입력한 경우 그 번호부터 시작
    startNo = parseInt(newItem.drawing_no) || nextDrawingNo;
  } else {
    // 비워둔 경우 자동 번호
    startNo = nextDrawingNo;
  }

  const inserts = [];
  for (let i = 0; i < qty; i++) {
    inserts.push({
      quote_id: `INV_${Date.now()}_${i}`,
      contract_date: newItem.contract_date,
      drawing_no: String(startNo + i),  // ✅ 27, 28, 29, 30...
      customer_name: newItem.customer_name,
      spec: newItem.spec,
      inventory_status: newItem.inventory_status,
      container_type: newItem.container_type,
      total_amount: newItem.total_amount,
      deposit_status: newItem.deposit_status,
      items: [],
    });
  }

  const { error } = await supabase.from("inventory").insert(inserts);

  if (error) {
    alert("추가 실패: " + error.message);
    return;
  }

  setShowAddModal(false);
  setNewItem({ 
    customer_name: "", 
    spec: "3x6", 
    inventory_status: "작업지시완료완료", 
    container_type: "신품",
    contract_date: new Date().toISOString().slice(0, 10),
    total_amount: 0,
    qty: 1,
    deposit_status: "",
    drawing_no: "",
  });
  loadInventory();
};

  const handleDelete = async (quote_id: string, spec: string) => {
  if (!confirm(`"${spec}" 항목을 삭제하시겠습니까?`)) return;

  const { error } = await supabase
    .from("inventory")
    .delete()
    .eq("quote_id", quote_id);

  if (error) {
    alert("삭제 실패: " + error.message);
    return;
  }

  loadInventory();
};



  const thStyle: React.CSSProperties = {
    padding: "10px 8px",
    border: "1px solid #1e4a6e",
    whiteSpace: "nowrap",
    backgroundColor: "#2e5b86",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 13,
    textAlign: "center",
  };
  
const getStatusColor = (status: string) => {
  switch (status) {
    case "작업지시완료완료": return "#28a745";
    case "출고대기": return "#ffc107";
    case "찜": return "#e91e63";  // 핑크색
    case "출고완료": return "#6c757d";
    default: return "#17a2b8";
  }
};

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: "12px 24px",
    border: "none",
    borderBottom: isActive ? "3px solid #2e5b86" : "3px solid transparent",
    background: isActive ? "#fff" : "#f5f5f5",
    color: isActive ? "#2e5b86" : "#666",
    fontWeight: isActive ? 800 : 500,
    fontSize: 14,
    cursor: "pointer",
    transition: "all 0.2s",
  });

  return (
    <div style={{ padding: 16, background: "#f6f7fb", minHeight: "100vh" }}>
      <style>{`
        .inventory-table th {
          background-color: #2e5b86 !important;
          color: #ffffff !important;
          font-weight: 700 !important;
        }
      `}</style>

      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
          📦 재고현황
          <span style={{ fontSize: 12, fontWeight: 400, color: "#666", marginLeft: 8 }}>
            (총 {allItems.length}건)
          </span>
        </h2>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: "8px 16px",
            background: "#28a745",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + 새 항목 추가
        </button>
      </div>

    {/* ✅ 요약 카드 영역 */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
        gap: 16, 
        marginBottom: 20 
      }}>
        {/* 작업지시완료 완료 카드 */}
        <div style={{
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          border: "1px solid #e5e7eb",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
        }}>
          <div style={{ 
            fontSize: 14, 
            fontWeight: 800, 
            color: "#28a745", 
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 8
          }}>
            ✅ 작업지시완료 완료
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {["3x3", "3x4", "3x6", "3x9"].map(spec => (
              <div 
                key={spec}
                style={{ 
                  background: "#f0f9f0", 
                  padding: "10px 16px", 
                  borderRadius: 8,
                  textAlign: "center",
                  minWidth: 60
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 900, color: "#28a745" }}>
                  {completedCounts[spec] || 0}
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>{spec}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 출고 가능 카드 */}
        <div style={{
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          border: "1px solid #e5e7eb",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
        }}>
          <div style={{ 
            fontSize: 14, 
            fontWeight: 800, 
            color: "#ffc107", 
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 8
          }}>
            🚚 출고 가능 (출고대기)
            <span style={{ 
              background: "#ffc107", 
              color: "#000", 
              padding: "2px 8px", 
              borderRadius: 10, 
              fontSize: 12,
              fontWeight: 700
            }}>
              {waitingItems.length}대
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {["3x3", "3x4", "3x6", "3x9"].map(spec => (
              <div 
                key={spec}
                style={{ 
                  background: "#fffbeb", 
                  padding: "10px 16px", 
                  borderRadius: 8,
                  textAlign: "center",
                  minWidth: 60
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 900, color: "#f59e0b" }}>
                  {waitingBySpec[spec] || 0}
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>{spec}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ✅ 입금 탭 버튼 */}
      {/* ✅ 입금 탭 버튼 */}
      <div style={{
        display: "flex",
        background: "#fff",
        borderRadius: "12px 12px 0 0",
        border: "1px solid #e5e7eb",
        borderBottom: "none",
        overflow: "hidden"
      }}>
        <button
          style={tabStyle(depositTab === "all")}
          onClick={() => setDepositTab("all")}
        >
          📋 전체 ({allItems.length})
        </button>
        <button
          style={tabStyle(depositTab === "paid")}
          onClick={() => setDepositTab("paid")}
        >
          ✅ 입금완료 ({paidCount})
        </button>
        <button
          style={{
            ...tabStyle(depositTab === "unpaid"),
            color: depositTab === "unpaid" ? "#dc3545" : "#666",
            borderBottomColor: depositTab === "unpaid" ? "#dc3545" : "transparent",
          }}
          onClick={() => setDepositTab("unpaid")}
        >
          ❌ 미입금 ({unpaidCount})
        </button>
      </div>

      {/* ✅ 재고 리스트 테이블 */}
      <div style={{
        background: "#fff",
        borderRadius: "0 0 12px 12px",
        border: "1px solid #e5e7eb",
        borderTop: "none",
        overflow: "hidden"
      }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>로딩 중...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
            {depositTab === "all" && "재고 데이터가 없습니다."}
            {depositTab === "paid" && "입금완료 항목이 없습니다."}
            {depositTab === "unpaid" && "미입금 항목이 없습니다."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="inventory-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>상태</th>
                  <th style={thStyle}>구분</th>
                  <th style={thStyle}>타입</th>
                  <th style={thStyle}>등록일</th>
                  <th style={thStyle}>규격</th>
                  <th style={thStyle}>발주처</th>
                  <th style={thStyle}>도면번호</th>
                  <th style={thStyle}>입금</th>
                  <th style={thStyle}>메모</th>
                  <th style={thStyle}>출고일</th>
                  <th style={thStyle}>삭제</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                 const isCompleted = item.inventory_status === "출고완료" || item.inventory_status === "찜";
                 const isUnpaid = item.deposit_status !== "완료" && item.deposit_status !== "대기";
                  
                  return (
                    <tr
                      key={item.quote_id}
                      style={{
                        background: isCompleted ? "#f0f0f0" : "#fff",
                        opacity: isCompleted ? 0.6 : 1,
                        borderBottom: "1px solid #eee",
                        outline: isUnpaid && !isCompleted ? "2px solid #dc3545" : "none",
                        outlineOffset: "-1px",
                      }}
                    >
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <select
                          value={item.inventory_status || "작업지시완료"}
                          onChange={(e) => updateField(item.quote_id, "inventory_status", e.target.value)}
                          style={{ 
                            padding: 4, 
                            border: "1px solid #ddd", 
                            borderRadius: 4, 
                            fontSize: 11,
                            background: getStatusColor(item.inventory_status || "작업지시완료"),
                            color: item.inventory_status === "출고대기" ? "#000" : "#fff",
                            fontWeight: 700
                          }}
                        >
                          <option value="작업지시완료">작업지시완료</option>
                          <option value="출고대기">출고대기</option>
                          <option value="찜">찜</option>
                          <option value="출고완료">출고완료</option>
                        </select>
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button
                            onClick={() => handleMoveToContract(item, "order")}
                            style={{
                              padding: "4px 6px",
                              background: "#2e5b86",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              fontSize: 10,
                              cursor: "pointer",
                              fontWeight: 600
                            }}
                            title="수주로 이동"
                          >
                            →수주
                          </button>
                          <button
                            onClick={() => handleMoveToContract(item, "branch")}
                            style={{
                              padding: "4px 6px",
                              background: "#6f42c1",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              fontSize: 10,
                              cursor: "pointer",
                              fontWeight: 600
                            }}
                            title="영업소로 이동"
                          >
                            →영업소
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <select
                          value={item.container_type || "신품"}
                          onChange={(e) => updateField(item.quote_id, "container_type", e.target.value)}
                          style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}
                        >
                          <option value="신품">신품</option>
                          <option value="중고">중고</option>
                          <option value="리스">리스</option>
                        </select>
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                          <span style={{ fontWeight: 600, fontSize: 12 }}>
                            {formatDateDisplay(item.contract_date)}
                          </span>
                          <input
                            type="date"
                            value={item.contract_date || ""}
                            onChange={(e) => updateField(item.quote_id, "contract_date", e.target.value)}
                            style={{ 
                              width: 18, 
                              padding: 0, 
                              border: "none", 
                              background: "transparent",
                              cursor: "pointer",
                              opacity: 0.5
                            }}
                            title="날짜 변경"
                          />
                        </div>
                      </td>
                    
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <select
                          value={normalizeSpec(item.spec) || item.spec || "3x6"}
                          onChange={(e) => updateField(item.quote_id, "spec", e.target.value)}
                          style={{ 
                            padding: 4, 
                            border: "1px solid #ddd", 
                            borderRadius: 4, 
                            fontSize: 12,
                            fontWeight: 700
                          }}
                        >
                          {SPEC_OPTIONS.map(spec => (
                            <option key={spec} value={spec}>{spec}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee" }}>
                        <input
                          key={item.quote_id + "_customer"}
                          defaultValue={item.customer_name || ""}
                          onBlur={(e) => updateField(item.quote_id, "customer_name", e.target.value)}
                          style={{ width: 80, padding: 4, border: "1px solid #ddd", borderRadius: 4 }}
                          placeholder="발주처"
                        />
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <input
                          key={item.quote_id + "_drawing"}
                          defaultValue={item.drawing_no || ""}
                          onBlur={(e) => {
                            const val = e.target.value.replace(/\D/g, "").slice(0, 3);
                            if (val && val !== item.drawing_no) {
                              updateField(item.quote_id, "drawing_no", val);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          style={{ 
                            width: 40, 
                            padding: 4, 
                            border: "1px solid #ddd", 
                            borderRadius: 4, 
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: 14
                          }}
                          placeholder="-"
                        />
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <select
                          value={item.deposit_status || ""}
                          onChange={(e) => updateField(item.quote_id, "deposit_status", e.target.value)}
                          style={{ 
                            padding: 4, 
                            border: "1px solid #ddd", 
                            borderRadius: 4, 
                            fontSize: 11,
                            background: item.deposit_status === "완료" ? "#28a745" : (item.deposit_status ? "#ffc107" : "#fff"),
                            color: item.deposit_status === "완료" ? "#fff" : "#000",
                            fontWeight: 600
                          }}
                        >
                         <option value="">-</option>
<option value="대기">대기</option>
<option value="완료">완료</option>
<option value="계약금">계약금</option>
<option value="미입금">미입금</option>
                        </select>
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee" }}>
                        <input
                          key={item.quote_id + "_interior"}
                          defaultValue={item.interior || ""}
                          onBlur={(e) => updateField(item.quote_id, "interior", e.target.value)}
                          style={{ width: 120, padding: 4, border: "1px solid #ddd", borderRadius: 4 }}
                          placeholder="메모"
                        />
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee" }}>
                        <input
                          type="date"
                          value={item.delivery_date || ""}
                          onChange={(e) => updateField(item.quote_id, "delivery_date", e.target.value)}
                          style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}
                        />
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <button
                          onClick={() => handleDelete(item.quote_id, item.spec)}
                          style={{
                            padding: "4px 8px",
                            background: "#dc3545",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 새 항목 추가 모달 */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 400,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0" }}>새 재고 추가</h3>

           

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>상태</label>
              <select
                value={newItem.inventory_status}
                onChange={(e) => setNewItem({ ...newItem, inventory_status: e.target.value })}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              >
                <option value="작업지시완료">작업지시완료</option>
                <option value="출고대기">출고대기</option>
                <option value="찜">찜</option>
                <option value="출고완료">출고완료</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>타입</label>
              <select
                value={newItem.container_type}
                onChange={(e) => setNewItem({ ...newItem, container_type: e.target.value })}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              >
                <option value="신품">신품</option>
                <option value="중고">중고</option>
                <option value="리스">리스</option>
              </select>
            </div>
<div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
  <div style={{ flex: 1 }}>
    <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
      도면번호
      <span style={{ color: "#2e5b86", fontWeight: 700, fontSize: 12 }}>
        {" "}(자동: {nextDrawingNo} ~ {nextDrawingNo + (newItem.qty || 1) - 1}번)
      </span>
    </label>
    <input
      value={newItem.drawing_no || ""}
      onChange={(e) => setNewItem({ ...newItem, drawing_no: e.target.value })}
      style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
      placeholder={String(nextDrawingNo)}
    />
  </div>
  <div style={{ width: 80 }}>
    <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>수량</label>
    <input
      type="number"
      min={1}
      max={20}
      value={newItem.qty}
      onChange={(e) => setNewItem({ ...newItem, qty: Number(e.target.value) || 1 })}
      style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
    />
  </div>
</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>규격 *</label>
              <select
                value={newItem.spec}
                onChange={(e) => setNewItem({ ...newItem, spec: e.target.value })}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, fontWeight: 700 }}
              >
                {SPEC_OPTIONS.map(spec => (
                  <option key={spec} value={spec}>{spec}</option>
                ))}
              </select>
            </div>
            
<div style={{ marginBottom: 12 }}>
  <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>입금</label>
  <select
    value={newItem.deposit_status}
    onChange={(e) => setNewItem({ ...newItem, deposit_status: e.target.value })}
    style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
  >
    <option value="">-</option>
    <option value="대기">대기</option>
    <option value="완료">완료</option>
    <option value="계약금">계약금</option>
    <option value="미입금">미입금</option>
  </select>
</div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>발주처</label>
              <input
                value={newItem.customer_name}
                onChange={(e) => setNewItem({ ...newItem, customer_name: e.target.value })}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                placeholder="발주처 입력"
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#f5f5f5",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleAddNew}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#28a745",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
