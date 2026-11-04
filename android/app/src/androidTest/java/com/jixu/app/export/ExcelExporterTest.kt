package com.jixu.app.export

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.zip.ZipFile

/**
 * §11 真机冒烟：FastExcel 必须能在 Android 上写出可打开的 xlsx，金额列是数值。
 * 同时防止库升级后静默写坏文件。
 */
@RunWith(AndroidJUnit4::class)
class ExcelExporterTest {

    @Test
    fun writesReadableXlsxWithNumericAmount() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(ctx.cacheDir, "exports/smoke.xlsx")
        if (file.exists()) file.delete()

        ExcelExporter.write(
            file,
            listOf(
                ExportRow("2026-11-04", "expense", "餐饮饮食", "午餐", 12.5, "我", "面"),
                ExportRow("2026-11-03", "income", "其他杂项", "其他", 100.0, "", "报销"),
                ExportRow("2026-11-02", "expense", "交通出行", "公交地铁", 2.0, "爸爸", ""),
            ),
        )

        assertTrue("xlsx 文件不存在或为空", file.length() > 0)

        ZipFile(file).use { zip ->
            val sheetEntry = zip.getEntry("xl/worksheets/sheet1.xml")
            assertTrue("缺少 sheet1.xml", sheetEntry != null)
            val xml = zip.getInputStream(sheetEntry).readBytes().toString(Charsets.UTF_8)
            // 表头在共享字符串表里
            val shared = zip.getEntry("xl/sharedStrings.xml")
            assertTrue("缺少 sharedStrings.xml", shared != null)
            val sharedXml = zip.getInputStream(shared).readBytes().toString(Charsets.UTF_8)
            val sharedText = decodeXmlEntities(sharedXml)
            listOf("日期", "类型", "一级分类", "二级分类", "金额", "记录人", "备注").forEach {
                assertTrue("表头缺少「$it」，sharedStrings=$sharedText", sharedText.contains("<t xml:space=\"preserve\">$it</t>"))
            }
            // 金额是数值单元格（E2/E4），不是共享字符串
            assertTrue("金额未写成数值：$xml", Regex("""r="E2"[^>]*>\s*<v>12\.5</v>""").containsMatchIn(xml))
            assertTrue("金额未写成数值：$xml", Regex("""r="E4"[^>]*>\s*<v>2(\.0)?</v>""").containsMatchIn(xml))
            // 3 行数据 + 表头
            assertEquals(4, Regex("""<row r="\d+"""").findAll(xml).count())
        }
    }

    /** FastExcel 把中文写成 XML 数字实体（&#x65e5;），断言前先还原 */
    private fun decodeXmlEntities(raw: String): String {
        val hex = Regex("""&#x([0-9a-fA-F]+);""")
        val dec = Regex("""&#(\d+);""")
        return raw
            .replace(hex) { it.groupValues[1].toInt(16).toChar().toString() }
            .replace(dec) { it.groupValues[1].toInt().toChar().toString() }
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace("&amp;", "&")
    }
}
