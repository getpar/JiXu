package com.jixu.app.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * 16 组金标准（android/fixtures/golden-vectors.json，由线上 TS 源码实时生成）。
 * 只读 fixtures，绝不修改；任何一条不过都不算完成。
 */
class GoldenVectorsTest {

    private val root: JsonObject by lazy {
        val stream = javaClass.getResourceAsStream("/golden-vectors.json")
            ?: error("测试资源缺失：/golden-vectors.json（检查 app/build.gradle.kts 的 sourceSets 配置）")
        Json.parseToJsonElement(stream.bufferedReader().use { it.readText() }).jsonObject
    }

    private fun rows(group: String): JsonArray = root[group]!!.jsonArray

    @Test
    fun amountToKeyString() {
        var n = 0
        for ((i, row) in rows("amountToKeyString").withIndex()) {
            val o = row.jsonObject
            val expected = o["key"]!!.jsonPrimitive.content
            val actual = recordKey("2026-11-03", o["amount"].asJsDouble(), "lunch", "expense")
            assertEquals("amountToKeyString 第 ${i + 1} 条（amount=${o["amount"]}）", expected, actual)
            n++
        }
        println("amountToKeyString: $n/${rows("amountToKeyString").size} 通过")
    }

    @Test
    fun parseRecordKey() {
        var n = 0
        for ((i, row) in rows("parseRecordKey").withIndex()) {
            val o = row.jsonObject
            val key = o["key"]!!.jsonPrimitive.content
            val expected = o["result"]
            val actual = parseRecordKey(key)
            if (expected == null || expected is JsonNull) {
                assertNull("parseRecordKey 第 ${i + 1} 条（key=\"$key\"）应为 null", actual)
            } else {
                val e = expected.jsonObject
                assertTrue("parseRecordKey 第 ${i + 1} 条（key=\"$key\"）不应为 null", actual != null)
                assertEquals("date", e["date"]!!.jsonPrimitive.content, actual!!.date)
                assertEquals("amount", e["amount"].asJsDouble(), actual.amount, 0.0)
                assertEquals("subcategoryKey", e["subcategoryKey"]!!.jsonPrimitive.content, actual.subcategoryKey)
                assertEquals("type", e["type"]!!.jsonPrimitive.content, actual.type)
            }
            n++
        }
        println("parseRecordKey: $n/${rows("parseRecordKey").size} 通过")
    }

    @Test
    fun formatMoney() {
        var n = 0
        for ((i, row) in rows("formatMoney").withIndex()) {
            val o = row.jsonObject
            val value = o["value"].asJsDouble()
            val decimals = o["decimals"]!!.jsonPrimitive.int
            val expected = o["result"]!!.jsonPrimitive.content
            assertEquals("formatMoney 第 ${i + 1} 条（value=${o["value"]}, decimals=$decimals）", expected, formatMoney(value, decimals))
            n++
        }
        println("formatMoney: $n/${rows("formatMoney").size} 通过")
    }

    @Test
    fun formatMoneyExact() {
        var n = 0
        for ((i, row) in rows("formatMoneyExact").withIndex()) {
            val o = row.jsonObject
            val value = o["value"].asJsDouble()
            val expected = o["result"]!!.jsonPrimitive.content
            assertEquals("formatMoneyExact 第 ${i + 1} 条（value=${o["value"]}）", expected, formatMoneyExact(value))
            n++
        }
        println("formatMoneyExact: $n/${rows("formatMoneyExact").size} 通过")
    }

    @Test
    fun parseAmountInput() {
        var n = 0
        for ((i, row) in rows("parseAmountInput").withIndex()) {
            val o = row.jsonObject
            val input = o["input"]!!.jsonPrimitive.content
            val expected = o["result"]!!.jsonObject
            val actual = parseAmountInput(input)
            assertEquals("parseAmountInput 第 ${i + 1} 条（input=\"$input\"）ok", expected["ok"]!!.jsonPrimitive.booleanOrNull, actual.ok)
            assertEquals("parseAmountInput 第 ${i + 1} 条（input=\"$input\"）value", expected["value"].asJsDouble(), actual.value, 0.0)
            assertEquals("parseAmountInput 第 ${i + 1} 条（input=\"$input\"）message", expected["message"]!!.jsonPrimitive.content, actual.message)
            n++
        }
        println("parseAmountInput: $n/${rows("parseAmountInput").size} 通过")
    }

