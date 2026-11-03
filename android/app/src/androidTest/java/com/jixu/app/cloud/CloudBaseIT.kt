package com.jixu.app.cloud

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.jixu.app.core.isValidOwnerId
import com.jixu.app.core.localDateStr
import com.jixu.app.core.normalizeOwnerId
import com.jixu.app.core.recordKey
import com.jixu.app.sync.KVStore
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume
import org.junit.Test
import org.junit.runner.RunWith

/**
 * 云端联调（开发文档 §5、§15）：**默认不跑**，必须手动指定测试同步码才执行：
 *
 * ```
 * ./gradlew :app:connectedDebugAndroidTest \
 *   -Pandroid.testInstrumentationRunnerArguments.class=com.jixu.app.cloud.CloudBaseIT \
 *   -Pandroid.testInstrumentationRunnerArguments.testOwnerId=ABCD-EFGH-JKMN
 * ```
 *
 * 流程：匿名登录 → 新增 1 条账单 + 1 张删除凭证 + 1 份待办快照 → count 与分页读回并核对字段
 * （含 EJSON 解码）→ 用 DELETE 删掉自己插入的文档 → count 回到测试前的数。
 *
 * 铁律：只用手工生成的**测试**同步码，绝不用真实账本的码（§5.8）。登录态用内存存储，
 * 不覆盖手机上 App 的登录态与账本。
 */
@RunWith(AndroidJUnit4::class)
class CloudBaseIT {

    private class MemoryStore : KVStore {
        private val map = mutableMapOf<String, String>()
        override suspend fun get(key: String): String? = map[key]
        override suspend fun set(key: String, value: String) {
            map[key] = value
        }

        override suspend fun remove(key: String) {
            map.remove(key)
        }

        override suspend fun clear() {
            map.clear()
        }
    }

