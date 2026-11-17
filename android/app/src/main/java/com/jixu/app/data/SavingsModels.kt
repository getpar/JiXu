package com.jixu.app.data

/**
 * 存钱罐汇总（独立小账本，不参与 any 账单统计）。
 * 金额均来自 [com.jixu.app.data.db.SavingsEntity]，累加走 sumAmounts。
 */
data class SavingsSummary(
    val total: Double,
    val totalIn: Double,
    val totalOut: Double,
    val monthIn: Double,
    val monthOut: Double,
)

/** 云端 savings 快照（sync 包解析后交给 Repository 落库） */
data class SavingsSnapshot(
    val entityId: String,
    val updatedAt: Long,
    val direction: String,
    val amount: Double,
    val date: String,
    val note: String,
    val createdAt: Long,
    val deleted: Boolean,
    val reviveCount: Int,
)
