package com.jixu.app.export

import org.dhatim.fastexcel.Workbook
import java.io.File
import java.io.FileOutputStream

/** 导出行（§11：列 = 日期、类型、一级分类、二级分类、金额、记录人、备注） */
data class ExportRow(
    val date: String,
    val type: String,
    val categoryName: String,
    val subcategoryName: String,
    val amount: Double,
    val person: String,
    val note: String,
)

/** Excel 导出（开发文档 §11）。金额写成数值单元格，Excel 里可直接求和。 */
object ExcelExporter {

    const val SHEET_NAME = "账单"

    private val HEADERS = listOf("日期", "类型", "一级分类", "二级分类", "金额", "记录人", "备注")

    /** 写出 xlsx；调用方负责传 `cacheDir/exports/计序_YYYY-MM-DD.xlsx` */
    fun write(file: File, rows: List<ExportRow>): File {
        file.parentFile?.mkdirs()
        FileOutputStream(file).use { out ->
            val wb = Workbook(out, "计序", "1.0")
            val ws = wb.newWorksheet(SHEET_NAME)
            HEADERS.forEachIndexed { col, text -> ws.value(0, col, text) }
            rows.forEachIndexed { index, r ->
                val row = index + 1
                ws.value(row, 0, r.date)
                ws.value(row, 1, if (r.type == "income") "收入" else "支出")
                ws.value(row, 2, r.categoryName)
                ws.value(row, 3, r.subcategoryName)
                // 数值单元格：Excel 里能直接求和，不能写成字符串
                ws.value(row, 4, r.amount)
                ws.value(row, 5, r.person)
                ws.value(row, 6, r.note)
            }
            wb.finish()
        }
        return file
    }
}
