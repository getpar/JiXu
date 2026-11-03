package com.jixu.app.sync

import com.jixu.app.core.cloudToLocal
import com.jixu.app.core.docLabel
import com.jixu.app.core.isValidOwnerId
import com.jixu.app.core.jsNumber
import com.jixu.app.core.lastSyncKey
import com.jixu.app.core.localToCloud
import com.jixu.app.core.parseRecordKey
import com.jixu.app.core.recordKey
import com.jixu.app.core.strOrNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * 云同步核心逻辑 —— 逐函数、逐分支、逐循环顺序移植 `miniapp/src/utils/cloudCore.ts`（开发文档 §6）。
 * 引擎内部一律用 JsonObject 流转云端文档；所有 Map 用 LinkedHashMap（对齐 JS Map 插入顺序）。
 *
 * 同步语义：
 * - 去重键 = date|amount|subcategoryKey|type，同键多笔按「笔数」配对
 * - 软删除：删除 = 本地标删 + 云端新增删除凭证；恢复 = 本地复活 + 撤销凭条
 * - 彻底删除：注销凭条（pid 幂等）核销该笔整个生命周期
 * - 待办 / 周期账单：快照追加 + updatedAt 最新者胜（LWW）
 */

fun isTombstone(d: JsonObject): Boolean = d.strOrNull("kind") == "tombstone"

fun isRevive(d: JsonObject): Boolean = d.strOrNull("kind") == "revive"

fun isPurge(d: JsonObject): Boolean = d.strOrNull("kind") == "purge"

fun isEntityDoc(d: JsonObject): Boolean =
    d.strOrNull("kind") == "todo" || d.strOrNull("kind") == "recurring"

/** 统计一批记录里每个去重键出现几次（按笔数配对的核心） */
fun countByRecordKey(list: List<JsonObject>): LinkedHashMap<String, Int> {
    val m = LinkedHashMap<String, Int>()
    for (r in list) {
        val k = recordKey(r)
        m[k] = (m[k] ?: 0) + 1
    }
    return m
}

/**
 * v0.7.3 单类实体（待办或周期账单）的 LWW 同步：
 * 云端按 entityId 取最新快照 → 本地比云端新则补传、云端比本地新则覆盖本地（含 deleted 标记）。
 * 同一时刻平手时以本地为准（下轮再处理，结果仍收敛）。
 */
private suspend fun syncEntities(
    kind: String,
    spec: EntitySyncSpec,
    cloud: CloudCollection,
    ownerId: String,
    cloudDocs: List<JsonObject>,
    now: Long,
): Pair<Int, Int> {
    val latest = LinkedHashMap<String, JsonObject>()
    for (d in cloudDocs) {
        val id = d.strOrNull("entityId") ?: ""
        val cur = latest[id]
        if (cur == null || d.numOr0("updatedAt") > cur.numOr0("updatedAt")) latest[id] = d
    }
    val local = spec.getLocal()
    val localById = LinkedHashMap<String, JsonObject>()
    var pushed = 0
    for (item in local) {
        val itemId = item.strOrNull("id") ?: ""
        localById[itemId] = item
        val c = latest[itemId]
        val itemTs = item.numOr0("updatedAt")
        if (c == null || itemTs > c.numOr0("updatedAt")) {
            val doc = buildJsonObject {
                put("kind", kind)
                put("entityId", itemId)
                put("ownerId", ownerId)
                putNumber("updatedAt", if (itemTs == 0.0) now.toDouble() else itemTs)
                put("data", item)
            }
            val id = cloud.add(doc)
            if (id != null) pushed++
        }
    }
    val incoming = mutableListOf<JsonObject>()
    for ((id, c) in latest) {
        val l = localById[id]
        if (l == null || c.numOr0("updatedAt") > l.numOr0("updatedAt")) {
            val data = c["data"]
            if (data is JsonObject) {
                // id 以 entityId 为准，防脏快照
                incoming.add(
                    buildJsonObject {
                        for ((k, v) in data) put(k, v)
                        put("id", JsonPrimitive(id))
                        c["updatedAt"]?.let { put("updatedAt", it) }
                    },
                )
            }
        }
    }
    val pulled = if (incoming.isNotEmpty()) spec.apply(incoming) else 0
    return pushed to pulled
}

/**
 * 执行一次完整双向同步，不变式：
 *   每键本地总行数(存活+已删) ↔ 云端账单数；本地(已删数+累计恢复数) ↔ 云端凭证数；
 *   本地累计恢复数 ↔ 云端撤销数。
 */
