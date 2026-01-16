// src/pages/ContractListPage.tsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../QuoteService";

type ContractQuote = {
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
  steel_paint: boolean;
  interior: string;
  depositor: string;
  delivery_date: string;
  total_amount: number;
  contract_type: string;
  container_type: string;
};

type TabType = "order" | "branch" | "used" | "rental";

// 규격 옵션
const SPEC_OPTIONS = ["3x3", "3x4", "3x6", "3x9"];

export default function ContractListPage({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<TabType>("order");
  const [allContracts, setAllContracts] = useState<ContractQuote[]>([]);
  const [allInventory, setAllInventory] = useState<{quote_id: string; contract_date: string; drawing_no: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<ContractQuote | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // ✅ 모든 컬럼 입력 가능한 새 항목 양식
  const [newItem, setNewItem] = useState({
    contract_type: "order" as TabType,
    contract_date: new Date().toISOString().slice(0, 10),
    drawing_no: "",
    spec: "3x6",
    bank_account: "",
    tax_invoice: "",
    deposit_status: "",
    customer_name: "",
    options: "",
    special_order: false,
    interior: "",
    depositor: "",
    delivery_date: "",
    qty: 1,
  });

  // ✅ 현재 월의 다음 도면번호 계산 (quotes + inventory 통합)
  const nextDrawingNo = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // quotes에서 이번 달 도면번호
    const quotesNumbers = allContracts
      .filter(c => {
        if (!c.contract_date) return false;
        const d = new Date(c.contract_date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .map(c => parseInt(c.drawing_no) || 0);

    // inventory에서 이번 달 도면번호
    const inventoryNumbers = allInventory
      .filter(c => {
        if (!c.contract_date) return false;
        const d = new Date(c.contract_date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .map(c => parseInt(c.drawing_no) || 0);

    // ✅ 통합
    const allNumbers = [...quotesNumbers, ...inventoryNumbers].filter(n => n > 0);
    const maxNo = allNumbers.length > 0 ? Math.max(...allNumbers) : 0;
    
    return maxNo + 1;
  }, [allContracts, allInventory]);

  const loadContracts = async () => {
    setLoading(true);
    
    // ✅ quotes와 inventory 둘 다 조회
    const [quotesRes, inventoryRes] = await Promise.all([
      supabase.from("quotes").select("*").eq("status", "confirmed"),
      supabase.from("inventory").select("quote_id, contract_date, drawing_no")
    ]);

    if (quotesRes.error) console.error("Quotes load error:", quotesRes.error);
    if (inventoryRes.error) console.error("Inventory load error:", inventoryRes.error);

    const quotesData = quotesRes.data || [];
    const inventoryData = inventoryRes.data || [];

    // ✅ 정렬 (날짜 내림차순 → 도면번호 내림차순)
    const sorted = [...quotesData].sort((a, b) => {
      const dateA = a.contract_date || "";
      const dateB = b.contract_date || "";
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      const numA = Number(a.drawing_no) || 0;
      const numB = Number(b.drawing_no) || 0;
      return numB - numA;
    });

    setAllContracts(sorted as ContractQuote[]);
    setAllInventory(inventoryData);
    setLoading(false);
  };

  useEffect(() => {
    loadContracts();
  }, []);

  // ✅ 탭별 데이터 필터링
  const contracts = useMemo(() => {
    return allContracts.filter(c => {
      const type = c.contract_type || "order";
      return type === activeTab;
    });
  }, [allContracts, activeTab]);

  // ✅ 업데이트
  const updateField = async (quote_id: string, field: string, value: any) => {
    const { error } = await supabase
      .from("quotes")
      .update({ [field]: value })
      .eq("quote_id", quote_id);

    if (error) {
      console.error("Update error:", error);
      alert(`업데이트 실패: ${error.message}`);
      return;
    }

    setAllContracts(prev => prev.map(c =>
      c.quote_id === quote_id ? { ...c, [field]: value } : c
    ));
  };

  // ✅ 도면번호 자동 입력
  const autoFillDrawingNo = (quote_id: string) => {
    updateField(quote_id, "drawing_no", String(nextDrawingNo));
  };

  // ✅ 새 항목 추가
  const handleAddNew = async () => {
    const qty = newItem.qty || 1;
    
    // 같은 월의 최대 도면번호 찾기 (quotes + inventory 통합)
    const [year, month] = newItem.contract_date.split("-");
    
    const quotesMonthItems = allContracts.filter(item => {
      const [y, m] = (item.contract_date || "").split("-");
      return y === year && m === month;
    });
    
    const inventoryMonthItems = allInventory.filter(item => {
      const [y, m] = (item.contract_date || "").split("-");
      return y === year && m === month;
    });
    
    const allMonthNumbers = [
      ...quotesMonthItems.map(item => Number(item.drawing_no) || 0),
      ...inventoryMonthItems.map(item => Number(item.drawing_no) || 0)
    ];
    
    const maxNo = allMonthNumbers.length > 0 ? Math.max(...allMonthNumbers) : 0;

    // 여러 개 추가
    const inserts = [];
    for (let i = 0; i < qty; i++) {
      inserts.push({
        quote_id: `${newItem.contract_type.toUpperCase()}_${Date.now()}_${i}`,
        status: "confirmed",
        contract_type: newItem.contract_type,
        contract_date: newItem.contract_date,
        drawing_no: newItem.drawing_no || String(maxNo + 1 + i),
        spec: newItem.spec,
        bank_account: newItem.bank_account,
        tax_invoice: newItem.tax_invoice,
        deposit_status: newItem.deposit_status,
        customer_name: newItem.customer_name,
        items: newItem.options ? [{ displayName: newItem.options }] : [],
        special_order: newItem.special_order,
        interior: newItem.interior,
        depositor: newItem.depositor,
        delivery_date: newItem.delivery_date || null,
        total_amount: 0,
        source: "contract",
      });
    }

    const { error } = await supabase.from("quotes").insert(inserts);

    if (error) {
      alert("추가 실패: " + error.message);
      return;
    }

    setShowAddModal(false);
    setNewItem({
      contract_type: activeTab,
      contract_date: new Date().toISOString().slice(0, 10),
      drawing_no: "",
      spec: "3x6",
      bank_account: "",
      tax_invoice: "",
      deposit_status: "",
      customer_name: "",
      options: "",
      special_order: false,
      interior: "",
      depositor: "",
      delivery_date: "",
      qty: 1,
    });
    loadContracts();
  };

  // ✅ 삭제
  const handleDelete = async (quote_id: string, customer_name: string) => {
    if (!confirm(`"${customer_name}" 항목을 삭제하시겠습니까?`)) return;

    const { error } = await supabase
      .from("quotes")
      .delete()
      .eq("quote_id", quote_id);

    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }

    loadContracts();
  };

  const fmt = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

  // ✅ 행 상태 판단 함수
  const getRowStatus = (c: ContractQuote) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const isCompleted = c.deposit_status === "완료" && c.delivery_date && new Date(c.delivery_date) <= today;
    const isNotPaid = c.deposit_status !== "완료";
    
    return { isCompleted, isNotPaid };
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

  const renderTable = () => (
    <>
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>로딩 중...</div>
      ) : contracts.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
          {activeTab === "order" && "수주 데이터가 없습니다."}
          {activeTab === "branch" && "영업소 데이터가 없습니다."}
          {activeTab === "used" && "중고 데이터가 없습니다."}
          {activeTab === "rental" && "임대 데이터가 없습니다."} 
        </div>
      ) : (
        <div style={{ overflowX: "auto", background: "#fff", borderRadius: "0 0 12px 12px", border: "1px solid #e5e7eb", borderTop: "none" }}>
          <table className="contract-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>구분</th>
                <th style={thStyle}>내린날짜</th>
                <th style={thStyle}>도면번호</th>
                <th style={thStyle}>규격</th>
                <th style={thStyle}>계좌</th>
                <th style={thStyle}>세발</th>
                <th style={thStyle}>입금</th>
                <th style={thStyle}>발주처</th>
                <th style={{ ...thStyle, minWidth: 120 }}>옵션</th>
                <th style={thStyle}>특수</th>
                <th style={thStyle}>내장</th>
                <th style={thStyle}>입금자</th>
                <th style={thStyle}>출고일</th>
                <th style={thStyle}>보기</th>
                <th style={thStyle}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const { isCompleted, isNotPaid } = getRowStatus(c);
                
                let bgColor = "#fff";
                if (isCompleted) {
                  bgColor = "#d0d0d0";
                }
                
                return (
                  <tr
                    key={c.quote_id}
                    style={{
                      background: bgColor,
                      outline: isNotPaid && !isCompleted ? "2px solid #dc3545" : "none",
                      outlineOffset: "-1px",
                      opacity: isCompleted ? 0.6 : 1,
                    }}
                  >
                    <td style={{ padding: 8, border: "1px solid #eee" }}>
                      <select
                        value={c.contract_type || "order"}
                        onChange={(e) => updateField(c.quote_id, "contract_type", e.target.value)}
                        style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}
                      >
                        <option value="order">수주</option>
                        <option value="branch">영업소</option>
                        <option value="used">중고</option>
                        <option value="rental">임대</option> 
                      </select>
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                      <input
                        type="date"
                        value={c.contract_date || ""}
                        onChange={(e) => updateField(c.quote_id, "contract_date", e.target.value)}
                        style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}
                      />
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee" }}>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input
                          value={c.drawing_no || ""}
                          onChange={(e) => updateField(c.quote_id, "drawing_no", e.target.value)}
                          style={{ width: 40, padding: 4, border: "1px solid #ddd", borderRadius: 4, textAlign: "center" }}
                          placeholder={String(nextDrawingNo)}
                        />
                        {!c.drawing_no && (
                          <button
                            onClick={() => autoFillDrawingNo(c.quote_id)}
                            style={{
                              padding: "2px 6px",
                              background: "#2e5b86",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              fontSize: 10,
                              cursor: "pointer",
                            }}
                            title={`${nextDrawingNo}번 자동입력`}
                          >
                            {nextDrawingNo}
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                      <select
                        value={c.spec || ""}
                        onChange={(e) => updateField(c.quote_id, "spec", e.target.value)}
                        style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}
                      >
                        <option value="">-</option>
                        {SPEC_OPTIONS.map(spec => (
                          <option key={spec} value={spec}>{spec}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee" }}>
                      <select
                        value={c.bank_account || ""}
                        onChange={(e) => updateField(c.quote_id, "bank_account", e.target.value)}
                        style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}
                      >
                        <option value="">-</option>
                        <option value="현대">현대</option>
                        <option value="국민">국민</option>
                        <option value="기업">기업</option>
                        <option value="현금영수증">현금영수증</option>
                        <option value="현찰">현찰</option>
                      </select>
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee" }}>
                      <select
                        value={c.tax_invoice || ""}
                        onChange={(e) => updateField(c.quote_id, "tax_invoice", e.target.value)}
                        style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}
                      >
                        <option value="">-</option>
                        <option value="완료">완료</option>
                        <option value="계약금만">계약금만</option>
                        <option value="대기">대기</option>
                      </select>
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee" }}>
                      <select
                        value={c.deposit_status || ""}
                        onChange={(e) => updateField(c.quote_id, "deposit_status", e.target.value)}
                        style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}
                      >
                        <option value="">-</option>
                        <option value="완료">완료</option>
                        <option value="계약금">계약금</option>
                        <option value="미입금">미입금</option>
                      </select>
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee", fontWeight: 700 }}>
                      {activeTab === "branch" ? (
                        <select
                          value={c.customer_name || ""}
                          onChange={(e) => updateField(c.quote_id, "customer_name", e.target.value)}
                          style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11, fontWeight: 700 }}
                        >
                          <option value="">-</option>
                          <option value="라인">라인</option>
                          <option value="한진">한진</option>
                          <option value="한진더조은">한진더조은</option>
                          <option value="동부A">동부A</option>
                          <option value="동부B">동부B</option>
                          <option value="태광">태광</option>
                        </select>
                      ) : (
                        <input
                          value={c.customer_name || ""}
                          onChange={(e) => updateField(c.quote_id, "customer_name", e.target.value)}
                          style={{ width: 70, padding: 4, border: "1px solid #ddd", borderRadius: 4, fontWeight: 700 }}
                          placeholder="발주처"
                        />
                      )}
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee", fontSize: 11 }}>
  <input
    key={c.quote_id}
    defaultValue={c.items && c.items.length > 0 ? (c.items[0]?.displayName || c.items[0]?.optionName || "") : ""}
    onBlur={(e) => {
      const newItems = [{ displayName: e.target.value }];
      updateField(c.quote_id, "items", newItems);
    }}
    style={{ 
      width: "100%", 
      padding: 4, 
      border: "1px solid #ddd", 
      borderRadius: 4, 
      fontSize: 11,
      boxSizing: "border-box"
    }}
    placeholder="옵션 입력"
  />
</td>
                    <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={c.special_order || false}
                        onChange={(e) => updateField(c.quote_id, "special_order", e.target.checked)}
                      />
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee" }}>
                      <input
                        value={c.interior || ""}
                        onChange={(e) => updateField(c.quote_id, "interior", e.target.value)}
                        style={{ width: 35, padding: 4, border: "1px solid #ddd", borderRadius: 4, textAlign: "center" }}
                        placeholder="-"
                      />
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee" }}>
                      <input
                        value={c.depositor || ""}
                        onChange={(e) => updateField(c.quote_id, "depositor", e.target.value)}
                        style={{ width: 50, padding: 4, border: "1px solid #ddd", borderRadius: 4 }}
                        placeholder="입금자"
                      />
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee" }}>
                      <input
                        type="date"
                        value={c.delivery_date || ""}
                        onChange={(e) => updateField(c.quote_id, "delivery_date", e.target.value)}
                        style={{ padding: 4, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}
                      />
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                      <button
                        onClick={() => setSelectedQuote(c)}
                        style={{
                          padding: "4px 8px",
                          background: "#2e5b86",
                          color: "#fff",
                          border: "none",
                          borderRadius: 4,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        보기
                      </button>
                    </td>
                    <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                      <button
                        onClick={() => handleDelete(c.quote_id, c.customer_name)}
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
    </>
  );

  const orderCount = allContracts.filter(c => (c.contract_type || "order") === "order").length;
  const branchCount = allContracts.filter(c => c.contract_type === "branch").length;
  const usedCount = allContracts.filter(c => c.contract_type === "used").length;
  const rentalCount = allContracts.filter(c => c.contract_type === "rental").length; 

  const currentMonthLabel = (() => {
    const now = new Date();
    return `${now.getMonth() + 1}월`;
  })();

  // 모달 열 때 현재 탭으로 초기화
  const openAddModal = () => {
    setNewItem({
      contract_type: activeTab,
      contract_date: new Date().toISOString().slice(0, 10),
      drawing_no: "",
      spec: "3x6",
      bank_account: "",
      tax_invoice: "",
      deposit_status: "",
      customer_name: "",
      options: "",
      special_order: false,
      interior: "",
      depositor: "",
      delivery_date: "",
      qty: 1,
    });
    setShowAddModal(true);
  };

  return (
    <div style={{ padding: 16, background: "#f6f7fb", minHeight: "100vh" }}>
      <style>{`
        .contract-table th {
          background-color: #2e5b86 !important;
          color: #ffffff !important;
          font-weight: 700 !important;
        }
      `}</style>

      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
          계약관리
          <span style={{ fontSize: 12, fontWeight: 400, color: "#666", marginLeft: 8 }}>
            ({currentMonthLabel} 도면: {nextDrawingNo - 1}개)
          </span>
        </h2>
        <button
          onClick={openAddModal}
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

      {/* 탭 버튼 */}
      <div style={{
        display: "flex",
        background: "#fff",
        borderRadius: "12px 12px 0 0",
        border: "1px solid #e5e7eb",
        borderBottom: "none",
        overflow: "hidden"
      }}>
        <button
          style={tabStyle(activeTab === "order")}
          onClick={() => setActiveTab("order")}
        >
          📋 수주 ({orderCount})
        </button>
        <button
          style={tabStyle(activeTab === "branch")}
          onClick={() => setActiveTab("branch")}
        >
          🏢 영업소 ({branchCount})
        </button>
        <button
          style={tabStyle(activeTab === "used")}
          onClick={() => setActiveTab("used")}
        >
          📦 중고 ({usedCount})
        </button>
        <button
          style={tabStyle(activeTab === "rental")}
          onClick={() => setActiveTab("rental")}
        >
          🏠 임대 ({rentalCount})
        </button>
      </div>

      {/* 테이블 */}
      {renderTable()}

      {/* ✅ 새 항목 추가 모달 - 모든 컬럼 입력 가능 */}
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
              width: "95%",
              maxWidth: 500,
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0" }}>새 항목 추가</h3>

            {/* 구분 */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>구분</label>
              <select
                value={newItem.contract_type}
                onChange={(e) => setNewItem({ ...newItem, contract_type: e.target.value as TabType })}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              >
                <option value="order">수주</option>
                <option value="branch">영업소</option>
                <option value="used">중고</option>
                <option value="rental">임대</option>
              </select>
            </div>

            {/* 내린날짜 */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>내린날짜</label>
              <input
                type="date"
                value={newItem.contract_date}
                onChange={(e) => setNewItem({ ...newItem, contract_date: e.target.value })}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
              />
            </div>

            {/* 도면번호 + 수량 */}
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>
                  도면번호 
                  <span style={{ color: "#888", fontWeight: 400 }}>(비우면 자동: {nextDrawingNo})</span>
                </label>
                <input
                  value={newItem.drawing_no}
                  onChange={(e) => setNewItem({ ...newItem, drawing_no: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                  placeholder={String(nextDrawingNo)}
                />
              </div>
              <div style={{ width: 80 }}>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>수량</label>
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

            {/* 규격 */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>규격</label>
              <select
                value={newItem.spec}
                onChange={(e) => setNewItem({ ...newItem, spec: e.target.value })}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              >
                {SPEC_OPTIONS.map(spec => (
                  <option key={spec} value={spec}>{spec}</option>
                ))}
              </select>
            </div>

            {/* 계좌 + 세발 + 입금 */}
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>계좌</label>
                <select
                  value={newItem.bank_account}
                  onChange={(e) => setNewItem({ ...newItem, bank_account: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
                >
                  <option value="">-</option>
                  <option value="현대">현대</option>
                  <option value="국민">국민</option>
                  <option value="기업">기업</option>
                  <option value="현금영수증">현금영수증</option>
                  <option value="현찰">현찰</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>세발</label>
                <select
                  value={newItem.tax_invoice}
                  onChange={(e) => setNewItem({ ...newItem, tax_invoice: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
                >
                  <option value="">-</option>
                  <option value="완료">완료</option>
                  <option value="계약금만">계약금만</option>
                  <option value="대기">대기</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>입금</label>
                <select
                  value={newItem.deposit_status}
                  onChange={(e) => setNewItem({ ...newItem, deposit_status: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
                >
                  <option value="">-</option>
                  <option value="완료">완료</option>
                  <option value="계약금">계약금</option>
                  <option value="미입금">미입금</option>
                </select>
              </div>
            </div>

            {/* 발주처 */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>발주처</label>
              {newItem.contract_type === "branch" ? (
                <select
                  value={newItem.customer_name}
                  onChange={(e) => setNewItem({ ...newItem, customer_name: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
                >
                  <option value="">-</option>
                  <option value="라인">라인</option>
                  <option value="한진">한진</option>
                  <option value="한진더조은">한진더조은</option>
                  <option value="동부A">동부A</option>
                  <option value="동부B">동부B</option>
                  <option value="태광">태광</option>
                </select>
              ) : (
                <input
                  value={newItem.customer_name}
                  onChange={(e) => setNewItem({ ...newItem, customer_name: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                  placeholder="발주처 입력"
                />
              )}
            </div>

            {/* 옵션 */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>옵션</label>
              <input
                value={newItem.options}
                onChange={(e) => setNewItem({ ...newItem, options: e.target.value })}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                placeholder="옵션 입력"
              />
            </div>

            {/* 특수 + 내장 */}
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>특수</label>
                <div style={{ padding: 10 }}>
                  <input
                    type="checkbox"
                    checked={newItem.special_order}
                    onChange={(e) => setNewItem({ ...newItem, special_order: e.target.checked })}
                    style={{ width: 20, height: 20 }}
                  />
                </div>
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>내장</label>
                <input
                  value={newItem.interior}
                  onChange={(e) => setNewItem({ ...newItem, interior: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                  placeholder="내장"
                />
              </div>
            </div>

            {/* 입금자 + 출고일 */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>입금자</label>
                <input
                  value={newItem.depositor}
                  onChange={(e) => setNewItem({ ...newItem, depositor: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                  placeholder="입금자"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>출고일</label>
                <input
                  type="date"
                  value={newItem.delivery_date}
                  onChange={(e) => setNewItem({ ...newItem, delivery_date: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                />
              </div>
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

      {/* 견적서 팝업 */}
      {selectedQuote && (
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
          onClick={() => setSelectedQuote(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 600,
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>견적 상세</h3>
              <button
                onClick={() => setSelectedQuote(null)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>고객명:</strong> {selectedQuote.customer_name}
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>규격:</strong> {selectedQuote.spec}
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>금액:</strong> {fmt(selectedQuote.total_amount)}원
            </div>

            <div style={{ marginTop: 16 }}>
              <strong>품목:</strong>
              <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    <th style={{ padding: 6, border: "1px solid #ddd", color: "#333" }}>품명</th>
                    <th style={{ padding: 6, border: "1px solid #ddd", color: "#333" }}>수량</th>
                    <th style={{ padding: 6, border: "1px solid #ddd", color: "#333" }}>단가</th>
                    <th style={{ padding: 6, border: "1px solid #ddd", color: "#333" }}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedQuote.items || []).map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td style={{ padding: 6, border: "1px solid #eee" }}>{item.displayName || item.optionName}</td>
                      <td style={{ padding: 6, border: "1px solid #eee", textAlign: "center" }}>{item.qty}</td>
                      <td style={{ padding: 6, border: "1px solid #eee", textAlign: "right" }}>{fmt(item.unitPrice)}</td>
                      <td style={{ padding: 6, border: "1px solid #eee", textAlign: "right" }}>{fmt(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
