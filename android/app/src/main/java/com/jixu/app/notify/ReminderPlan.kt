package com.jixu.app.notify

import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/** 待办提醒所需的字段快照（零 Android 依赖，便于仪器测试精确断言「排了哪些闹钟、几点」）。 */
data class ReminderTodo(
    val id: String,
    val title: String,
    val nextDate: String,
    val time: String? = null,
    val isActive: Boolean = true,
    val deleted: Boolean = false,
    val completedDates: List<String> = emptyList(),
    val note: String = "",
)

enum class PlannedKind { DAILY_SUMMARY, TODO_TIME }

/** 一条要交给 AlarmManager 的提醒。todoId 仅对 [PlannedKind.TODO_TIME] 有值。 */
data class PlannedReminder(
    val kind: PlannedKind,
    val triggerAtMillis: Long,
    val todoId: String? = null,
)

data class ReminderContent(val title: String, val body: String)

/**
 * 本机提醒的纯计算部分（开发文档 §10）：
 * - 每天 08:00 一条汇总（0 个到期待办不发）
 * - 设了 `time` 的活跃待办在 `nextDate` 当天该时间单独提醒
 *
 * 系统调用（AlarmManager/通知）全部在 [ReminderScheduler] 与 [ReminderNotifier]，
 * 这里只算「下次触发时刻」和「通知文案」，可用仪器测试直接验证。
 */
object ReminderPlan {

    const val DAILY_HOUR = 8
    const val DAILY_MINUTE = 0

    /** 通知正文截断到一行的上限（中文按字符数，超出补省略号） */
    const val MAX_BODY_CHARS = 40

    private val TIME_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("H:mm")

    /** 下一次每日汇总：今天 08:00 尚未到则今天，否则明天。 */
    fun nextDailyTrigger(now: ZonedDateTime): Long {
        val todayAt = now.toLocalDate().atTime(DAILY_HOUR, DAILY_MINUTE).atZone(now.zone)
        val next = if (todayAt.isAfter(now)) todayAt else todayAt.plusDays(1)
        return next.toInstant().toEpochMilli()
    }

    /**
     * 当前时刻应排的全部闹钟：每日汇总 + 全部未来的定时待办提醒。
     * 顺序固定（汇总在前，定时按触发时刻、id 升序），方便调用方分配稳定的 requestCode。
     */
    fun plan(now: ZonedDateTime, todos: List<ReminderTodo>): List<PlannedReminder> {
        val nowMs = now.toInstant().toEpochMilli()
        val out = mutableListOf<PlannedReminder>()
        out += PlannedReminder(PlannedKind.DAILY_SUMMARY, nextDailyTrigger(now))

        val timed = todos.mapNotNull { todo ->
            val trigger = timedTrigger(todo, now.zone) ?: return@mapNotNull null
            if (trigger <= nowMs) null else PlannedReminder(PlannedKind.TODO_TIME, trigger, todo.id)
        }.sortedWith(compareBy({ it.triggerAtMillis }, { it.todoId ?: "" }))

        out += timed
        return out
    }

    /** 单个待办的下次定时触发时刻；停用/删除/已完成本期/时间不合法/日期不合法 → null。 */
    fun timedTrigger(todo: ReminderTodo, zone: ZoneId): Long? {
        if (!todo.isActive || todo.deleted) return null
        val time = parseTime(todo.time ?: return null) ?: return null
        val date = parseDate(todo.nextDate) ?: return null
        // 本期已完成（完成时 nextDate 通常会推后；单次待办保留日期但停用，这里双保险）
        if (todo.nextDate in todo.completedDates) return null
        return date.atTime(time).atZone(zone).toInstant().toEpochMilli()
    }

    /** §7.7：只看活跃、未删除、今天未完成且 `nextDate <= today` 的待办，按到期日升序。 */
    fun dueTodos(todos: List<ReminderTodo>, today: LocalDate): List<ReminderTodo> {
        val todayStr = today.toString()
        return todos
            .filter { it.isActive && !it.deleted }
            .filter { it.nextDate <= todayStr && todayStr !in it.completedDates }
            .sortedWith(compareBy({ it.nextDate }, { it.title }))
    }

    /** 每日汇总文案；没有到期待办 → null（不发通知）。 */
    fun summaryContent(due: List<ReminderTodo>): ReminderContent? {
        if (due.isEmpty()) return null
        val first = due.first()
        if (due.size == 1) {
            val body = first.note.ifBlank { "今天有件事该做啦" }
            return ReminderContent(first.title, clipLine(body))
        }
        val rest = due.joinToString("、") { it.title }
        return ReminderContent("今天 ${due.size} 个待办到期", clipLine("还有：$rest"))
    }

    /** 定时待办通知文案（标题固定为待办标题；正文用备注，没有则给一句轻提示）。 */
    fun timedContent(todo: ReminderTodo): ReminderContent =
        ReminderContent(todo.title, todo.note.ifBlank { "到时间啦" })

    /** 到点后校验提醒是否仍然有效（待办可能刚被改/完成/删掉，重排未及）。 */
    fun isTimedReminderStillValid(todo: ReminderTodo, today: LocalDate): Boolean {
        if (!todo.isActive || todo.deleted) return false
        if (todo.nextDate != today.toString()) return false
        if (todo.nextDate in todo.completedDates) return false
        return parseTime(todo.time ?: return false) != null
    }

    fun parseTime(raw: String): LocalTime? =
        runCatching { LocalTime.parse(raw.trim(), TIME_FORMAT) }.getOrNull()

    fun parseDate(raw: String): LocalDate? =
        runCatching { LocalDate.parse(raw.trim()) }.getOrNull()

    fun clipLine(text: String, max: Int = MAX_BODY_CHARS): String =
        if (text.length <= max) text else text.take(max - 1).trimEnd() + "…"
}