suspend fun runSync(deps: SyncDeps): SyncResult {
    val now = deps.now()
    if (!isValidOwnerId(deps.ownerId)) {
        return SyncResult(ok = false, pushed = 0, pulled = 0, error = "同步码未设置或不合法")
    }
    try {
        val docs = deps.cloud.listAll(deps.ownerId)
        val mine = docs.filter { it.strOrNull("ownerId") == deps.ownerId } // 再验一次码，防驱动层漏筛
        val cloudRecs = mine.filter { !isTombstone(it) && !isRevive(it) && !isPurge(it) && !isEntityDoc(it) }
        val cloudTombs = mine.filter { isTombstone(it) }
        val cloudRevs = mine.filter { isRevive(it) }
        val cloudPurges = mine.filter { isPurge(it) }
        val cloudTodoDocs = mine.filter { it.strOrNull("kind") == "todo" }
        val cloudRecurDocs = mine.filter { it.strOrNull("kind") == "recurring" }

        // 0. v0.8.5 登记对端注销凭条额度（自己上传的不消费）
        val purgeCredit = LinkedHashMap<String, Int>()
        val ownSources = linkedSetOf(deps.source).apply { addAll(deps.legacySources) }
        val purgeLocal = deps.purgeLocal
        for (p in cloudPurges) {
            if (purgeLocal == null || (p.strOrNull("source") ?: "") in ownSources) continue
            val n = max(0, p.intOr0("cancelRec"))
            val k = p.strOrNull("targetKey") ?: ""
            if (n > 0 && parseRecordKey(k) != null) purgeCredit[k] = (purgeCredit[k] ?: 0) + n
        }

        // 注销核销聚合（时间戳感知：凭条只能核销在它之前上传的记录，不能误杀之后新加的同号账）
        val cancelRec = LinkedHashMap<String, Int>()
        val cancelTomb = LinkedHashMap<String, Int>()
        val cancelRev = LinkedHashMap<String, Int>()
        for (p in cloudPurges) {
            val k = p.strOrNull("targetKey") ?: ""
            val pTime = p.numOr0("updatedAt")
            val wantRec = max(0, p.intOr0("cancelRec"))
            val wantTomb = max(0, p.intOr0("cancelTomb"))
            val wantRev = max(0, p.intOr0("cancelRev"))
            val alreadyRec = cancelRec[k] ?: 0
            val alreadyTomb = cancelTomb[k] ?: 0
            val alreadyRev = cancelRev[k] ?: 0
            if (wantRec > 0) {
                val recBefore = cloudRecs.count { recordKey(it) == k && it.numOr0("updatedAt") < pTime }
                cancelRec[k] = alreadyRec + min(wantRec, max(0, recBefore - alreadyRec))
            }
            if (wantTomb > 0) {
                val tombBefore = cloudTombs.count { (it.strOrNull("targetKey") ?: "") == k && it.numOr0("updatedAt") < pTime }
                cancelTomb[k] = alreadyTomb + min(wantTomb, max(0, tombBefore - alreadyTomb))
            }
            if (wantRev > 0) {
                val revBefore = cloudRevs.count { (it.strOrNull("targetKey") ?: "") == k && it.numOr0("updatedAt") < pTime }
                cancelRev[k] = alreadyRev + min(wantRev, max(0, revBefore - alreadyRev))
            }
        }

        val cloudRecCounts = countByRecordKey(cloudRecs)
        val cloudTombCounts = LinkedHashMap<String, Int>()
        for (t in cloudTombs) {
            val k = t.strOrNull("targetKey") ?: ""
            cloudTombCounts[k] = (cloudTombCounts[k] ?: 0) + 1
        }
        val cloudReviveCounts = LinkedHashMap<String, Int>()
        for (v in cloudRevs) {
            val k = v.strOrNull("targetKey") ?: ""
            cloudReviveCounts[k] = (cloudReviveCounts[k] ?: 0) + 1
        }
        // 有效计数（注销后）：所有配对公式统一走这三个函数
        fun effRec(k: String): Int = max(0, (cloudRecCounts[k] ?: 0) - (cancelRec[k] ?: 0))
        fun effTomb(k: String): Int = max(0, (cloudTombCounts[k] ?: 0) - (cancelTomb[k] ?: 0))
        fun effRev(k: String): Int = max(0, (cloudReviveCounts[k] ?: 0) - (cancelRev[k] ?: 0))

        val localAll = deps.getLocal().toMutableList()
        // 0b. v0.8.6 注销凭条消费（差额版）：本地该键总行数超出云端有效账单数的部分才物理删，
        //     优先删回收站行、不够再删同号存活行；删除额度封顶对端凭条 cancelRec
        if (purgeLocal != null) {
            for ((k, credit) in purgeCredit) {
                val total = localAll.count { recordKey(it) == k }
                val excess = min(credit, max(0, total - effRec(k)))
                if (excess <= 0) continue
                var left = excess
                for (pass in listOf(1, 0)) { // 第 1 轮删回收站行，第 2 轮删存活行
                    var i = localAll.size - 1
                    while (i >= 0 && left > 0) {
                        val deleted = if (localAll[i].numOr0("deleted") > 0) 1 else 0
                        if (deleted == pass && recordKey(localAll[i]) == k) {
                            localAll.removeAt(i)
                            left--
                        }
                        i--
                    }
                }
                purgeLocal(k, excess - left)
            }
        }
        val localTotals = countByRecordKey(localAll) // 存活 + 已删
        val deadList = localAll.filter { it.numOr0("deleted") > 0 }
        val localDeadCounts = countByRecordKey(deadList)
        // 凭证配额：一行死过 = 一张凭证；每被恢复过一次 = 历史再多一张凭证（配额 = D + V）
        val tombDonors = mutableListOf<JsonObject>()
        val reviveDonors = mutableListOf<JsonObject>()
        for (r in localAll) {
            if (r.numOr0("deleted") > 0) tombDonors.add(r)
            repeat(ceil(max(0.0, r.numOr0("reviveCount"))).toInt()) {
                tombDonors.add(r)
                reviveDonors.add(r)
            }
        }
        val tombQuota = countByRecordKey(tombDonors)
        val localReviveCounts = countByRecordKey(reviveDonors)

        var pushed = 0
        // 2c. v0.8.5 上传本端注销凭条（彻底删除队列，含离线积压）：pid 不在云端的才传，防重复核销
        val purges = deps.purges
        if (purges != null) {
            val cloudPids = cloudPurges.map { it.strOrNull("pid") ?: "" }.toSet()
            val uploaded = mutableListOf<PendingPurge>()
            for (p in purges.getPending()) {
                if (p.pid.isEmpty() || p.pid in cloudPids) continue
                val id = deps.cloud.add(
                    buildJsonObject {
                        put("kind", "purge")
                        put("pid", p.pid)
                        put("targetKey", p.targetKey)
                        put("cancelRec", p.cancelRec)
                        put("cancelTomb", p.cancelTomb)
                        put("cancelRev", p.cancelRev)
                        put("ownerId", deps.ownerId)
                        putNumber("updatedAt", now.toDouble())
                        put("source", deps.source)
                        p.label?.let { put("label", it) }
                    },
                )
                if (id != null) {
                    pushed++
                    uploaded.add(p)
                }
            }
            if (uploaded.isNotEmpty()) {
                purges.clearPending(uploaded.map { it.pid })
                // 刚上传的核销立即计入 eff（本轮配对即以注销后为准，防止刚删的行被旧计数倒灌）
                for (p in uploaded) {
                    cancelRec[p.targetKey] = (cancelRec[p.targetKey] ?: 0) + max(0, p.cancelRec)
                    cancelTomb[p.targetKey] = (cancelTomb[p.targetKey] ?: 0) + max(0, p.cancelTomb)
                    cancelRev[p.targetKey] = (cancelRev[p.targetKey] ?: 0) + max(0, p.cancelRev)
                }
            }
        }
        // 1. 补传账单：本键总行数超出云端有效账单数的部分
        val pushPerKey = LinkedHashMap<String, Int>()
        for (r in localAll) {
            val k = recordKey(r)
            val need = (localTotals[k] ?: 0) - effRec(k)
            val done = pushPerKey[k] ?: 0
            if (need > 0 && done < need) {
                val id = deps.cloud.add(localToCloud(r, deps.source, now, deps.ownerId))
                if (id != null) {
                    pushed++
                    pushPerKey[k] = done + 1
                }
            }
        }
        // 2a. 补传删除凭证：配额(D+V)超出云端凭证数的部分；label 只供人阅读
        val pushTombPerKey = LinkedHashMap<String, Int>()
        for (r in tombDonors) {
            val k = recordKey(r)
            val need = (tombQuota[k] ?: 0) - effTomb(k)
            val done = pushTombPerKey[k] ?: 0
            if (need > 0 && done < need) {
                val id = deps.cloud.add(
                    buildJsonObject {
                        put("kind", "tombstone")
                        put("targetKey", k)
                        put("ownerId", deps.ownerId)
                        putNumber("updatedAt", now.toDouble())
                        put("source", deps.source)
                        put("label", docLabel(r))
                    },
                )
                if (id != null) {
                    pushed++
                    pushTombPerKey[k] = done + 1
                }
            }
        }
        // 2b. 补传撤销凭条：本地恢复数 V 超出云端撤销数的部分（恢复也跨端生效）
        val pushRevPerKey = LinkedHashMap<String, Int>()
        for (r in reviveDonors) {
            val k = recordKey(r)
            val need = (localReviveCounts[k] ?: 0) - effRev(k)
            val done = pushRevPerKey[k] ?: 0
            if (need > 0 && done < need) {
                val id = deps.cloud.add(
                    buildJsonObject {
                        put("kind", "revive")
                        put("targetKey", k)
                        put("ownerId", deps.ownerId)
                        putNumber("updatedAt", now.toDouble())
                        put("source", deps.source)
                        put("label", docLabel(r))
                    },
                )
                if (id != null) {
                    pushed++
                    pushRevPerKey[k] = done + 1
                }
            }
        }

        // 3. 补拉账单：云端账单数超出本地总行数的差额（不设时间窗；笔数差额幂等）
        val takenPerKey = LinkedHashMap<String, Int>()
        val incoming = mutableListOf<JsonObject>()
        for (r in cloudRecs) {
            val k = recordKey(r)
            val cap = effRec(k) - (localTotals[k] ?: 0)
            val taken = takenPerKey[k] ?: 0
            if (cap > 0 && taken < cap) {
                takenPerKey[k] = taken + 1
                incoming.add(r)
            }
        }
        var pulled = 0
        if (incoming.isNotEmpty()) {
            pulled += deps.addLocal(incoming.map { cloudToLocal(it) })
        }

        // 4. 按净额跟随标删/复活：净删除数 = max(凭证数 - 撤销数, 0)，和本地已删数比差额（不设窗口，必收敛）
        val netDel = LinkedHashMap<String, Int>()
        for ((k, n) in cloudTombCounts) netDel[k] = max(0, n - (cancelTomb[k] ?: 0))
        for ((k, n) in pushTombPerKey) netDel[k] = (netDel[k] ?: 0) + n
        for ((k, n) in cloudReviveCounts) netDel[k] = max(0, (netDel[k] ?: 0) - max(0, n - (cancelRev[k] ?: 0)))
        for ((k, n) in pushRevPerKey) netDel[k] = max(0, (netDel[k] ?: 0) - n)
        val pendingMarks = mutableListOf<Pair<String, Int>>()
        val pendingAlives = mutableListOf<Pair<String, Int>>()
        for ((k, cnt) in netDel) {
            val d = localDeadCounts[k] ?: 0
            if (cnt > d) pendingMarks.add(k to (cnt - d))
            else if (cnt < d) pendingAlives.add(k to (d - cnt))
        }
        for ((k, need) in pendingMarks) {
            pulled += deps.markLocal(k, need)
        }
        for ((k, need) in pendingAlives) {
            pulled += deps.markAlive(k, need)
        }

        // 4b. 待办 / 周期账单实体同步（LWW 快照，与账单链路互不干扰）
        deps.todos?.let { spec ->
            val (p, l) = syncEntities("todo", spec, deps.cloud, deps.ownerId, cloudTodoDocs, now)
            pushed += p
            pulled += l
        }
        deps.recurring?.let { spec ->
            val (p, l) = syncEntities("recurring", spec, deps.cloud, deps.ownerId, cloudRecurDocs, now)
            pushed += p
            pulled += l
        }

        // 5. 更新同步时间
        deps.store.set(lastSyncKey(deps.ownerId), now.toString())

        return SyncResult(ok = true, pushed = pushed, pulled = pulled)
    } catch (e: Exception) {
        return SyncResult(ok = false, pushed = 0, pulled = 0, error = e.message ?: e.toString())
    }
}

// ---- JS 数字语义小工具 ----

/** 复刻 `obj[key] || 0`：缺失 / 空值 / NaN 一律按 0；布尔按 true=1、字符串按 JS Number() 解析。 */
private fun JsonObject.numOr0(key: String): Double = jsNumberOr0(this[key])

private fun jsNumberOr0(element: kotlinx.serialization.json.JsonElement?): Double {
    val p = element as? JsonPrimitive ?: return 0.0
    if (p.isString) {
        val n = jsNumber(p.content)
        return if (n.isNaN()) 0.0 else n
    }
    p.booleanOrNull?.let { return if (it) 1.0 else 0.0 }
    val d = p.doubleOrNull ?: return 0.0
    return if (d.isNaN()) 0.0 else d
}

private fun JsonObject.intOr0(key: String): Int = numOr0(key).toInt()

/** 整数值写成 Long（云端 updatedAt / createdAt 用整数），非整数保持小数。 */
private fun JsonObjectBuilder.putNumber(key: String, value: Double) {
    if (value.isFinite() && value == floor(value) && abs(value) < 9.0e15) {
        put(key, JsonPrimitive(value.toLong()))
    } else {
        put(key, JsonPrimitive(value))
    }
}
