package com.jixu.app.cloud

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** EJSON 解码（开发文档 §5.5）：三种实测形态 + $oid + 科学计数法 + 特殊值。 */
class EjsonTest {

    private fun decode(json: String) = decodeEjson(Json.parseToJsonElement(json)).jsonObject

    @Test
    fun miniappShape_allNumbersAreDouble() {
        val obj = decode("""{"amount":{"${'$'}numberDouble":"12.5"},"updatedAt":{"${'$'}numberDouble":"1.790056990507E+12"}}""")
        assertEquals(12.5, obj["amount"]!!.jsonPrimitive.doubleOrNull!!, 0.0)
        assertEquals(1.790056990507E+12, obj["updatedAt"]!!.jsonPrimitive.doubleOrNull!!, 0.0)
        assertEquals(1790056990507.0, obj["updatedAt"]!!.jsonPrimitive.doubleOrNull!!, 0.0)
    }

    @Test
    fun desktopShape_intAndLong() {
        val obj = decode("""{"amount":{"${'$'}numberInt":"25"},"updatedAt":{"${'$'}numberLong":"1790056665029"}}""")
        assertEquals(25.0, obj["amount"]!!.jsonPrimitive.doubleOrNull!!, 0.0)
        assertEquals(1790056665029L, obj["updatedAt"]!!.jsonPrimitive.longOrNull)
    }

    @Test
    fun httpApiShape_doubleAndLong() {
        val obj = decode("""{"amount":{"${'$'}numberDouble":"12.5"},"createdAt":{"${'$'}numberLong":"1793698628000"}}""")
        assertEquals(12.5, obj["amount"]!!.jsonPrimitive.doubleOrNull!!, 0.0)
        assertEquals(1793698628000L, obj["createdAt"]!!.jsonPrimitive.longOrNull)
    }

    @Test
    fun oidBecomesString() {
        val obj = decode("""{"_id":{"${'$'}oid":"8cda0ccf6ae9ab450000bad156a997e6"}}""")
        assertEquals("8cda0ccf6ae9ab450000bad156a997e6", obj["_id"]!!.jsonPrimitive.content)
        assertTrue(obj["_id"]!!.jsonPrimitive.isString)
    }

    @Test
    fun specialDoubles() {
        val obj = decode(
            """{"a":{"${'$'}numberDouble":"Infinity"},"b":{"${'$'}numberDouble":"-Infinity"},"c":{"${'$'}numberDouble":"NaN"}}""",
        )
        assertEquals(Double.POSITIVE_INFINITY, obj["a"]!!.jsonPrimitive.doubleOrNull!!, 0.0)
        assertEquals(Double.NEGATIVE_INFINITY, obj["b"]!!.jsonPrimitive.doubleOrNull!!, 0.0)
        assertTrue(obj["c"]!!.jsonPrimitive.doubleOrNull!!.isNaN())
    }

    @Test
    fun dateBecomesMillis() {
        val obj = decode("""{"at":{"${'$'}date":1793698628000},"nested":{"${'$'}date":{"${'$'}numberLong":"1793698628000"}}}""")
        assertEquals(1793698628000L, obj["at"]!!.jsonPrimitive.longOrNull)
        assertEquals(1793698628000L, obj["nested"]!!.jsonPrimitive.longOrNull)
    }

    @Test
    fun recursionThroughArraysAndObjects() {
        val obj = decode(
            """{"list":[{"amount":{"${'$'}numberInt":"3"}},{"amount":{"${'$'}numberDouble":"1.5"}}],"meta":{"n":{"${'$'}numberLong":"7"}}}""",
        )
        val amounts = (obj["list"] as kotlinx.serialization.json.JsonArray).map {
            it.jsonObject["amount"]!!.jsonPrimitive.doubleOrNull
        }
        assertEquals(listOf(3.0, 1.5), amounts)
        assertEquals(7L, obj["meta"]!!.jsonObject["n"]!!.jsonPrimitive.longOrNull)
    }

    @Test
    fun unrelatedObjectsLeftAlone() {
        val obj = decode("""{"name":"计序","flag":true,"plain":{"x":1}}""")
        assertEquals("计序", obj["name"]!!.jsonPrimitive.content)
        assertEquals(true, obj["flag"]!!.jsonPrimitive.booleanOrNull)
        assertEquals(1, obj["plain"]!!.jsonObject["x"]!!.jsonPrimitive.int)
    }
}
