import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { dbAll, dbGet } from "@/lib/db";
import {
  summarizeMonth,
  calcMonthTotal,
  formatMinutes,
  type AttendanceRecord,
} from "@/lib/attendance";
import {
  listExpensesForUser,
  statusLabel,
  type ExpenseClaim,
} from "@/lib/expenses";
import {
  jstComponents,
  dayOfWeekFromYmd,
  formatTime as formatJSTTime,
  businessMonthRange,
} from "@/lib/time";

const DAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return formatJSTTime(iso);
}

export async function GET(req: Request) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const defaultYm = (() => {
    const c = jstComponents();
    return `${c.year}-${String(c.month).padStart(2, "0")}`;
  })();
  const ym = url.searchParams.get("ym") ?? defaultYm;
  const requestedUserId = Number(url.searchParams.get("user_id") ?? current.id);

  // 他人の勤怠はadminのみ閲覧可
  if (requestedUserId !== current.id && current.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await dbGet<{
    id: number;
    name: string;
    login_id: string;
    standard_work_minutes: number | null;
  }>(
    `SELECT id, name, login_id, standard_work_minutes FROM users WHERE id = ?`,
    [requestedUserId],
  );
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });
  const standardWorkMinutes = user.standard_work_minutes ?? 435;

  const [yearStr, monthStr] = ym.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const monthRange = businessMonthRange(year, month);
  const records = await dbAll<AttendanceRecord>(
    `SELECT punch_type, punched_at, kind, leave_minutes
     FROM attendance_records
     WHERE user_id = ? AND punched_at >= ? AND punched_at < ?
     ORDER BY punched_at ASC`,
    [user.id, monthRange.startIso, monthRange.endIso],
  );

  const summaries = summarizeMonth(year, month, records, standardWorkMinutes);
  const total = calcMonthTotal(summaries);

  // Excel生成
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UniTime";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(`${year}年${month}月`);

  // タイトル
  sheet.mergeCells("A1:J1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `月次勤怠表 — ${year}年${month}月`;
  titleCell.font = { name: "Yu Gothic", size: 16, bold: true };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;

  // 従業員情報
  sheet.getCell("A3").value = "会社名:";
  sheet.getCell("B3").value = "株式会社ユニポール";
  sheet.getCell("A4").value = "従業員氏名:";
  sheet.getCell("B4").value = user.name;
  sheet.getCell("D3").value = "対象月:";
  sheet.getCell("E3").value = `${year}年${month}月`;
  sheet.getCell("D4").value = "出力日:";
  // 出力日はJST
  const nowJst = jstComponents();
  sheet.getCell("E4").value = `${nowJst.year}/${nowJst.month}/${nowJst.day}`;

  for (const addr of ["A3", "A4", "D3", "D4"]) {
    sheet.getCell(addr).font = { name: "Yu Gothic", size: 10, bold: true };
  }
  for (const addr of ["B3", "B4", "E3", "E4"]) {
    sheet.getCell(addr).font = { name: "Yu Gothic", size: 10 };
  }

  // テーブルヘッダー（所定=${(standardWorkMinutes/60).toFixed(2)}hベース）
  const headerRow = 6;
  const headers = [
    "日付",
    "曜日",
    "出勤",
    "退勤",
    "休憩",
    "実働",
    "所定外",
    "法定外",
    "深夜",
    "深夜残業",
    "法定休日",
  ];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { name: "Yu Gothic", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E40AF" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });
  sheet.getRow(headerRow).height = 22;

  // データ行
  summaries.forEach((s, idx) => {
    const rowNum = headerRow + 1 + idx;
    // s.date は "YYYY-MM-DD"（JSTローカル日付）
    const [, sMonth, sDay] = s.date.split("-").map(Number);
    const dow = dayOfWeekFromYmd(s.date);
    const dayOfWeek = DAY_JP[dow];
    const isWeekend = dow === 0 || dow === 6;

    const values = [
      `${sMonth}/${sDay}`,
      dayOfWeek,
      formatTime(s.clockIn),
      formatTime(s.clockOut),
      s.breakMinutes > 0 ? formatMinutes(s.breakMinutes) : "",
      s.workMinutes > 0 ? formatMinutes(s.workMinutes) : "",
      s.scheduledOvertimeMinutes > 0 ? formatMinutes(s.scheduledOvertimeMinutes) : "",
      s.overtimeMinutes > 0 ? formatMinutes(s.overtimeMinutes) : "",
      s.nightMinutes > 0 ? formatMinutes(s.nightMinutes) : "",
      s.nightOvertimeMinutes > 0 ? formatMinutes(s.nightOvertimeMinutes) : "",
      s.holidayMinutes > 0 ? formatMinutes(s.holidayMinutes) : "",
    ];

    values.forEach((v, i) => {
      const cell = sheet.getCell(rowNum, i + 1);
      cell.value = v;
      cell.font = { name: "Yu Gothic", size: 10 };
      cell.alignment = { horizontal: i < 2 ? "center" : "right", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      if (isWeekend) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      }
    });
  });

  // 合計行
  const totalRow = headerRow + 1 + summaries.length + 1;
  sheet.getCell(totalRow, 1).value = "合計";
  sheet.mergeCells(totalRow, 1, totalRow, 4);
  sheet.getCell(totalRow, 5).value = formatMinutes(total.totalBreakMinutes);
  sheet.getCell(totalRow, 6).value = formatMinutes(total.totalWorkMinutes);
  sheet.getCell(totalRow, 7).value = formatMinutes(total.totalScheduledOvertimeMinutes);
  sheet.getCell(totalRow, 8).value = formatMinutes(total.totalOvertimeMinutes);
  sheet.getCell(totalRow, 9).value = formatMinutes(total.totalNightMinutes);
  sheet.getCell(totalRow, 10).value = formatMinutes(total.totalNightOvertimeMinutes);
  sheet.getCell(totalRow, 11).value = formatMinutes(total.totalHolidayMinutes);

  for (let c = 1; c <= 11; c++) {
    const cell = sheet.getCell(totalRow, c);
    cell.font = { name: "Yu Gothic", size: 10, bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDBEAFE" },
    };
    cell.alignment = { horizontal: c === 1 ? "center" : "right", vertical: "middle" };
    cell.border = {
      top: { style: "medium" },
      bottom: { style: "medium" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  }

  // 稼働日数サマリ
  const summaryRow = totalRow + 2;
  sheet.getCell(summaryRow, 1).value = "稼働日数:";
  sheet.getCell(summaryRow, 2).value = `${total.workDays}日`;
  sheet.getCell(summaryRow, 3).value = "土日出勤:";
  sheet.getCell(summaryRow, 4).value = `${total.weekendWorkDays}日`;
  for (const col of [1, 3]) {
    sheet.getCell(summaryRow, col).font = { name: "Yu Gothic", size: 10, bold: true };
  }
  for (const col of [2, 4]) {
    sheet.getCell(summaryRow, col).font = { name: "Yu Gothic", size: 10 };
  }

  // 注意書き
  const stdH = (standardWorkMinutes / 60).toFixed(2);
  const noteRow = summaryRow + 2;
  sheet.mergeCells(noteRow, 1, noteRow, 11);
  sheet.getCell(noteRow, 1).value =
    `※ 所定労働時間=${stdH}h。業務日は JST 04:00 境界（日跨ぎ勤務は出勤日に集約）。所定外=所定超え〜法定8hまで（割増なし）、法定外=8h超（25%割増対象）、深夜=22:00-5:00（25%）、深夜残業=深夜帯と法定外の重なり（+25%加算で50%）。最終的な割増賃金計算は社労士事務所で実施。`;
  sheet.getCell(noteRow, 1).font = { name: "Yu Gothic", size: 9, italic: true, color: { argb: "FF6B7280" } };
  sheet.getCell(noteRow, 1).alignment = { wrapText: true, vertical: "top" };
  sheet.getRow(noteRow).height = 32;

  // 列幅
  sheet.columns = [
    { width: 10 },  // 日付
    { width: 6 },   // 曜日
    { width: 10 },  // 出勤
    { width: 10 },  // 退勤
    { width: 10 },  // 休憩
    { width: 10 },  // 実働
    { width: 10 },  // 所定外
    { width: 10 },  // 法定外
    { width: 10 },  // 深夜
    { width: 12 },  // 深夜残業
    { width: 12 },  // 法定休日
  ];

  // --- 立替精算シート（自分の申請を添付）---
  const expenses = await listExpensesForUser(user.id);
  const monthExpenses = expenses.filter((c) => c.claim_date.startsWith(ym));
  if (monthExpenses.length > 0) {
    addExpenseSheet(workbook, user.name, year, month, monthExpenses);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `勤怠_${user.name}_${year}年${month}月.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

function addExpenseSheet(
  workbook: ExcelJS.Workbook,
  userName: string,
  year: number,
  month: number,
  claims: ExpenseClaim[],
) {
  const sheet = workbook.addWorksheet("立替精算");

  // タイトル
  sheet.mergeCells("A1:I1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `立替精算 — ${userName} / ${year}年${month}月`;
  titleCell.font = { name: "Yu Gothic", size: 14, bold: true };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 24;

  // ヘッダー
  const headerRow = 3;
  const headers = [
    "申請日",
    "カテゴリ",
    "金額",
    "用途",
    "出発地",
    "到着地",
    "案件名",
    "ステータス",
    "承認者",
  ];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { name: "Yu Gothic", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E40AF" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });
  sheet.getRow(headerRow).height = 22;

  // データ行
  claims.forEach((c, idx) => {
    const rowNum = headerRow + 1 + idx;
    const values: (string | number)[] = [
      c.claim_date,
      c.category,
      c.amount,
      c.purpose,
      c.route_from ?? "",
      c.route_to ?? "",
      c.project_name ?? "",
      statusLabel(c.status),
      c.approver_name ?? "",
    ];
    values.forEach((v, i) => {
      const cell = sheet.getCell(rowNum, i + 1);
      cell.value = v;
      cell.font = { name: "Yu Gothic", size: 10 };
      cell.alignment = {
        horizontal: i === 2 ? "right" : i === 0 || i === 1 || i === 7 ? "center" : "left",
        vertical: "middle",
        wrapText: i === 3,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      if (i === 2) {
        cell.numFmt = '"¥"#,##0';
      }
      if (c.status === "rejected") {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEE2E2" },
        };
      } else if (c.status === "approved") {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD1FAE5" },
        };
      }
    });
  });

  // 合計行
  const totalsByStatus = claims.reduce(
    (acc, c) => {
      if (c.status === "approved") acc.approved += c.amount;
      else if (c.status === "pending" || c.status === "ai_flagged") acc.pending += c.amount;
      return acc;
    },
    { approved: 0, pending: 0 },
  );
  const totalRow = headerRow + 1 + claims.length + 1;
  sheet.getCell(totalRow, 1).value = "承認済・振込済 合計:";
  sheet.mergeCells(totalRow, 1, totalRow, 2);
  sheet.getCell(totalRow, 3).value = totalsByStatus.approved;
  sheet.getCell(totalRow, 3).numFmt = '"¥"#,##0';
  sheet.getCell(totalRow + 1, 1).value = "承認待ち 合計:";
  sheet.mergeCells(totalRow + 1, 1, totalRow + 1, 2);
  sheet.getCell(totalRow + 1, 3).value = totalsByStatus.pending;
  sheet.getCell(totalRow + 1, 3).numFmt = '"¥"#,##0';
  for (const r of [totalRow, totalRow + 1]) {
    for (let c = 1; c <= 3; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = { name: "Yu Gothic", size: 10, bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDBEAFE" },
      };
      cell.alignment = { horizontal: c === 3 ? "right" : "left", vertical: "middle" };
    }
  }

  // 列幅
  sheet.columns = [
    { width: 12 }, // 申請日
    { width: 10 }, // カテゴリ
    { width: 12 }, // 金額
    { width: 40 }, // 用途
    { width: 14 }, // 出発地
    { width: 14 }, // 到着地
    { width: 20 }, // 案件名
    { width: 16 }, // ステータス
    { width: 12 }, // 承認者
  ];
}
