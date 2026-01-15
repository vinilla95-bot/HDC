// src/pages/DeliveryCalendarPage.tsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../QuoteService";

type DeliveryItem = {
  quote_id: string;
  contract_type: string;
  customer_name: string;
  customer_phone: string;
  spec: string;
  items: any[];
  delivery_date: string;
  site_name?: string;
  site_addr?: string;
  memo?: string;
  total_amount: number;
  deposit_status?: string;
  delivery_color?: string;
};

type ColorType = "red" | "orange" | "blue" | "yellow" | "gray" | "green" | "auto";

export default function DeliveryCalendarPage({ onBack }: { onBack: () => void }) {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryItem | null>(null);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<Partial<DeliveryItem>>({});
  const [copySuccess, setCopySuccess] = useState(false);
  const [draggedItem, setDraggedItem] = useState<DeliveryItem | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const loadDeliveries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("status", "confirmed")
      .not("delivery_date", "is", null);

    if (error) {
      console.error("Load error:", error);
    }
    if (data) {
      setDeliveries(data.filter((d: any) => d.delivery_date) as DeliveryItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadDeliveries();
  }, []);

  // ✅ 색상 결정 로직
  const getItemColor = useCallback((item: DeliveryItem): ColorType => {
    // 1. 수동 색상이 설정되어 있으면 사용
    if (item.delivery_color && item.delivery_color !== "auto") {
      return item.delivery_color as ColorType;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deliveryDate = new Date(item.delivery_date);
    deliveryDate.setHours(0, 0, 0, 0);
    const isPast = deliveryDate < today;

    // 2. 미입금 상태면 빨간색
    if (item.deposit_status === "미입금" || !item.deposit_status) {
      return "red";
    }

    // 3. 입금 완료 + 출고일 지남 → 회색
    if (item.deposit_status === "완료" && isPast) {
      return "gray";
    }

    // 4. 기본 색상 (타입별)
    const type = item.contract_type || "order";
    if (type === "used") return "orange";
    if (type === "branch") return "blue";
    return "green";
  }, []);

  // ✅ 색상 스타일
  const colorStyles: Record<ColorType, { bg: string; border: string; text: string }> = {
    red: { bg: "#ffebee", border: "#f44336", text: "#c62828" },
    orange: { bg: "#fff3e0", border: "#ff9800", text: "#e65100" },
    blue: { bg: "#e3f2fd", border: "#2196f3", text: "#1565c0" },
    yellow: { bg: "#fffde7", border: "#ffc107", text: "#f57f17" },
    gray: { bg: "#f5f5f5", border: "#9e9e9e", text: "#616161" },
    green: { bg: "#e8f5e9", border: "#4caf50", text: "#2e7d32" },
    auto: { bg: "#e8f5e9", border: "#4caf50", text: "#2e7d32" },
  };

  // ✅ 옵션 요약
  const summarizeOptions = (items: any[], short = true) => {
    if (!items || items.length === 0) return "";
    const limit = short ? 2 : 5;
    const names = items.slice(0, limit).map((i: any) => {
      const name = i.optionName || i.displayName || i.itemName || "";
      if (short) {
        return name.length > 8 ? name.slice(0, 8) + ".." : name;
      }
      return name;
    });
    const summary = names.join(", ");
    if (short) {
      return items.length > limit ? `${summary} 외${items.length - limit}` : summary;
    }
    return items.length > limit ? `${summary} 외 ${items.length - limit}건` : summary;
  };

  // ✅ 현장명 가져오기
  const getSiteName = (item: DeliveryItem) => {
    if (item.site_name) return item.site_name;
    if (item.items && item.items.length > 0) {
      const deliveryItem = item.items.find((i: any) =>
        (i.optionName || i.displayName || "").includes("운송")
      );
      if (deliveryItem && deliveryItem.displayName) {
        const match = deliveryItem.displayName.match(/운송비[^\-]*-(.+)/);
        if (match) return match[1];
      }
    }
    return "";
  };

  // ✅ 수량 가져오기
  const getQty = (item: DeliveryItem) => {
    if (!item.items || item.items.length === 0) return 1;
    const containerItem = item.items.find((i: any) => {
      const name = (i.optionName || i.displayName || "").toLowerCase();
      return name.includes("컨테이너") || name.includes("신품") || name.includes("중고");
    });
    return containerItem?.qty || 1;
  };

  // ✅ 출고 라벨 생성
  const getDeliveryLabel = (item: DeliveryItem) => {
    const type = item.contract_type || "order";
    const spec = item.spec || "";
    const options = summarizeOptions(item.items, true);
    const site = getSiteName(item);
    const customer = item.customer_name || "";
    const qty = getQty(item);
    const qtyText = qty > 1 ? `-${qty}동` : "";

    let prefix = "";
    let label = "";

    if (type === "used") {
      prefix = "[중고]";
      label = `${prefix}(${spec}${qtyText}) ${options} ${site}`.trim();
    } else if (type === "branch") {
      prefix = "[신품]";
      label = `${prefix}${customer}(${spec}${qtyText}) ${options} ${site}`.trim();
    } else {
      prefix = "[신품]";
      label = `${prefix}(${spec}${qtyText}) ${options} ${site}`.trim();
    }

    return label;
  };

  // ✅ 배차 양식 생성
  const generateDispatchText = (item: DeliveryItem) => {
    const type = item.contract_type || "order";
    const isUsed = type === "used";
    const saleType = isUsed ? "중고" : "신품";

    const date = new Date(item.delivery_date);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    const spec = item.spec || "";
    const qty = getQty(item);
    const qtyText = qty > 1 ? `${qty}` : "1";

    let unloadInfo = "";
    if (item.site_addr) {
      unloadInfo = item.site_addr;
    }
    if (item.memo) {
      unloadInfo = unloadInfo ? `${unloadInfo} ${item.memo}` : item.memo;
    }

    const customer = item.customer_name || "";
    const phone = item.customer_phone || "";

    let text = `사장님 (${dateStr}) ${saleType}판매 (${spec})(${qtyText})-동 상차 현대`;

    if (unloadInfo) {
      text += ` 하차 ${unloadInfo}`;
    } else {
      text += ` 하차 `;
    }

    text += ` ${customer}`;

    if (phone) {
      text += ` 인수자${phone}`;
    } else {
      text += ` 인수자`;
    }

    text += ` 입니다~`;

    return text;
  };

  // ✅ 클립보드 복사
  const handleCopyDispatch = async () => {
    if (!selectedDelivery) return;

    const text = generateDispatchText(selectedDelivery);

    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  // ✅ 드래그 시작
  const handleDragStart = (e: React.DragEvent, item: DeliveryItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = "move";
  };

  // ✅ 드래그 오버
  const handleDragOver = (e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateKey);
  };

  // ✅ 드래그 종료
  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  // ✅ 드롭 (날짜 변경)
  const handleDrop = async (e: React.DragEvent, newDate: string) => {
    e.preventDefault();
    setDragOverDate(null);

    if (!draggedItem || draggedItem.delivery_date === newDate) {
      setDraggedItem(null);
      return;
    }

    // DB 업데이트
    const { error } = await supabase
      .from("quotes")
      .update({ delivery_date: newDate })
      .eq("quote_id", draggedItem.quote_id);

    if (error) {
      alert("날짜 변경 실패: " + error.message);
    } else {
      // 로컬 상태 업데이트
      setDeliveries(prev => prev.map(d =>
        d.quote_id === draggedItem.quote_id ? { ...d, delivery_date: newDate } : d
      ));
    }

    setDraggedItem(null);
  };

  // ✅ 수정 저장
  const handleSaveEdit = async () => {
    if (!selectedDelivery) return;

    const { error } = await supabase
      .from("quotes")
      .update({
        delivery_date: editForm.delivery_date,
        customer_name: editForm.customer_name,
        customer_phone: editForm.customer_phone,
        spec: editForm.spec,
        site_addr: editForm.site_addr,
        memo: editForm.memo,
        delivery_color: editForm.delivery_color,
      })
      .eq("quote_id", selectedDelivery.quote_id);

    if (error) {
      alert("저장 실패: " + error.message);
      return;
    }

    // 로컬 상태 업데이트
    setDeliveries(prev => prev.map(d =>
      d.quote_id === selectedDelivery.quote_id ? { ...d, ...editForm } : d
    ));

    setShowEditModal(false);
    setSelectedDelivery({ ...selectedDelivery, ...editForm } as DeliveryItem);
  };

  // ✅ 색상 변경
  const handleColorChange = async (quote_id: string, color: ColorType) => {
    const { error } = await supabase
      .from("quotes")
      .update({ delivery_color: color })
      .eq("quote_id", quote_id);

    if (error) {
      alert("색상 변경 실패: " + error.message);
      return;
    }

    setDeliveries(prev => prev.map(d =>
      d.quote_id === quote_id ? { ...d, delivery_color: color } : d
    ));

    if (selectedDelivery?.quote_id === quote_id) {
      setSelectedDelivery({ ...selectedDelivery, delivery_color: color });
      setEditForm({ ...editForm, delivery_color: color });
    }
  };

  // ✅ 날짜별 출고 그룹핑
  const deliveriesByDate = useMemo(() => {
    const map: Record<string, DeliveryItem[]> = {};
    deliveries.forEach((d) => {
      const date = d.delivery_date;
      if (!map[date]) map[date] = [];
      map[date].push(d);
    });
    return map;
  }, [deliveries]);

  // ✅ 캘린더 데이터 생성
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay();

    const calendarStart = new Date(firstDay);
    calendarStart.setDate(calendarStart.getDate() - startDayOfWeek);

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    for (let i = 0; i < 42; i++) {
      const date = new Date(calendarStart);
      date.setDate(calendarStart.getDate() + i);
      days.push({
        date,
        isCurrentMonth: date.getMonth() === month,
      });
    }

    return days;
  }, [currentMonth]);

  const formatDateKey = (date: Date) => {
    return date.toISOString().slice(0, 10);
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const goToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const monthLabel = `${currentMonth.getFullYear()}년 ${currentMonth.getMonth() + 1}월`;

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

  const today = new Date();
  const todayKey = formatDateKey(today);

  const fmt = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

  return (
    <div style={{ padding: 16, background: "#f6f7fb", minHeight: "100vh" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
          출고일정
          <span style={{ fontSize: 12, fontWeight: 400, color: "#666", marginLeft: 8 }}>
            (총 {deliveries.length}건)
          </span>
        </h2>
      </div>

      {/* 월 네비게이션 */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
        background: "#fff",
        padding: "12px 16px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
      }}>
        <button
          onClick={prevMonth}
          style={{
            padding: "8px 16px",
            background: "#f5f5f5",
            border: "1px solid #ddd",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          ◀ 이전
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{monthLabel}</span>
          <button
            onClick={goToday}
            style={{
              padding: "6px 12px",
              background: "#2e5b86",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            오늘
          </button>
        </div>
        <button
          onClick={nextMonth}
          style={{
            padding: "8px 16px",
            background: "#f5f5f5",
            border: "1px solid #ddd",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          다음 ▶
        </button>
      </div>

      {/* 안내 */}
      <div style={{
        background: "#fff8e1",
        border: "1px solid #ffe082",
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 12,
        fontSize: 12,
        color: "#f57f17",
      }}>
        💡 일정을 드래그하여 날짜를 변경할 수 있습니다
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>로딩 중...</div>
      ) : (
        <div style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}>
          {/* 요일 헤더 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            background: "#2e5b86",
          }}>
            {weekDays.map((day, idx) => (
              <div
                key={day}
                style={{
                  padding: "10px 4px",
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: 13,
                  color: idx === 0 ? "#ffcccc" : idx === 6 ? "#cce5ff" : "#fff",
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* 캘린더 그리드 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
          }}>
            {calendarDays.map(({ date, isCurrentMonth }, idx) => {
              const dateKey = formatDateKey(date);
              const dayDeliveries = deliveriesByDate[dateKey] || [];
              const isToday = dateKey === todayKey;
              const dayOfWeek = date.getDay();
              const isSunday = dayOfWeek === 0;
              const isSaturday = dayOfWeek === 6;
              const isDragOver = dragOverDate === dateKey;

              return (
                <div
                  key={idx}
                  onDragOver={(e) => handleDragOver(e, dateKey)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, dateKey)}
                  style={{
                    minHeight: 100,
                    padding: 4,
                    borderRight: idx % 7 !== 6 ? "1px solid #eee" : "none",
                    borderBottom: "1px solid #eee",
                    background: isDragOver ? "#e3f2fd" : isToday ? "#fffde7" : isCurrentMonth ? "#fff" : "#f9f9f9",
                    opacity: isCurrentMonth ? 1 : 0.5,
                    transition: "background 0.2s",
                  }}
                >
                  {/* 날짜 */}
                  <div style={{
                    fontSize: 12,
                    fontWeight: isToday ? 800 : 600,
                    color: isSunday ? "#e53935" : isSaturday ? "#1976d2" : "#333",
                    marginBottom: 4,
                    padding: "2px 4px",
                    borderRadius: 4,
                    background: isToday ? "#2e5b86" : "transparent",
                    ...(isToday && { color: "#fff" }),
                    display: "inline-block",
                  }}>
                    {date.getDate()}
                  </div>

                  {/* 출고 항목들 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {dayDeliveries.slice(0, 3).map((d, i) => {
                      const color = getItemColor(d);
                      const style = colorStyles[color];

                      return (
                        <div
                          key={d.quote_id + i}
                          draggable
                          onDragStart={(e) => handleDragStart(e, d)}
                          onClick={() => {
                            setSelectedDelivery(d);
                            setEditForm(d);
                          }}
                          style={{
                            fontSize: 10,
                            padding: "3px 4px",
                            background: style.bg,
                            borderLeft: `3px solid ${style.border}`,
                            color: style.text,
                            borderRadius: 2,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            cursor: "grab",
                          }}
                          title={`${getDeliveryLabel(d)} (드래그하여 날짜 변경)`}
                        >
                          {getDeliveryLabel(d)}
                        </div>
                      );
                    })}
                    {dayDeliveries.length > 3 && (
                      <div style={{
                        fontSize: 10,
                        color: "#666",
                        padding: "2px 4px",
                        cursor: "pointer",
                      }}>
                        +{dayDeliveries.length - 3}건 더
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 범례 */}
      <div style={{
        display: "flex",
        gap: 12,
        marginTop: 16,
        padding: "12px 16px",
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        fontSize: 11,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 14, background: colorStyles.green.bg, borderLeft: `3px solid ${colorStyles.green.border}`, borderRadius: 2 }}></div>
          <span>신품(입금)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 14, background: colorStyles.blue.bg, borderLeft: `3px solid ${colorStyles.blue.border}`, borderRadius: 2 }}></div>
          <span>영업소</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 14, background: colorStyles.orange.bg, borderLeft: `3px solid ${colorStyles.orange.border}`, borderRadius: 2 }}></div>
          <span>중고</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 14, background: colorStyles.red.bg, borderLeft: `3px solid ${colorStyles.red.border}`, borderRadius: 2 }}></div>
          <span>미입금</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 14, background: colorStyles.gray.bg, borderLeft: `3px solid ${colorStyles.gray.border}`, borderRadius: 2 }}></div>
          <span>완료(출고지남)</span>
        </div>
      </div>

      {/* ✅ 상세보기 팝업 */}
      {selectedDelivery && !showDispatchModal && !showEditModal && (
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
          onClick={() => setSelectedDelivery(null)}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>출고 상세</h3>
              <button
                onClick={() => setSelectedDelivery(null)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* 구분 태그 + 색상 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
              {(() => {
                const type = selectedDelivery.contract_type || "order";
                const color = getItemColor(selectedDelivery);
                const style = colorStyles[color];
                const label = type === "used" ? "중고" : type === "branch" ? "영업소" : "수주(신품)";
                return (
                  <span style={{
                    padding: "4px 12px",
                    background: style.bg,
                    color: style.text,
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    border: `1px solid ${style.border}`,
                  }}>
                    {label}
                  </span>
                );
              })()}

              {/* 색상 선택 */}
              <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                {(["red", "orange", "yellow", "green", "blue", "gray"] as ColorType[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => handleColorChange(selectedDelivery.quote_id, c)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: selectedDelivery.delivery_color === c ? "2px solid #333" : "1px solid #ddd",
                      background: colorStyles[c].border,
                      cursor: "pointer",
                    }}
                    title={c}
                  />
                ))}
                <button
                  onClick={() => handleColorChange(selectedDelivery.quote_id, "auto")}
                  style={{
                    padding: "2px 6px",
                    fontSize: 10,
                    borderRadius: 4,
                    border: "1px solid #ddd",
                    background: selectedDelivery.delivery_color === "auto" || !selectedDelivery.delivery_color ? "#eee" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  자동
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>출고일</span>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{selectedDelivery.delivery_date}</span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>발주처</span>
                <span style={{ fontWeight: 700 }}>{selectedDelivery.customer_name || "-"}</span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>연락처</span>
                <span>{selectedDelivery.customer_phone || "-"}</span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>규격</span>
                <span style={{ fontWeight: 600 }}>{selectedDelivery.spec || "-"}</span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>현장</span>
                <span>{getSiteName(selectedDelivery) || "-"}</span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>주소</span>
                <span>{selectedDelivery.site_addr || "-"}</span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>입금상태</span>
                <span style={{
                  fontWeight: 700,
                  color: selectedDelivery.deposit_status === "완료" ? "#2e7d32" :
                    selectedDelivery.deposit_status === "미입금" ? "#c62828" : "#f57f17"
                }}>
                  {selectedDelivery.deposit_status || "미입금"}
                </span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>금액</span>
                <span style={{ fontWeight: 700 }}>{fmt(selectedDelivery.total_amount)}원</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "#666", fontSize: 13 }}>옵션</span>
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                  {summarizeOptions(selectedDelivery.items, false) || "-"}
                </span>
              </div>
              {selectedDelivery.memo && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                  <span style={{ color: "#666", fontSize: 13 }}>메모</span>
                  <span style={{ fontSize: 13, background: "#f9f9f9", padding: 8, borderRadius: 6 }}>
                    {selectedDelivery.memo}
                  </span>
                </div>
              )}
            </div>

            {/* 버튼 */}
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button
                onClick={() => setSelectedDelivery(null)}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#f5f5f5",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                닫기
              </button>
              <button
                onClick={() => {
                  setEditForm(selectedDelivery);
                  setShowEditModal(true);
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#fff",
                  border: "1px solid #2e5b86",
                  color: "#2e5b86",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ✏️ 수정
              </button>
              <button
                onClick={() => setShowDispatchModal(true)}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#2e5b86",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🚚 배차
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 수정 모달 */}
      {selectedDelivery && showEditModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10001,
          }}
          onClick={() => setShowEditModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 450,
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>✏️ 일정 수정</h3>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>출고일</label>
                <input
                  type="date"
                  value={editForm.delivery_date || ""}
                  onChange={(e) => setEditForm({ ...editForm, delivery_date: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>발주처</label>
                <input
                  value={editForm.customer_name || ""}
                  onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>연락처</label>
                <input
                  value={editForm.customer_phone || ""}
                  onChange={(e) => setEditForm({ ...editForm, customer_phone: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>규격</label>
                <input
                  value={editForm.spec || ""}
                  onChange={(e) => setEditForm({ ...editForm, spec: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>하차 주소</label>
                <input
                  value={editForm.site_addr || ""}
                  onChange={(e) => setEditForm({ ...editForm, site_addr: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}
                  placeholder="시간/주소 입력"
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>메모</label>
                <textarea
                  value={editForm.memo || ""}
                  onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                  style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box", minHeight: 60, resize: "vertical" }}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 13 }}>색상</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["auto", "red", "orange", "yellow", "green", "blue", "gray"] as ColorType[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditForm({ ...editForm, delivery_color: c })}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: editForm.delivery_color === c ? "2px solid #333" : "1px solid #ddd",
                        background: c === "auto" ? "#f5f5f5" : colorStyles[c].bg,
                        color: c === "auto" ? "#666" : colorStyles[c].text,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {c === "auto" ? "자동" : c === "red" ? "빨강" : c === "orange" ? "주황" : c === "yellow" ? "노랑" : c === "green" ? "초록" : c === "blue" ? "파랑" : "회색"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 버튼 */}
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button
                onClick={() => setShowEditModal(false)}
                style={{
                  flex: 1,
                  padding: 14,
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
                onClick={handleSaveEdit}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#2e5b86",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 배차 양식 팝업 */}
      {selectedDelivery && showDispatchModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10001,
          }}
          onClick={() => setShowDispatchModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 500,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>🚚 배차 양식</h3>
              <button
                onClick={() => setShowDispatchModal(false)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>아래 내용을 복사해서 사용하세요</div>
              <div style={{
                background: "#f9f9f9",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 16,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {generateDispatchText(selectedDelivery)}
              </div>
            </div>

            {/* 버튼 */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowDispatchModal(false)}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#f5f5f5",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ← 뒤로
              </button>
              <button
                onClick={handleCopyDispatch}
                style={{
                  flex: 1,
                  padding: 14,
                  background: copySuccess ? "#28a745" : "#2e5b86",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
              >
                {copySuccess ? "✓ 복사됨!" : "📋 복사하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
