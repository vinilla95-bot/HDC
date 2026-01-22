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

type UsedInventoryItem = {
  id: string;
  item_number: number;
  spec: string;
  quantity: number;
  condition: string;
  price: number;
  note: string;
  photo_url: string;
  status: string;
  created_at: string;
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
  const [mainTab, setMainTab] = useState<MainTabType>("new");
  
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
    if (depositTab === "all") return allItems;
    if (depositTab === "paid") return allItems.filter(item => item.deposit_status === "완료");
    if (depositTab === "unpaid") return allItems.filter(item => item.deposit_status !== "완료" && item.deposit_status !== "대기");
    return allItems;
  }, [allItems, depositTab]);

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
    setNewItem({ customer_name: "", spec: "3x6", inventory_status: "작업지시완료", container_type: "신품", contract_date: new Date().toISOString().slice(0, 10), total_amount: 0, qty: 1, deposit_status: "", drawing_no: "" });
    loadInventory();
  };

  const handleDelete = async (quote_id: string, spec: string) => {
    if (!confirm(`"${spec}" 항목을 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from("inventory").delete().eq("quote_id", quote_id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    loadInventory();
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
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>📦 재고현황 <span style={{ fontSize: 12, fontWeight: 400, color: "#666", marginLeft: 8 }}>(총 {allItems.length + usedItems.length}건)</span></h2>
        {mainTab === "new" && <button onClick={() => setShowAddModal(true)} style={{ padding: "8px 16px", background: "#28a745", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>+ 새 항목 추가</button>}
      </div>

      {/* 메인 탭 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setMainTab("new")} style={{ padding: "12px 24px", background: mainTab === "new" ? "#2e5b86" : "#e5e7eb", color: mainTab === "new" ? "#fff" : "#666", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>📦 신품 재고 ({allItems.length})</button>
        <button onClick={() => setMainTab("used")} style={{ padding: "12px 24px", background: mainTab === "used" ? "#f59e0b" : "#e5e7eb", color: mainTab === "used" ? "#fff" : "#666", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>🏷️ 중고 재고 ({usedItems.length})</button>
      </div>

      {/* 신품 재고 */}
      {mainTab === "new" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#28a745", marginBottom: 12 }}>✅ 작업지시완료</div>
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
              <div style={{ fontSize: 14, fontWeight: 800, color: "#ffc107", marginBottom: 12 }}>🚚 출고대기 <span style={{ background: "#ffc107", color: "#000", padding: "2px 8px", borderRadius: 10, fontSize: 12 }}>{waitingItems.length}대</span></div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {["3x3", "3x4", "3x6", "3x9"].map(spec => (
                  <div key={spec} style={{ background: "#fffbeb", padding: "10px 16px", borderRadius: 8, textAlign: "center", minWidth: 60 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#f59e0b" }}>{waitingBySpec[spec] || 0}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{spec}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", background: "#fff", borderRadius: "12px 12px 0 0", border: "1px solid #e5e7eb", borderBottom: "none" }}>
            <button style={tabStyle(depositTab === "all")} onClick={() => setDepositTab("all")}>📋 전체 ({allItems.length})</button>
            <button style={tabStyle(depositTab === "paid")} onClick={() => setDepositTab("paid")}>✅ 입금완료 ({paidCount})</button>
            <button style={{ ...tabStyle(depositTab === "unpaid"), color: depositTab === "unpaid" ? "#dc3545" : "#666" }} onClick={() => setDepositTab("unpaid")}>❌ 미입금 ({unpaidCount})</button>
          </div>

          <div style={{ background: "#fff", borderRadius: "0 0 12px 12px", border: "1px solid #e5e7eb", borderTop: "none", overflow: "hidden" }}>
            {loading ? <div style={{ textAlign: "center", padding: 40 }}>로딩 중...</div> : filteredItems.length === 0 ? <div style={{ textAlign: "center", padding: 40 }}>재고 없음</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr>
                    <th style={thStyle}>상태</th><th style={thStyle}>구분</th><th style={thStyle}>타입</th><th style={thStyle}>등록일</th><th style={thStyle}>규격</th><th style={thStyle}>발주처</th><th style={thStyle}>도면번호</th><th style={thStyle}>입금</th><th style={thStyle}>메모</th><th style={thStyle}>출고일</th><th style={thStyle}>삭제</th>
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
                            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                              <button onClick={() => handleMoveToContract(item, "order")} style={{ padding: "4px 6px", background: "#2e5b86", color: "#fff", border: "none", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>→수주</button>
                              <button onClick={() => handleMoveToContract(item, "branch")} style={{ padding: "4px 6px", background: "#6f42c1", color: "#fff", border: "none", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>→영업소</button>
                            </div>
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

      {/* 중고 재고 */}
      {mainTab === "used" && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          {loading ? <div style={{ textAlign: "center", padding: 40 }}>로딩 중...</div> : usedItems.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#888" }}>중고 재고가 없습니다.<br/>앱에서 등록해주세요.</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr>
                  <th style={thStyle}>번호</th><th style={thStyle}>사진</th><th style={thStyle}>규격</th><th style={thStyle}>수량</th><th style={thStyle}>상태</th><th style={thStyle}>가격</th><th style={thStyle}>특이사항</th><th style={thStyle}>등록일</th><th style={thStyle}>판매</th><th style={thStyle}>삭제</th>
                </tr></thead>
                <tbody>
                  {usedItems.map((item) => (
                    <tr key={item.id}>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center", fontWeight: 700 }}>{item.item_number || "-"}</td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        {item.photo_url ? <a href={item.photo_url} target="_blank" rel="noopener noreferrer"><img src={item.photo_url} alt="" style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 4 }} /></a> : "-"}
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center", fontWeight: 700 }}>{item.spec}</td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>{item.quantity}</td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <span style={{ padding: "4px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: item.condition === "A급" ? "#28a745" : item.condition === "B급" ? "#ffc107" : "#dc3545", color: item.condition === "B급" ? "#000" : "#fff" }}>{item.condition}</span>
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>{item.price ? `${item.price}만원` : "-"}</td>
                      <td style={{ padding: 8, border: "1px solid #eee" }}>{item.note || "-"}</td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center", fontSize: 11 }}>{item.created_at ? new Date(item.created_at).toLocaleDateString() : "-"}</td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <select value={item.status || "판매중"} onChange={async (e) => { await supabase.from("used_inventory").update({ status: e.target.value }).eq("id", item.id); loadInventory(); }} style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11, background: item.status === "판매완료" ? "#6c757d" : "#28a745", color: "#fff" }}>
                          <option value="판매중">판매중</option><option value="판매완료">판매완료</option>
                        </select>
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <button onClick={async () => { if (!confirm("삭제?")) return; await supabase.from("used_inventory").delete().eq("id", item.id); loadInventory(); }} style={{ padding: "4px 8px", background: "#dc3545", color: "#fff", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 모달 */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }} onClick={() => setShowAddModal(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "90%", maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px 0" }}>새 재고 추가</h3>
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
