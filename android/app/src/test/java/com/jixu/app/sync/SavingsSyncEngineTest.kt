package com.jixu.app.sync

import com.jixu.app.data.db.SavingsEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SavingsSyncEngineTest {

    private fun local(
        id: String = "s_1",
        direction: String = "in",
        amount: Double = 500.0,
        updatedAt: Long = 100,
        deleted: Int = 0,
        reviveCount: Int = 0,
    ) = SavingsEntity(
        id = id,
        direction = direction,
        amount = amount,
        date = "2026-11-11",
        note = "现金",
        createdAt = 50,
        updatedAt = updatedAt,
        deleted = deleted,
        reviveCount = reviveCount,
    )

    private fun cloud(
        entityId: String = "s_1",
        updatedAt: Long = 100,
        direction: String = "in",
        amount: Double = 500.0,
        deleted: Boolean = false,
        kind: String = "savings",
    ): JsonObject = Json.parseToJsonElement(
        """{"kind":"$kind","entityId":"$entityId","ownerId":"ABCDEFGH","updatedAt":$updatedAt,
           "source":"android:test","data":{"id":"$entityId","direction":"$direction","amount":$amount,
           "date":"2026-11-11","note":"现金","createdAt":50,"deleted":$deleted,"reviveCount":0}}""",
    ).jsonObject

    @Test
    fun localNewerPushesSnapshot() {
        val plan = SavingsSyncEngine.plan(
            local = listOf(local(updatedAt = 200)),
            cloudDocs = listOf(cloud(updatedAt = 100)),
            ownerId = "ABCDEFGH",
            source = "android:test",
        )
        assertEquals(1, plan.push.size)
        assertTrue(plan.apply.isEmpty())
        assertEquals("savings", plan.push[0]["kind"].toString().trim('"'))
        assertEquals("s_1", plan.push[0]["entityId"].toString().trim('"'))
    }

    @Test
    fun cloudNewerAppliesSnapshot() {
        val plan = SavingsSyncEngine.plan(
            local = listOf(local(updatedAt = 100)),
            cloudDocs = listOf(cloud(updatedAt = 300, direction = "out", amount = 88.0)),
            ownerId = "ABCDEFGH",
            source = "android:test",
        )
        assertTrue(plan.push.isEmpty())
        assertEquals(1, plan.apply.size)
        assertEquals("out", plan.apply[0].direction)
        assertEquals(88.0, plan.apply[0].amount, 0.0)
    }

    @Test
    fun sameTimestampDoesNothing() {
        val plan = SavingsSyncEngine.plan(
            local = listOf(local(updatedAt = 100)),
            cloudDocs = listOf(cloud(updatedAt = 100)),
            ownerId = "ABCDEFGH",
            source = "android:test",
        )
        assertTrue(plan.push.isEmpty())
        assertTrue(plan.apply.isEmpty())
    }

    @Test
    fun deletedCloudSnapshotWins() {
        val plan = SavingsSyncEngine.plan(
            local = listOf(local(updatedAt = 100)),
            cloudDocs = listOf(cloud(updatedAt = 200, deleted = true)),
            ownerId = "ABCDEFGH",
            source = "android:test",
        )
        assertEquals(1, plan.apply.size)
        assertTrue(plan.apply[0].deleted)
    }

    @Test
    fun otherKindIgnored() {
        val plan = SavingsSyncEngine.plan(
            local = listOf(local(updatedAt = 100)),
            cloudDocs = listOf(cloud(updatedAt = 300, kind = "record")),
            ownerId = "ABCDEFGH",
            source = "android:test",
        )
        assertTrue("非 savings 文档不应参与", plan.apply.isEmpty())
    }

    @Test
    fun latestOfMultipleCloudSnapshotsWins() {
        val plan = SavingsSyncEngine.plan(
            local = listOf(local(updatedAt = 100)),
            cloudDocs = listOf(
                cloud(updatedAt = 150, amount = 111.0),
                cloud(updatedAt = 500, amount = 999.0),
                cloud(updatedAt = 300, amount = 222.0),
            ),
            ownerId = "ABCDEFGH",
            source = "android:test",
        )
        assertEquals(1, plan.apply.size)
        assertEquals(999.0, plan.apply[0].amount, 0.0)
    }
}
