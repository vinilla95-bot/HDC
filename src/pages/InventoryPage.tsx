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
  inventory_status: string; // "작업완료", "출고대기", "출고완료" 등
  container_type: string; // "신품", "중고" 등
};

export default function InventoryPage({ onBack }: { onBack: () => void }) {
  const [allItems, setAllItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [newItem, setNewItem] = useState({
    customer_name: "",
    spec: "",
    inventory_status: "작업완료",
    container_type: "신품",
    total_amount: 0,
  });

  const loadInventory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("contract_date", { ascending: false });

    if (error) {
      console.error("Load error:", error);
    }
    if (data) {
      setAllItems(data as InventoryItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadInventory();
  }, []);

  // ✅ 규격별 파싱 함수 (3x6, 3x9, 33, 34 등)
  const parseSpec = (spec: string) => {
    if (!spec) return null;
    const s = spec.toLowerCase().replace(/\s/g, "");
    
    // 3x6, 3*6 형태
    if (s.includes("3x6") || s.includes("3*6")) return "3x6";
    if (s.includes("3x9") || s.includes("3*9")) return "3x9";
    
    // 33, 34 형태
    if (s.startsWith("33") || s === "33") return "33";
    if (s.startsWith("34") || s === "34") return "34";
    
    return null;
  };

  // ✅ 작업지시 완료 카운트 (규격별)
  const completedCounts = useMemo(() => {
    const counts = { "3x6": 0, "3x9": 0, "33": 0, "34": 0 };
    allItems
      .filter(item => item.inventory_status === "작업완료")
      .forEach(item => {
        const specKey = parseSpec(item.spec);
        if (specKey && specKey in counts) {
          counts[specKey as keyof typeof counts]++;
        }
      });
    return counts;
  }, [allItems]);

  // ✅ 출고대기 카운트 (규격별 상세)
  const waitingItems = useMemo(() => {
    return allItems.filter(item => item.inventory_status === "출고대기");
  }, [allItems]);

  const waitingBySpec = useMemo(() => {
    const grouped: { [key: string]: number } = {};
    waitingItems.forEach(item => {
      const spec = item.spec || "미정";
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

  // ✅ 새 항목 추가
  const handleAddNew = async () => {
    if (!newItem.spec.trim()) {
      alert("규격을 입력해주세요.");
      return;
    }

    const quote_id = `INV_${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase.from("inventory").insert({
      quote_id,
      contract_date: today,
      customer_name: newItem.customer_name,
      spec: newItem.spec,
      inventory_status: newItem.inventory_status,
      container_type: newItem.container_type,
      total_amount: newItem.total_amount,
      items: [],
    });

    if (error) {
      alert("추가 실패: " + error.message);
      return;
    }

    setShowAddModal(false);
    setNewItem({ customer_name: "", spec: "", inventory_status: "작업완료", container_type: "신품", total_amount: 0 });
    loadInventory();
  };

  // ✅ 삭제
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

  const fmt = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

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

  // ✅ 상태별 색상
  const getStatusColor = (status: string) => {
    switch (status) {
      case "작업완료": return "#28a745";
      case "출고대기": return "#ffc107";
      case "출고완료": return "#6c757d";
      default: return "#17a2b8";
    }
  };

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
        {/* 작업지시 완료 카드 */}
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
            ✅ 작업지시 완료
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ 
              background: "#f0f9f0", 
              padding: "10px 16px", 
              borderRadius: 8,
              textAlign: "center",
              minWidth: 60
            }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#28a745" }}>{completedCounts["3x6"]}</div>
              <div style={{ fontSize: 11, color: "#666" }}>3x6</div>
            </div>
            <div style={{ 
              background: "#f0f9f0", 
              padding: "10px 16px", 
              borderRadius: 8,
              textAlign: "center",
              minWidth: 60
            }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#28a745" }}>{completedCounts["3x9"]}</div>
              <div style={{ fontSize: 11, color: "#666" }}>3x9</div>
            </div>
            <div style={{ 
              background: "#f0f9f0", 
              padding: "10px 16px", 
              borderRadius: 8,
              textAlign: "center",
              minWidth: 60
            }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#28a745" }}>{completedCounts["33"]}</div>
              <div style={{ fontSize: 11, color: "#666" }}>33</div>
            </div>
            <div style={{ 
              background: "#f0f9f0", 
              padding: "10px 16px", 
              borderRadius: 8,
              textAlign: "center",
              minWidth: 60
            }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#28a745" }}>{completedCounts["34"]}</div>
              <div style={{ fontSize: 11, color: "#666" }}>34</div>
            </div>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(waitingBySpec).length > 0 ? (
              Object.entries(waitingBySpec).map(([spec, count]) => (
                <div 
                  key={spec}
                  style={{ 
                    background: "#fffbeb", 
                    padding: "6px 12px", 
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#92400e"
                  }}
                >
                  {spec} - {count}동
                </div>
              ))
            ) : (
              <div style={{ color: "#999", fontSize: 13 }}>출고대기 항목 없음</div>
            )}
          </div>
        </div>
      </div>

      {/* ✅ 재고 리스트 테이블 */}
      <div style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        overflow: "hidden"
      }}>
        <div style={{ 
          padding: "12px 16px", 
          borderBottom: "1px solid #e5e7eb",
          fontWeight: 700,
          fontSize: 14
        }}>
          전체 재고 목록 ({allItems.length}건)
        </div>
        
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>로딩 중...</div>
        ) : allItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
            재고 데이터가 없습니다.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="inventory-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>상태</th>
                  <th style={thStyle}>구분</th>
                  <th style={thStyle}>등록일</th>
                  <th style={thStyle}>규격</th>
                  <th style={thStyle}>발주처</th>
                  <th style={thStyle}>도면번호</th>
                  <th style={thStyle}>내장</th>
                  <th style={thStyle}>출고일</th>
                  <th style={thStyle}>금액</th>
                  <th style={thStyle}>비고</th>
                  <th style={thStyle}>삭제</th>
                </tr>
              </thead>
              <tbody>
                {allItems.map((item) => {
                  const isCompleted = item.inventory_status === "출고완료";
                  
                  return (
                    <tr
                      key={item.quote_id}
                      style={{
                        background: isCompleted ? "#f0f0f0" : "#fff",
                        opacity: isCompleted ? 0.6 : 1,
                        borderBottom: "1px solid #eee"
                      }}
                    >
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <select
                          value={item.inventory_status || "작업완료"}
                          onChange={(e) => updateField(item.quote_id, "inventory_status", e.target.value)}
                          style={{ 
                            padding: 4, 
                            border: "1px solid #ddd", 
                            borderRadius: 4, 
                            fontSize: 11,
                            background: getStatusColor(item.inventory_status || "작업완료"),
                            color: item.inventory_status === "출고대기" ? "#000" : "#fff",
                            fontWeight: 700
                          }}
                        >
                          <option value="작업완료">작업완료</option>
                          <option value="출고대기">출고대기</option>
                          <option value="출고완료">출고완료</option>
                        </select>
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
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        {item.contract_date || "-"}
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center", fontWeight: 700 }}>
                        <input
                          value={item.spec || ""}
                          onChange={(e) => updateField(item.quote_id, "spec", e.target.value)}
                          style={{ width: 70, padding: 4, border: "1px solid #ddd", borderRadius: 4, textAlign: "center", fontWeight: 700 }}
                          placeholder="3x6"
                        />
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee" }}>
                        <input
                          value={item.customer_name || ""}
                          onChange={(e) => updateField(item.quote_id, "customer_name", e.target.value)}
                          style={{ width: 80, padding: 4, border: "1px solid #ddd", borderRadius: 4 }}
                          placeholder="발주처"
                        />
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <input
                          value={item.drawing_no || ""}
                          onChange={(e) => updateField(item.quote_id, "drawing_no", e.target.value)}
                          style={{ width: 50, padding: 4, border: "1px solid #ddd", borderRadius: 4, textAlign: "center" }}
                          placeholder="-"
                        />
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <input
                          value={item.interior || ""}
                          onChange={(e) => updateField(item.quote_id, "interior", e.target.value)}
                          style={{ width: 35, padding: 4, border: "1px solid #ddd", borderRadius: 4, textAlign: "center" }}
                          placeholder="-"
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
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "right" }}>
                        {fmt(item.total_amount)}
                      </td>
                      <td style={{ padding: 8, border: "1px solid #eee", textAlign: "center" }}>
                        <button
                          onClick={() => setSelectedItem(item)}
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
                <option value="작업완료">작업완료</option>
                <option value="출고대기">출고대기</option>
                <option value="출고완료">출고완료</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>구분</label>
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

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>규격 *</label>
              <input
                value={newItem.spec}
                onChange={(e) => setNewItem({ ...newItem, spec: e.target.value })}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                placeholder="예: 3x6, 3x9, 33, 34"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>발주처</label>
              <input
                value={newItem.customer_name}
                onChange={(e) => setNewItem({ ...newItem, customer_name: e.target.value })}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                placeholder="발주처 입력"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>금액</label>
              <input
                type="number"
                value={newItem.total_amount || ""}
                onChange={(e) => setNewItem({ ...newItem, total_amount: Number(e.target.value) })}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                placeholder="0"
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

      {/* 상세 보기 팝업 */}
      {selectedItem && (
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
          onClick={() => setSelectedItem(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 500,
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>재고 상세</h3>
              <button
                onClick={() => setSelectedItem(null)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>규격:</strong> {selectedItem.spec}
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>상태:</strong> {selectedItem.inventory_status}
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>구분:</strong> {selectedItem.container_type}
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>발주처:</strong> {selectedItem.customer_name || "-"}
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>금액:</strong> {fmt(selectedItem.total_amount)}원
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>등록일:</strong> {selectedItem.contract_date || "-"}
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>출고일:</strong> {selectedItem.delivery_date || "-"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