    @Test
    fun sanitizeAmountInput() {
        var n = 0
        for ((i, row) in rows("sanitizeAmountInput").withIndex()) {
            val o = row.jsonObject
            val input = o["input"]!!.jsonPrimitive.content
            val expected = o["result"]!!.jsonPrimitive.content
            assertEquals("sanitizeAmountInput 第 ${i + 1} 条（input=\"$input\"）", expected, sanitizeAmountInput(input))
            n++
        }
        println("sanitizeAmountInput: $n/${rows("sanitizeAmountInput").size} 通过")
    }

    @Test
    fun sumAmounts() {
        var n = 0
        for ((i, row) in rows("sumAmounts").withIndex()) {
            val o = row.jsonObject
            val values = o["values"]!!.jsonArray.map { it.asJsDouble() }.toDoubleArray()
            val expected = o["result"].asJsDouble()
            assertEquals("sumAmounts 第 ${i + 1} 条（values=${o["values"]}）", expected, sumAmounts(values), 0.0)
            n++
        }
        println("sumAmounts: $n/${rows("sumAmounts").size} 通过")
    }

    @Test
    fun isValidAmount() {
        var n = 0
        for ((i, row) in rows("isValidAmount").withIndex()) {
            val o = row.jsonObject
            val expected = o["result"]!!.jsonPrimitive.booleanOrNull!!
            assertEquals("isValidAmount 第 ${i + 1} 条（value=${o["value"]}）", expected, isValidAmount(o["value"].asJsDouble()))
            n++
        }
        println("isValidAmount: $n/${rows("isValidAmount").size} 通过")
    }

    @Test
    fun isSuspiciousAmount() {
        var n = 0
        for ((i, row) in rows("isSuspiciousAmount").withIndex()) {
            val o = row.jsonObject
            val expected = o["result"]!!.jsonPrimitive.booleanOrNull!!
            assertEquals("isSuspiciousAmount 第 ${i + 1} 条（value=${o["value"]}）", expected, isSuspiciousAmount(o["value"].asJsDouble()))
            n++
        }
        println("isSuspiciousAmount: $n/${rows("isSuspiciousAmount").size} 通过")
    }

    @Test
    fun advanceDate() {
        var n = 0
        for ((i, row) in rows("advanceDate").withIndex()) {
            val o = row.jsonObject
            val date = o["date"]!!.jsonPrimitive.content
            val cycle = o["cycle"]!!.jsonPrimitive.content
            val expected = o["result"]!!.jsonPrimitive.content
            assertEquals("advanceDate 第 ${i + 1} 条（$date / $cycle）", expected, advanceDate(date, cycle))
            n++
        }
        println("advanceDate: $n/${rows("advanceDate").size} 通过")
    }

    @Test
    fun normalizeOwnerId() {
        var n = 0
        for ((i, row) in rows("normalizeOwnerId").withIndex()) {
            val o = row.jsonObject
            val input = o["input"]!!.jsonPrimitive.content
            val expected = o["result"]!!.jsonPrimitive.content
            assertEquals("normalizeOwnerId 第 ${i + 1} 条（input=\"$input\"）", expected, normalizeOwnerId(input))
            n++
        }
        println("normalizeOwnerId: $n/${rows("normalizeOwnerId").size} 通过")
    }

    @Test
    fun formatOwnerId() {
        var n = 0
        for ((i, row) in rows("formatOwnerId").withIndex()) {
            val o = row.jsonObject
            val input = o["input"]!!.jsonPrimitive.content
            val expected = o["result"]!!.jsonPrimitive.content
            assertEquals("formatOwnerId 第 ${i + 1} 条（input=\"$input\"）", expected, formatOwnerId(input))
            n++
        }
        println("formatOwnerId: $n/${rows("formatOwnerId").size} 通过")
    }

