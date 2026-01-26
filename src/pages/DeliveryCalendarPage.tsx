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
  dispatch_status?: string;
  source?: "quote" | "inventory";
  inventory_id?: string;
};

type ColorType = "red" | "orange" | "blue" | "yellow" | "gray" | "green" | "auto" | "purple" | "navy";

const HOLIDAYS: Record<string, string> = {
  "2024-01-01": "신정",
  "2024-02-09": "설날연휴", "2024-02-10": "설날", "2024-02-11": "설날연휴", "2024-02-12": "대체공휴일",
  "2024-03-01": "삼일절", "2024-04-10": "국회의원선거",
  "2024-05-05": "어린이날", "2024-05-06": "대체공휴일", "2024-05-15": "부처님오신날",
  "2024-06-06": "현충일", "2024-08-15": "광복절",
  "2024-09-16": "추석연휴", "2024-09-17": "추석", "2024-09-18": "추석연휴",
  "2024-10-03": "개천절", "2024-10-09": "한글날", "2024-12-25": "크리스마스",
  "2025-01-01": "신정",
  "2025-01-28": "설날연휴", "2025-01-29": "설날", "2025-01-30": "설날연휴",
  "2025-03-01": "삼일절", "2025-03-03": "대체공휴일",
  "2025-05-05": "어린이날", "2025-05-06": "부처님오신날",
  "2025-06-06": "현충일", "2025-08-15": "광복절",
  "2025-10-03": "개천절",
  "2025-10-05": "추석연휴", "2025-10-06": "추석", "2025-10-07": "추석연휴", "2025-10-08": "대체공휴일",
  "2025-10-09": "한글날", "2025-12-25": "크리스마스",
  "2026-01-01": "신정",
  "2026-02-16": "설날연휴", "2026-02-17": "설날", "2026-02-18": "설날연휴",
  "2026-03-01": "삼일절", "2026-03-02": "대체공휴일",
  "2026-05-05": "어린이날", "2026-05-24": "부처님오신날",
  "2026-06-06": "현충일", "2026-08-15": "광복절", "2026-08-17": "대체공휴일",
  "2026-09-24": "추석연휴", "2026-09-25": "추석", "2026-09-26": "추석연휴",
  "2026-10-03": "개천절", "2026-10-05": "대체공휴일", "2026-10-09": "한글날",
  "2026-12-25": "크리스마스",
};

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
  const [showAddModal, setShowAddModal] = useState(false);
  const [editForm, setEditForm] = useState<Partial<DeliveryItem>>({});
  const [copySuccess, setCopySuccess] = useState(false);
  const [draggedItem, setDraggedItem] = useState<DeliveryItem | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [selectedDateItems, setSelectedDateItems] = useState<{date: string, items: DeliveryItem[]} | null>(null);
  
  const [newSchedule, setNewSchedule] = useState({
    delivery_date: "",
    customer_name: "",
    customer_phone: "",
    spec: "3x6",
    contract_type: "order",
    site_addr: "",
    memo: "",
    delivery_color: "auto" as ColorType,
  });

  const loadDeliveries = async () => {
    setLoading(true);
    
    const [quotesRes, inventoryRes] = await Promise.all([
      supabase
        .from("quotes")
        .select("*")
        .eq("status", "confirmed")
        .not("delivery_date", "is", null),
      supabase
        .from("inventory")
        .select("*")
        .not("delivery_date", "is", null)
    ]);

    if (quotesRes.error) console.error("Quotes load error:", quotesRes.error);
    if (inventoryRes.error) console.error("Inventory load error:", inventoryRes.error);

    const quotesData = (quotesRes.data || [])
      .filter((d: any) => d.delivery_date)
      .map((q: any) => ({
        ...q,
        source: "quote" as const,
      }));
    
    const inventoryData = (inventoryRes.data || [])
      .filter((d: any) => d.delivery_date)
      .map((inv: any) => ({
        quote_id: "inv_" + inv.id,
        inventory_id: inv.id,
        contract_type: "inventory",
        customer_name: inv.customer_name || "",
        customer_phone: inv.customer_phone || "",
        spec: inv.spec || "",
        items: inv.items || [],
        delivery_date: inv.delivery_date,
        site_addr: inv.interior || "",
        memo: inv.memo || "",
        total_amount: inv.total_amount || 0,
        deposit_status: inv.deposit_status,
        delivery_color: inv.delivery_color,
        dispatch_status: inv.dispatch_status,
        container_type: inv.container_type,
        drawing_no: inv.drawing_no,
        source: "inventory" as const,
      }));

    setDeliveries([...quotesData, ...inventoryData] as DeliveryItem[]);
    setLoading(false);
  };

  useEffect(() => {
    loadDeliveries();
  }, []);

  const getItemColor = useCallback((item: DeliveryItem): ColorType => {
    if (item.delivery_color && item.delivery_color !== "auto") {
      return item.delivery_color as ColorType;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [year, month, day] = item.delivery_date.split('-').map(Number);
    const deliveryDate = new Date(year, month - 1, day);
    deliveryDate.setHours(0, 0, 0, 0);
    const isPast = deliveryDate < today;
    
    const isDepositComplete = item.deposit_status === "완료";
    const isDispatchComplete = item.dispatch_status === "완료";
    
    if (isDepositComplete && isDispatchComplete && isPast) {
      return "gray";
    }
    
    if (isDepositComplete && isDispatchComplete) {
      return "orange";
    }
    
    if (!isDepositComplete) {
      return "red";
    }
    
    if (item.source === "inventory" || item.contract_type === "inventory") {
      return "purple";
    }
    
    return "blue";
  }, []);

  const colorStyles: Record<ColorType, { bg: string; border: string; text: string }> = {
    red: { bg: "#ffebee", border: "#f44336", text: "#c62828" },
    orange: { bg: "#fff3e0", border: "#ff9800", text: "#e65100" },
    blue: { bg: "#e3f2fd", border: "#2196f3", text: "#1565c0" },
    yellow: { bg: "#fffde7", border: "#ffc107", text: "#f57f17" },
    gray: { bg: "#f5f5f5", border: "#9e9e9e", text: "#616161" },
    green: { bg: "#e8f5e9", border: "#4caf50", text: "#2e7d32" },
    purple: { bg: "#f3e5f5", border: "#9c27b0", text: "#6a1b9a" },
    navy: { bg: "#e8eaf6", border: "#3f51b5", text: "#283593" },
    auto: { bg: "#e3f2fd", border: "#2196f3", text: "#1565c0" },
  };

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
      return items.length > limit ? summary + " 외" + (items.length - limit) : summary;
    }
    return items.length > limit ? summary + " 외 " + (items.length - limit) + "건" : summary;
  };

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

  const getQty = (item: DeliveryItem) => {
    if (!item.items || item.items.length === 0) return 1;
    const containerItem = item.items.find((i: any) => {
      const name = (i.optionName || i.displayName || "").toLowerCase();
      return name.includes("컨테이너") || name.includes("신품") || name.includes("중고");
    });
    return containerItem?.qty || 1;
  };

  const getTransportType = (item: DeliveryItem): "crane" | "truck" | null => {
    if (!item.items || item.items.length === 0) return null;
    
    const transportItem = item.items.find((i: any) => {
      const name = (i.optionName || i.displayName || i.itemName || "").toLowerCase();
      return name.includes("운송") || name.includes("트럭") || name.includes("크레인");
    });
    
    if (transportItem) {
      const name = (transportItem.optionName || transportItem.displayName || transportItem.itemName || "").toLowerCase();
      if (name.includes("크레인")) return "crane";
      if (name.includes("5톤") || name.includes("일반") || name.includes("트럭")) return "truck";
    }
    return null;
  };

  const getDeliveryLabel = (item: DeliveryItem) => {
    const type = item.contract_type || "order";
    const spec = item.spec || "";
    const options = summarizeOptions(item.items, true);
    const customer = item.customer_name || "";
    const qty = getQty(item);
    const transportType = getTransportType(item);
    const memo = item.memo || "";

    const isMemoOnly = !spec && (!item.items || item.items.length === 0);
    if (isMemoOnly) {
      return ((customer ? customer + " " : "") + memo).trim() || "메모";
    }

    let prefix = "";
    if (transportType === "crane") {
      prefix = "크";
    }

    const qtyText = "-" + qty + "동";

    if (type === "memo") {
      return customer || "메모";
    } else if (type === "inventory") {
      const containerType = (item as any).container_type || "신품";
      const drawingNo = (item as any).drawing_no ? "#" + (item as any).drawing_no : "";
      return (prefix + "[재고" + containerType + "]" + drawingNo + " " + spec + " " + customer).trim();
    } else if (type === "rental") {
      return (prefix + "[임대]" + spec + qtyText + " " + options + " " + customer).trim();
    } else if (type === "used") {
      return (prefix + "[중고]" + spec + qtyText + " " + options + " " + customer).trim();
    } else {
      return (prefix + "[신품]" + spec + qtyText + " " + options + " " + customer).trim();
    }
  };

  const generateDispatchText = (item: DeliveryItem) => {
    const type = item.contract_type || "order";
    
    let saleType = "신품판매";
    if (type === "used") {
      saleType = "중고판매";
    } else if (type === "rental") {
      saleType = "임대";
    } else if (type === "memo") {
      saleType = "메모";
    } else if (type === "inventory") {
      const containerType = (item as any).container_type || "신품";
      saleType = "재고" + containerType;
    }

    const [year, month, day] = item.delivery_date.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
    const dateStr = month + "/" + day + "(" + weekDays[d.getDay()] + ")";

    const spec = item.spec || "";
    const qty = getQty(item);
    const qtyText = qty > 1 ? String(qty) : "1";
    let unloadInfo = "";
    if (item.site_addr) {
      unloadInfo = item.site_addr;
    }
    if (item.memo) {
      unloadInfo = unloadInfo ? unloadInfo + " " + item.memo : item.memo;
    }
    const customer = item.customer_name || "";
    const phone = item.customer_phone || "";

    let text = "사장님 " + dateStr + " " + saleType + " (" + spec + ")" + qtyText + "동(옵션OR기본형) 상차 현대";
    if (unloadInfo) {
      text += " 하차 " + unloadInfo;
    } else {
      text += " 하차 ";
    }
    text += " " + customer;
    if (phone) {
      text += " 인수자" + phone;
    } else {
      text += " 인수자";
    }
    text += " 입니다~";
    return text;
  };

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

  const handleDragStart = (e: React.DragEvent, item: DeliveryItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateKey);
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = async (e: React.DragEvent, newDate: string) => {
    e.preventDefault();
    setDragOverDate(null);

    if (!draggedItem || draggedItem.delivery_date === newDate) {
      setDraggedItem(null);
      return;
    }

    if (draggedItem.source === "inventory") {
      const { error } = await supabase
        .from("inventory")
        .update({ delivery_date: newDate })
        .eq("id", draggedItem.inventory_id);

      if (error) {
        alert("날짜 변경 실패: " + error.message);
      } else {
        setDeliveries(prev => prev.map(d =>
          d.quote_id === draggedItem.quote_id ? { ...d, delivery_date: newDate } : d
        ));
      }
    } else {
      const { error } = await supabase
        .from("quotes")
        .update({ delivery_date: newDate })
        .eq("quote_id", draggedItem.quote_id);

      if (error) {
        alert("날짜 변경 실패: " + error.message);
      } else {
        setDeliveries(prev => prev.map(d =>
          d.quote_id === draggedItem.quote_id ? { ...d, delivery_date: newDate } : d
        ));
      }
    }

    setDraggedItem(null);
  };

  const handleSaveEdit = async () => {
    if (!selectedDelivery) return;

    if (selectedDelivery.source === "inventory") {
      const { error } = await supabase
        .from("inventory")
        .update({
          delivery_date: editForm.delivery_date,
          customer_name: editForm.customer_name,
          customer_phone: editForm.customer_phone,
          spec: editForm.spec,
          interior: editForm.site_addr,
          memo: editForm.memo,
          delivery_color: editForm.delivery_color,
          dispatch_status: editForm.dispatch_status,
        })
        .eq("id", selectedDelivery.inventory_id);

      if (error) {
        alert("저장 실패: " + error.message);
        return;
      }
    } else {
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
          dispatch_status: editForm.dispatch_status,
        })
        .eq("quote_id", selectedDelivery.quote_id);

      if (error) {
        alert("저장 실패: " + error.message);
        return;
      }
    }

    await loadDeliveries();
    setShowEditModal(false);
    setSelectedDelivery(null);
  };

  const handleAddSchedule = async () => {
    if (!newSchedule.delivery_date) {
      alert("출고일을 선택해주세요.");
      return;
    }

    const quoteId = "SCHEDULE_" + Date.now();
    
    const { error } = await supabase
      .from("quotes")
      .insert({
        quote_id: quoteId,
        status: "confirmed",
        contract_type: newSchedule.contract_type,
        delivery_date: newSchedule.delivery_date,
        customer_name: newSchedule.customer_name,
        customer_phone: newSchedule.customer_phone,
        spec: newSchedule.spec,
        site_addr: newSchedule.site_addr,
        memo: newSchedule.memo,
        delivery_color: newSchedule.delivery_color,
        total_amount: 0,
        items: [],
      });

    if (error) {
      alert("일정 추가 실패: " + error.message);
      return;
    }

    const newItem: DeliveryItem = {
      quote_id: quoteId,
      contract_type: newSchedule.contract_type,
      delivery_date: newSchedule.delivery_date,
      customer_name: newSchedule.customer_name,
      customer_phone: newSchedule.customer_phone,
      spec: newSchedule.spec,
      site_addr: newSchedule.site_addr,
      memo: newSchedule.memo,
      delivery_color: newSchedule.delivery_color,
      total_amount: 0,
      items: [],
      source: "quote",
    };
    
    setDeliveries(prev => [...prev, newItem]);
    setShowAddModal(false);
    setNewSchedule({
      delivery_date: "",
      customer_name: "",
      customer_phone: "",
      spec: "3x6",
      contract_type: "order",
      site_addr: "",
      memo: "",
      delivery_color: "auto",
    });
  };

  const handleColorChange = async (item: DeliveryItem, color: ColorType) => {
    if (item.source === "inventory") {
      const { error } = await supabase
        .from("inventory")
        .update({ delivery_color: color })
        .eq("id", item.inventory_id);

      if (error) {
        alert("색상 변경 실패: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("quotes")
        .update({ delivery_color: color })
        .eq("quote_id", item.quote_id);

      if (error) {
        alert("색상 변경 실패: " + error.message);
        return;
      }
    }

    setDeliveries(prev => prev.map(d =>
      d.quote_id === item.quote_id ? { ...d, delivery_color: color } : d
    ));

    if (selectedDelivery?.quote_id === item.quote_id) {
      setSelectedDelivery({ ...selectedDelivery, delivery_color: color });
      setEditForm({ ...editForm, delivery_color: color });
    }
  };

  const handleDelete = async () => {
    if (!selectedDelivery) return;
    
    if (selectedDelivery.source === "inventory") {
      if (!confirm("정말 삭제하시겠습니까?")) return;
      
      const { error } = await supabase
        .from("inventory")
        .delete()
        .eq("id", selectedDelivery.inventory_id);

      if (error) {
        alert("삭제 실패: " + error.message);
        return;
      }
    } else {
      if (!confirm("출고일정에서 제거하시겠습니까?\n(견적/계약 목록에는 그대로 유지됩니다)")) return;
      
      const { error } = await supabase
        .from("quotes")
        .update({ 
          delivery_date: null,
          dispatch_status: null,
        })
        .eq("quote_id", selectedDelivery.quote_id);

      if (error) {
        alert("제거 실패: " + error.message);
        return;
      }
    }

    setDeliveries(prev => prev.filter(d => d.quote_id !== selectedDelivery.quote_id));
    setSelectedDelivery(null);
  };

  const deliveriesByDate = useMemo(() => {
    const map: Record<string, DeliveryItem[]> = {};
    deliveries.forEach((d) => {
      const date = d.delivery_date;
      if (!map[date]) map[date] = [];
      map[date].push(d);
    });
    return map;
  }, [deliveries]);

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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + "-" + month + "-" + day;
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

  const monthLabel = currentMonth.getFullYear() + "년 " + (currentMonth.getMonth() + 1) + "월";

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

  const today = new Date();
  const todayKey = formatDateKey(today);

  const fmt = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

  return (
    <div style={{ padding: 16, background: "#f6f7fb", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
          출고일정
          <span style={{ fontSize: 12, fontWeight: 400, color: "#666", marginLeft: 8 }}>
            (총 {deliveries.length}건)
          </span>
        </h2>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: "8px 16px",
            background: "#2e5b86",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          + 일정추가
        </button>
      </div>

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

      <div style={{
        background: "#fff8e1",
        border: "1px solid #ffe082",
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 12,
        fontSize: 12,
        color: "#f57f17",
      }}>
        💡 일정을 드래그하여 날짜를 변경할 수 있습니다 | 크[신품] = 크레인 운송
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
                  onClick={() => {
                    setNewSchedule({ ...newSchedule, delivery_date: dateKey });
                    setShowAddModal(true);
                  }}
                  style={{
                    height: 110,
                    minHeight: 110,
                    maxHeight: 110,
                    padding: 4,
                    overflow: "hidden",
                    borderRight: idx % 7 !== 6 ? "1px solid #eee" : "none",
                    borderBottom: "1px solid #eee",
                    background: isDragOver ? "#e3f2fd" : isToday ? "#fffde7" : isCurrentMonth ? "#fff" : "#f9f9f9",
                    opacity: isCurrentMonth ? 1 : 0.5,
                    transition: "background 0.2s",
                  }}
                >
                  {(() => {
                    const holidayName = HOLIDAYS[dateKey];
                    const isHoliday = !!holidayName;
                    return (
                      <>
                        <div style={{
                          fontSize: 12,
                          fontWeight: isToday ? 800 : 600,
                          color: isToday ? "#fff" : (isSunday || isHoliday) ? "#e53935" : isSaturday ? "#1976d2" : "#333",
                          marginBottom: 2,
                          padding: "2px 4px",
                          borderRadius: 4,
                          background: isToday ? "#2e5b86" : "transparent",
                          display: "inline-block",
                        }}>
                          {date.getDate()}
                        </div>
                        {holidayName && (
                          <div style={{ fontSize: 9, color: "#e53935", fontWeight: 600, marginBottom: 2 }}>
                            {holidayName}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  
                  <div style={{ 
                    display: "flex", 
                    flexDirection: "column", 
                    gap: 2,
                    maxHeight: 70,
                    overflow: "hidden"
                  }}>
                    {dayDeliveries.slice(0, 3).map((d, i) => {
                      const color = getItemColor(d);
                      const style = colorStyles[color];

                      return (
                        <div
                          key={d.quote_id + i}
                          draggable
                          onDragStart={(e) => handleDragStart(e, d)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDelivery(d);
                            setEditForm(d);
                          }}
                          style={{
                            fontSize: 11,
                            padding: "3px 4px",
                            background: style.bg,
                            borderLeft: "3px solid " + style.border,
                            color: style.text,
                            borderRadius: 2,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            cursor: "grab",
                            maxWidth: "100%",
                            display: "block",
                          }}
                          title={getDeliveryLabel(d) + " (드래그하여 날짜 변경)"}
                        >
                          {getDeliveryLabel(d)}
                        </div>
                      );
                    })}
                    {dayDeliveries.length > 3 && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDateItems({ date: dateKey, items: dayDeliveries });
                        }}
                        style={{
                          fontSize: 10,
                          color: "#2e5b86",
                          padding: "2px 4px",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        +{dayDeliveries.length - 3}건 더보기
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
          <div style={{ width: 14, height: 14, background: colorStyles.blue.bg, borderLeft: "3px solid " + colorStyles.blue.border, borderRadius: 2 }}></div>
          <span>신품/임대/중고</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 14, background: colorStyles.red.bg, borderLeft: "3px solid " + colorStyles.red.border, borderRadius: 2 }}></div>
          <span>미입금</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 14, background: colorStyles.gray.bg, borderLeft: "3px solid " + colorStyles.gray.border, borderRadius: 2 }}></div>
          <span>완료(출고지남)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 14, background: colorStyles.purple.bg, borderLeft: "3px solid " + colorStyles.purple.border, borderRadius: 2 }}></div>
          <span>재고</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 14, background: colorStyles.orange.bg, borderLeft: "3px solid " + colorStyles.orange.border, borderRadius: 2 }}></div>
          <span>배차완료</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8, borderLeft: "1px solid #ddd", paddingLeft: 8 }}>
          <span style={{ fontWeight: 700 }}>크</span>
          <span>= 크레인 운송</span>
        </div>
      </div>

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
              maxWidth: 450,
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>➕ 일정 추가</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>출고일 *</label>
                <input type="date" value={newSchedule.delivery_date} onChange={(e) => setNewSchedule({ ...newSchedule, delivery_date: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>구분</label>
                <select value={newSchedule.contract_type} onChange={(e) => setNewSchedule({ ...newSchedule, contract_type: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}>
                  <option value="order">신품</option>
                  <option value="used">중고</option>
                  <option value="rental">임대</option>
                  <option value="memo">메모</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>발주처</label>
                <input value={newSchedule.customer_name} onChange={(e) => setNewSchedule({ ...newSchedule, customer_name: e.target.value })} placeholder="발주처 입력" style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>연락처</label>
                <input value={newSchedule.customer_phone} onChange={(e) => setNewSchedule({ ...newSchedule, customer_phone: e.target.value })} placeholder="010-0000-0000" style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>규격</label>
                <input value={newSchedule.spec} onChange={(e) => setNewSchedule({ ...newSchedule, spec: e.target.value })} placeholder="예: 3x6x2.6" style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>하차 주소</label>
                <input value={newSchedule.site_addr} onChange={(e) => setNewSchedule({ ...newSchedule, site_addr: e.target.value })} placeholder="시간/주소 입력" style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>메모</label>
                <textarea value={newSchedule.memo} onChange={(e) => setNewSchedule({ ...newSchedule, memo: e.target.value })} placeholder="메모 입력" style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box", minHeight: 60, resize: "vertical" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 13 }}>색상</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["auto", "red", "orange", "yellow", "green", "blue", "gray"] as ColorType[]).map((c) => (
                    <button key={c} type="button" onClick={() => setNewSchedule({ ...newSchedule, delivery_color: c })} style={{ padding: "6px 12px", borderRadius: 6, border: newSchedule.delivery_color === c ? "2px solid #333" : "1px solid #ddd", background: c === "auto" ? "#f5f5f5" : colorStyles[c].bg, color: c === "auto" ? "#666" : colorStyles[c].text, cursor: "pointer", fontSize: 12, fontWeight: 600, }}>
                      {c === "auto" ? "자동" : c === "red" ? "빨강" : c === "orange" ? "주황" : c === "yellow" ? "노랑" : c === "green" ? "초록" : c === "blue" ? "파랑" : "회색"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={() => { setShowAddModal(false); setSelectedDelivery(null); }} style={{ flex: 1, padding: 14, background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={handleAddSchedule} style={{ flex: 1, padding: 14, background: "#2e5b86", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>추가</button>
            </div>
          </div>
        </div>
      )}

      {selectedDelivery && !showDispatchModal && !showEditModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }} onClick={() => setSelectedDelivery(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "90%", maxWidth: 500, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>출고 상세</h3>
              <button onClick={() => setSelectedDelivery(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
              {(() => {
                const type = selectedDelivery.contract_type || "order";
                const color = getItemColor(selectedDelivery);
                const style = colorStyles[color];
                const label = type === "inventory" ? "재고" : type === "used" ? "중고" : type === "branch" ? "영업소" : type === "rental" ? "임대" : "수주(신품)";
                const transportType = getTransportType(selectedDelivery);
                return (
                  <>
                    <span style={{ padding: "4px 12px", background: style.bg, color: style.text, borderRadius: 20, fontSize: 12, fontWeight: 700, border: "1px solid " + style.border }}>{label}</span>
                    {transportType === "crane" && <span style={{ padding: "4px 12px", background: "#fff3e0", color: "#e65100", borderRadius: 20, fontSize: 12, fontWeight: 700, border: "1px solid #ff9800" }}>🏗️ 크레인</span>}
                    {selectedDelivery.dispatch_status === "완료" && <span style={{ padding: "4px 12px", background: "#fff3e0", color: "#e65100", borderRadius: 20, fontSize: 12, fontWeight: 700, border: "1px solid #ff9800" }}>🚚 배차완료</span>}
                  </>
                );
              })()}
              <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                {(["red", "orange", "yellow", "green", "blue", "purple", "navy", "gray"] as ColorType[]).map((c) => (
                  <button key={c} onClick={() => handleColorChange(selectedDelivery, c)} style={{ width: 20, height: 20, borderRadius: "50%", border: selectedDelivery.delivery_color === c ? "2px solid #333" : "1px solid #ddd", background: colorStyles[c].border, cursor: "pointer" }} title={c} />
                ))}
                <button onClick={() => handleColorChange(selectedDelivery, "auto")} style={{ padding: "2px 6px", fontSize: 10, borderRadius: 4, border: "1px solid #ddd", background: selectedDelivery.delivery_color === "auto" || !selectedDelivery.delivery_color ? "#eee" : "#fff", cursor: "pointer" }}>자동</button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}><span style={{ width: 80, color: "#666", fontSize: 13 }}>출고일</span><span style={{ fontWeight: 700, fontSize: 15 }}>{selectedDelivery.delivery_date}</span></div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}><span style={{ width: 80, color: "#666", fontSize: 13 }}>발주처</span><span style={{ fontWeight: 700 }}>{selectedDelivery.customer_name || "-"}</span></div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}><span style={{ width: 80, color: "#666", fontSize: 13 }}>연락처</span><span>{selectedDelivery.customer_phone || "-"}</span></div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}><span style={{ width: 80, color: "#666", fontSize: 13 }}>규격</span><span style={{ fontWeight: 600 }}>{selectedDelivery.spec || "-"}</span></div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}><span style={{ width: 80, color: "#666", fontSize: 13 }}>현장</span><span>{getSiteName(selectedDelivery) || "-"}</span></div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}><span style={{ width: 80, color: "#666", fontSize: 13 }}>주소</span><span>{selectedDelivery.site_addr || "-"}</span></div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}><span style={{ width: 80, color: "#666", fontSize: 13 }}>입금상태</span><span style={{ fontWeight: 700, color: selectedDelivery.deposit_status === "완료" ? "#2e7d32" : selectedDelivery.deposit_status === "미입금" ? "#c62828" : "#f57f17" }}>{selectedDelivery.deposit_status || "미입금"}</span></div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}><span style={{ width: 80, color: "#666", fontSize: 13 }}>금액</span><span style={{ fontWeight: 700 }}>{fmt(selectedDelivery.total_amount)}원</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ color: "#666", fontSize: 13 }}>옵션</span><span style={{ fontSize: 13, lineHeight: 1.5 }}>{summarizeOptions(selectedDelivery.items, false) || "-"}</span></div>
              {selectedDelivery.memo && <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}><span style={{ color: "#666", fontSize: 13 }}>메모</span><span style={{ fontSize: 13, background: "#f9f9f9", padding: 8, borderRadius: 6 }}>{selectedDelivery.memo}</span></div>}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={() => setSelectedDelivery(null)} style={{ flex: 1, padding: 14, background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>닫기</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: 14, background: "#ffebee", border: "1px solid #f44336", color: "#c62828", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>🗑️ 삭제</button>
              <button onClick={() => { setEditForm(selectedDelivery); setShowEditModal(true); }} style={{ flex: 1, padding: 14, background: "#fff", border: "1px solid #2e5b86", color: "#2e5b86", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>✏️ 수정</button>
              <button onClick={() => setShowDispatchModal(true)} style={{ flex: 1, padding: 14, background: "#2e5b86", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>🚚 배차</button>
            </div>
          </div>
        </div>
      )}

      {selectedDelivery && showEditModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001 }} onClick={() => { setShowEditModal(false); setSelectedDelivery(null); }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "90%", maxWidth: 450, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>✏️ 일정 수정 {selectedDelivery.source === "inventory" && "(재고)"}</h3>
              <button onClick={() => { setShowEditModal(false); setSelectedDelivery(null); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>출고일</label><input type="date" value={editForm.delivery_date || ""} onChange={(e) => setEditForm({ ...editForm, delivery_date: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} /></div>
              {selectedDelivery.source !== "inventory" && (
                <div><label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>구분</label><select value={editForm.contract_type || "order"} onChange={(e) => setEditForm({ ...editForm, contract_type: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }}><option value="order">신품</option><option value="used">중고</option><option value="rental">임대</option><option value="memo">메모</option></select></div>
              )}
              <div><label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>발주처</label><input value={editForm.customer_name || ""} onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} /></div>
              <div><label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>연락처</label><input value={editForm.customer_phone || ""} onChange={(e) => setEditForm({ ...editForm, customer_phone: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} /></div>
              <div><label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>규격</label><input value={editForm.spec || ""} onChange={(e) => setEditForm({ ...editForm, spec: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} /></div>
              <div><label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>{selectedDelivery.source === "inventory" ? "인테리어/주소" : "하차 주소"}</label><input value={editForm.site_addr || ""} onChange={(e) => setEditForm({ ...editForm, site_addr: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box" }} placeholder="시간/주소 입력" /></div>
              <div><label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>메모</label><textarea value={editForm.memo || ""} onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8, boxSizing: "border-box", minHeight: 60, resize: "vertical" }} /></div>
              <div>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 13 }}>색상</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["auto", "red", "orange", "yellow", "green", "blue", "purple", "gray"] as ColorType[]).map((c) => (
                    <button key={c} type="button" onClick={() => setEditForm({ ...editForm, delivery_color: c })} style={{ padding: "6px 12px", borderRadius: 6, border: editForm.delivery_color === c ? "2px solid #333" : "1px solid #ddd", background: c === "auto" ? "#f5f5f5" : colorStyles[c].bg, color: c === "auto" ? "#666" : colorStyles[c].text, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                      {c === "auto" ? "자동" : c === "red" ? "빨강" : c === "orange" ? "주황" : c === "yellow" ? "노랑" : c === "green" ? "초록" : c === "blue" ? "파랑" : c === "purple" ? "보라" : "회색"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 13 }}>배차 상태</label>
                <button type="button" onClick={() => setEditForm({ ...editForm, dispatch_status: editForm.dispatch_status === "완료" ? "" : "완료" })} style={{ padding: "10px 20px", borderRadius: 8, border: editForm.dispatch_status === "완료" ? "2px solid #e65100" : "1px solid #ddd", background: editForm.dispatch_status === "완료" ? "#fff3e0" : "#f5f5f5", color: editForm.dispatch_status === "완료" ? "#e65100" : "#666", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
                  {editForm.dispatch_status === "완료" ? "✓ 배차완료" : "배차 미완료"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={() => setShowEditModal(false)} style={{ flex: 1, padding: 14, background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={handleSaveEdit} style={{ flex: 1, padding: 14, background: "#2e5b86", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {selectedDelivery && showDispatchModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001 }} onClick={() => setShowDispatchModal(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "90%", maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>🚚 배차 양식</h3>
              <button onClick={() => setShowDispatchModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>아래 내용을 복사해서 사용하세요</div>
              <div style={{ background: "#f9f9f9", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{generateDispatchText(selectedDelivery)}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowDispatchModal(false)} style={{ flex: 1, padding: 14, background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>← 뒤로</button>
              <button onClick={handleCopyDispatch} style={{ flex: 1, padding: 14, background: copySuccess ? "#28a745" : "#2e5b86", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", transition: "background 0.2s" }}>{copySuccess ? "✓ 복사됨!" : "📋 복사하기"}</button>
            </div>
          </div>
        </div>
      )}

      {selectedDateItems && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }} onClick={() => setSelectedDateItems(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "90%", maxWidth: 500, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>📅 {selectedDateItems.date} 일정 ({selectedDateItems.items.length}건)</h3>
              <button onClick={() => setSelectedDateItems(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedDateItems.items.map((item, idx) => {
                const color = getItemColor(item);
                const style = colorStyles[color];
                return (
                  <div key={item.quote_id + idx} onClick={() => { setSelectedDateItems(null); setSelectedDelivery(item); setEditForm(item); }} style={{ padding: "12px", background: style.bg, borderLeft: "4px solid " + style.border, borderRadius: 6, cursor: "pointer" }}>
                    <div style={{ fontWeight: 700, color: style.text }}>{getDeliveryLabel(item)}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{item.customer_name} {item.customer_phone && "· " + item.customer_phone}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
