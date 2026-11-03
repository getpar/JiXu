package com.jixu.app.core

import kotlin.random.Random

/**
 * 同步码工具 —— 移植 `miniapp/src/utils/cloudCore.ts` 同名函数（开发文档 §7.8）。
 */

/** 同步码字符集（去掉易混的 I/O/U/1） */
private const val OWNER_ID_CHARS = "ABCDEFGHJKLMNPQRSTVWXYZ023456789"

/** 本地记录"上次同步时间"的存储键（按同步码分隔，换户不影响旧户增量） */
fun lastSyncKey(ownerId: String): String = "cloud_last_sync_at_$ownerId"

/** 生成随机同步码：12 位大写字母数字，碰撞概率约 3.8×10¹⁸ 分之一 */
fun newOwnerId(): String = buildString(12) {
    repeat(12) { append(OWNER_ID_CHARS[Random.nextInt(OWNER_ID_CHARS.length)]) }
}

/** 同步码归一化：去掉空格/连字符等非字母数字、转大写（用户手输容错） */
fun normalizeOwnerId(raw: String?): String =
    (raw ?: "").uppercase().filter { it in 'A'..'Z' || it in '0'..'9' }

/** 同步码显示格式：每 4 位一杠，方便手机照着键盘输 */
fun formatOwnerId(id: String?): String {
    val s = id ?: ""
    if (s.length <= 4) return s
    return s.chunked(4).joinToString("-")
}

/** 同步码合法性：至少 8 位（未来若改长度只动这一处） */
fun isValidOwnerId(id: String?): Boolean = id != null && Regex("^[A-Z0-9]{8,}$").matches(id)