    @Test
    fun isValidOwnerId() {
        var n = 0
        for ((i, row) in rows("isValidOwnerId").withIndex()) {
            val o = row.jsonObject
            val input = o["input"]!!.jsonPrimitive.content
            val expected = o["result"]!!.jsonPrimitive.booleanOrNull!!
            assertEquals("isValidOwnerId 第 ${i + 1} 条（input=\"$input\"）", expected, isValidOwnerId(input))
            n++
        }
        println("isValidOwnerId: $n/${rows("isValidOwnerId").size} 通过")
    }

    @Test
    fun docLabel() {
        var n = 0
        for ((i, row) in rows("docLabel").withIndex()) {
            val o = row.jsonObject
            val expected = o["result"]!!.jsonPrimitive.content
            assertEquals("docLabel 第 ${i + 1} 条", expected, docLabel(o["record"]!!.jsonObject))
            n++
        }
        println("docLabel: $n/${rows("docLabel").size} 通过")
    }

    @Test
    fun cloudToLocal() {
        var n = 0
        for ((i, row) in rows("cloudToLocal").withIndex()) {
            val o = row.jsonObject
            val actual = cloudToLocal(o["cloud"]!!.jsonObject)
            assertJsonEquals(o["local"]!!, actual, "cloudToLocal 第 ${i + 1} 条")
            n++
        }
        println("cloudToLocal: $n/${rows("cloudToLocal").size} 通过")
    }

    @Test
    fun localToCloud() {
        var n = 0
        for ((i, row) in rows("localToCloud").withIndex()) {
            val o = row.jsonObject
            val source = o["source"]!!.jsonPrimitive.content
            val now = o["now"].asJsDouble().toLong()
            val ownerId = o["ownerId"]!!.jsonPrimitive.content
            val actual = localToCloud(o["local"]!!.jsonObject, source, now, ownerId)
            assertJsonEquals(o["cloud"]!!, actual, "localToCloud 第 ${i + 1} 条")
            n++
        }
        println("localToCloud: $n/${rows("localToCloud").size} 通过")
    }

    // ---- 工具 ----

    /** JSON 里 "NaN"/"Infinity"/"-Infinity" 是字符串占位，还原成对应 Double。 */
    private fun JsonElement?.asJsDouble(): Double {
        val p = this as? JsonPrimitive ?: return Double.NaN
        if (p.isString) {
            return when (p.content) {
                "NaN" -> Double.NaN
                "Infinity" -> Double.POSITIVE_INFINITY
                "-Infinity" -> Double.NEGATIVE_INFINITY
                else -> p.content.toDoubleOrNull() ?: Double.NaN
            }
        }
        return p.doubleOrNull ?: Double.NaN
    }

    /**
     * 开发文档 §6.8 比较规则：数字按数值比、对象按键比（键序无关）、值为 null 的键视同不存在。
     */
    private fun assertJsonEquals(expected: JsonElement?, actual: JsonElement?, path: String) {
        val e = expected?.takeUnless { it is JsonNull }
        val a = actual?.takeUnless { it is JsonNull }
        if (e == null || a == null) {
            if (!(e == null && a == null)) fail("$path：期望 ${e ?: "null"}，实际 ${a ?: "null"}")
            return
        }
        when {
            e is JsonObject && a is JsonObject -> {
                val ek = e.keys.filter { e[it] !is JsonNull }
                val ak = a.keys.filter { a[it] !is JsonNull }
                assertEquals("$path 键集合", ek.toSet(), ak.toSet())
                for (k in ek) assertJsonEquals(e[k], a[k], "$path.$k")
            }
            e is JsonArray && a is JsonArray -> {
                assertEquals("$path 长度", e.size, a.size)
                for (i in e.indices) assertJsonEquals(e[i], a[i], "$path[$i]")
            }
            e is JsonPrimitive && a is JsonPrimitive -> {
                if (e.isString || a.isString) {
                    assertEquals(path, e.content, a.content)
                } else {
                    assertEquals(path, e.double, a.double, 0.0)
                }
            }
            else -> fail("$path：类型不一致（${e::class.simpleName} vs ${a::class.simpleName}）")
        }
    }
}
