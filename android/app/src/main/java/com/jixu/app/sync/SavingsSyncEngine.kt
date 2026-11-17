package com.jixu.app.sync

import com.jixu.app.core.strOrNull
import com.jixu.app.data.SavingsSnapshot
import com.jixu.app.data.db.SavingsEntity
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.intOrNull

/**
 * 存钱罐独立云同步引擎（需求评估-02 §A.5）。
 *
 * 与账单同步完全分离：只处理 `savings` 集合里的 `kind = "savings"` 快照文档。
 * 每条本地存钱记录以稳定 id 识别；同 id 以 updatedAt 做 LWW（最后写入胜出）。
 * 云端采用追加式快照，不覆盖旧文档（复用现有 CloudBase「只新增」权限模型）。
 */
data class SavingsSyncResult(
    val ok: Boolean,
    val pushed: Int,
    val applied: Int,
    val error: String? = null,
)

data class SavingsSyncPlan(
    val push: List<JsonObject>,
    val apply: List<SavingsSnapshot>,
)

object SavingsSyncEngine {

    fun plan(
        local: List<SavingsEntity>,
        cloudDocs: List<JsonObject>,
        ownerId: String,
        source: String,
    ): SavingsSyncPlan {
        val latestByEntity = LinkedHashMap<String, Pair<Long, JsonObject>>()
        for (doc in cloudDocs) {
            if (doc.strOrNull("kind") != "savings") continue
            val entityId = doc.strOrNull("entityId") ?: continue
            val data = doc["data"] as? JsonObject ?: continue
            val updatedAt = doc.longField("updatedAt") ?: 0L
            val prev = latestByEntity[entityId]
            if (prev == null || updatedAt > prev.first) {
                latestByEntity[entityId] = updatedAt to data
            }
        }

        val localById = local.associateBy { it.id }
        val apply = mutableListOf<SavingsSnapshot>()
        for ((entityId, pair) in latestByEntity) {
            val localEntity = localById[entityId]
            if (localEntity == null || pair.first > localEntity.updatedAt) {
                parseSnapshot(entityId, pair.first, pair.second)?.let { apply += it }
            }
        }

        val push = mutableListOf<JsonObject>()
        for (entity in local) {
            val cloud = latestByEntity[entity.id]
            if (cloud == null || entity.updatedAt > cloud.first) {
                push += toCloudDoc(entity, ownerId, source)
            }
        }
        return SavingsSyncPlan(push = push, apply = apply)
    }

    private fun toCloudDoc(entity: SavingsEntity, ownerId: String, source: String): JsonObject =
        buildJsonObject {
            put("kind", "savings")
            put("entityId", entity.id)
            put("ownerId", ownerId)
            put("updatedAt", entity.updatedAt)
            put("source", source)
            put(
                "data",
                buildJsonObject {
                    put("id", entity.id)
                    put("direction", entity.direction)
                    put("amount", entity.amount)
                    put("date", entity.date)
                    put("note", entity.note)
                    put("createdAt", entity.createdAt)
                    put("deleted", entity.deleted > 0)
                    put("reviveCount", entity.reviveCount)
                },
            )
        }

    private fun parseSnapshot(entityId: String, updatedAt: Long, data: JsonObject): SavingsSnapshot? {
        val direction = data.strOrNull("direction") ?: return null
        if (direction != "in" && direction != "out") return null
        val amount = (data["amount"] as? JsonPrimitive)?.doubleOrNull ?: return null
        if (!amount.isFinite()) return null
        val date = data.strOrNull("date") ?: return null
        val deletedPrim = data["deleted"] as? JsonPrimitive
        val deleted = deletedPrim?.booleanOrNull
            ?: deletedPrim?.doubleOrNull?.let { it != 0.0 }
            ?: false
        return SavingsSnapshot(
            entityId = entityId,
            updatedAt = updatedAt,
            direction = direction,
            amount = amount,
            date = date,
            note = data.strOrNull("note") ?: "",
            createdAt = data.longField("createdAt") ?: updatedAt,
            deleted = deleted,
            reviveCount = (data["reviveCount"] as? JsonPrimitive)?.let { it.intOrNull ?: it.doubleOrNull?.toInt() } ?: 0,
        )
    }

    private fun JsonObject.longField(key: String): Long? {
        val p = this[key] as? JsonPrimitive ?: return null
        return p.doubleOrNull?.toLong() ?: p.takeIf { it.isString }?.content?.toLongOrNull()
    }
}