    @Test
    fun login_addThreeKinds_readBack_cleanUp() = runBlocking {
        val args = InstrumentationRegistry.getArguments()
        val rawOwner = args.getString("testOwnerId")
        Assume.assumeTrue(
            "未指定测试同步码，跳过云端联调。加 -Pandroid.testInstrumentationRunnerArguments.testOwnerId=XXXX-XXXX-XXXX",
            !rawOwner.isNullOrBlank(),
        )
        val ownerId = normalizeOwnerId(rawOwner)
        Assume.assumeTrue("测试同步码格式不对（至少 8 位）", isValidOwnerId(ownerId))

        val envId = args.getString("testEnvId")?.trim()?.takeIf { it.isNotEmpty() } ?: CloudEnv.DEFAULT_ENV_ID
        val store = MemoryStore()
        val transport = OkHttpTransport()
        val auth = CloudBaseAuth(transport, store)
        val cloud = CloudBaseCollection(transport, auth, envIdProvider = { envId })

        step("环境 $envId，测试同步码 ${ownerId.take(4)}****")

        // 1. 匿名登录
        val token = auth.accessToken(envId)
        assertTrue("access_token 不能为空", token.isNotEmpty())
        step("① 匿名登录成功 access=${maskToken(token)}")

        val baseline = cloud.count(ownerId)
        step("② 测试前该码文档数 = $baseline")

        val now = System.currentTimeMillis()
        val source = "android:it${(now % 100000).toString().padStart(5, '0')}"
        val today = localDateStr()

        val recDoc = buildJsonObject {
            put("type", "expense")
            put("amount", JsonPrimitive(12.5))
            put("categoryKey", "food")
            put("categoryName", "餐饮饮食")
            put("subcategoryKey", "lunch")
            put("subcategoryName", "午餐")
            put("note", "P4联调")
            put("person", "")
            put("date", today)
            put("createdAt", JsonPrimitive(now))
            put("updatedAt", JsonPrimitive(now))
            put("source", source)
            put("ownerId", ownerId)
        }
        val targetKey = recordKey(today, 12.5, "lunch", "expense")

        val tombDoc = buildJsonObject {
            put("kind", "tombstone")
            put("targetKey", targetKey)
            put("ownerId", ownerId)
            put("updatedAt", JsonPrimitive(now + 1))
            put("source", source)
            put("label", "$today 餐饮饮食/午餐 ¥12.50 P4联调")
        }

        val todoDoc = buildJsonObject {
            put("kind", "todo")
            put("entityId", "a_${now}_itest")
            put("ownerId", ownerId)
            put("updatedAt", JsonPrimitive(now + 2))
            put("source", source)
            put(
                "data",
                buildJsonObject {
                    put("id", "a_${now}_itest")
                    put("title", "交房租")
                    put("cycle", "monthly")
                    put("nextDate", today)
                    put("isActive", JsonPrimitive(true))
                    put("amount", JsonPrimitive(2400.0))
                    put("categoryKey", "housing")
                    put("categoryName", "住房居家")
                    put("subcategoryKey", "rent")
                    put("subcategoryName", "房租/房贷")
                    put("note", "")
                    put("completedDates", JsonArray(listOf(JsonPrimitive(today))))
                    put("createdAt", today)
                    put("updatedAt", JsonPrimitive(now + 2))
                    put("deleted", JsonPrimitive(false))
                },
            )
        }

        val inserted = mutableListOf<String>()
        try {
            // 2. 三种文档各新增一条
            for ((name, doc) in listOf("账单" to recDoc, "删除凭证" to tombDoc, "待办快照" to todoDoc)) {
                val id = cloud.add(doc) ?: error("新增${name}失败（云端返回 null）")
                inserted += id
                step("③ 新增$name → _id=$id")
            }

            // 3. count 与分页读回
            val afterCount = cloud.count(ownerId)
            assertEquals("新增后计数应 +3", baseline + 3, afterCount)
            step("④ count 校验通过：$baseline → $afterCount")

            val all = cloud.listAll(ownerId)
            assertEquals("listAll 应与 count 一致", afterCount, all.size)
            val ids = all.mapNotNull { it.text("_id") }
            assertEquals("分页读回不能有重复 _id", all.size, ids.toSet().size)
            step("⑤ 分页读回 ${all.size} 条，_id 无重复")

            val byId = all.associateBy { it.text("_id") }

            // 账单：EJSON 的 amount($numberDouble 12.5)、updatedAt($numberLong) 必须解成数字
            assertNotNull("读回缺少刚插入的账单", byId[inserted[0]])
            val rec = byId.getValue(inserted[0])
            assertEquals(12.5, rec.num("amount") ?: Double.NaN, 0.0)
            assertEquals(now, rec.num("updatedAt")?.toLong())
            assertEquals("P4联调", rec.text("note"))
            assertEquals(today, rec.text("date"))
            assertEquals(ownerId, rec.text("ownerId"))
            step("⑥ 账单字段核对通过：amount=${rec.num("amount")} updatedAt=${rec.num("updatedAt")?.toLong()}")

            val tomb = byId.getValue(inserted[1])
            assertEquals("tombstone", tomb.text("kind"))
            assertEquals(targetKey, tomb.text("targetKey"))
            step("⑦ 删除凭证字段核对通过：targetKey=$targetKey")

            val todo = byId.getValue(inserted[2])
            assertEquals("todo", todo.text("kind"))
            val data = todo["data"] as? JsonObject ?: error("快照 data 不是对象")
            assertEquals("交房租", data.text("title"))
            assertEquals("monthly", data.text("cycle"))
            assertEquals(2400.0, data.num("amount") ?: Double.NaN, 0.0)
            assertEquals(today, data.text("nextDate"))
            assertTrue("isActive 必须解成布尔", (data["isActive"] as? JsonPrimitive)?.booleanOrNull == true)
            assertTrue("completedDates 必须解成数组", data["completedDates"] is JsonArray)
            step("⑧ 待办快照字段核对通过：title=${data.text("title")}")
        } finally {
            // 4. 清理：只删本次插入的 _id
            for (id in inserted) {
                val ok = cloud.delete(id)
                step("⑨ 清理 _id=$id → ${if (ok) "已删除" else "删除失败"}")
                assertTrue("清理失败，云端会留残留：$id", ok)
            }
            val finalCount = cloud.count(ownerId)
            step("⑩ 清理后计数 = $finalCount（测试前 $baseline）")
            assertEquals("云端必须无残留", baseline, finalCount)
        }
    }

    private fun step(message: String) {
        Log.i(TAG, message)
        println("[CloudBaseIT] $message")
    }

    private fun JsonObject.text(key: String): String? =
        (this[key] as? JsonPrimitive)?.let { if (it.isString) it.content else it.content }

    private fun JsonObject.num(key: String): Double? =
        (this[key] as? JsonPrimitive)?.doubleOrNull ?: (this[key] as? JsonPrimitive)?.content?.toDoubleOrNull()

    private companion object {
        const val TAG = "CloudBaseIT"
    }
}
