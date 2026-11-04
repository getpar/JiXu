package com.jixu.app.notify

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * 到期提醒的「排了哪些闹钟、几点」纯计算验收（开发文档 §10、执行计划 P8）。
 * 系统 AlarmManager 调用在 [ReminderScheduler]，这里只验证计算部分。
 */
class ReminderPlanTest {

    private val zone: ZoneId = ZoneId.of("Asia/Shanghai")

    private fun zdt(
        year: Int = 2026,
        month: Int = 11,
        day: Int = 4,
        hour: Int = 7,
        minute: Int = 30,
    ): ZonedDateTime = ZonedDateTime.of(year, month, day, hour, minute, 0, 0, zone)

    private fun millisOf(
        year: Int = 2026,
        month: Int = 11,
        day: Int = 4,
        hour: Int = 8,
        minute: Int = 0,
    ): Long = zdt(year, month, day, hour, minute).toInstant().toEpochMilli()

    private fun todo(
        id: String,
        nextDate: String = "2026-11-04",
        time: String? = "09:00",
        isActive: Boolean = true,
        deleted: Boolean = false,
        completedDates: List<String> = emptyList(),
        title: String = id,
        note: String = "",
    ) = ReminderTodo(
        id = id,
        title = title,
        nextDate = nextDate,
        time = time,
        isActive = isActive,
        deleted = deleted,
        completedDates = completedDates,
        note = note,
    )

    @Test
    fun dailySummaryFiresAtEightTodayBeforeEight() {
        assertEquals(millisOf(hour = 8), ReminderPlan.nextDailyTrigger(zdt(hour = 7, minute = 30)))
        assertEquals(millisOf(hour = 8), ReminderPlan.nextDailyTrigger(zdt(hour = 0, minute = 0)))
    }

    @Test
    fun dailySummaryMovesToTomorrowAtOrAfterEight() {
        assertEquals(
            millisOf(day = 5, hour = 8),
            ReminderPlan.nextDailyTrigger(zdt(hour = 8, minute = 0)),
        )
        assertEquals(
            millisOf(day = 5, hour = 8),
            ReminderPlan.nextDailyTrigger(zdt(hour = 20, minute = 15)),
        )
    }

    @Test
    fun planContainsDailyAndFutureTimedTodosOnly() {
        val now = zdt(hour = 7, minute = 30)
        val todos = listOf(
            todo("soon", time = "07:33"),
            todo("later", time = "08:00"),
            todo("noTime", time = null),
            todo("inactive", time = "10:00", isActive = false),
            todo("deleted", time = "10:00", deleted = true),
            todo("past", time = "07:00"),
            todo("completed", time = "09:00", completedDates = listOf("2026-11-04")),
            todo("badTime", time = "9点半"),
            todo("badDate", nextDate = "2026/11/04"),
        )

        val plan = ReminderPlan.plan(now, todos)

        assertEquals(3, plan.size)
        assertEquals(PlannedKind.DAILY_SUMMARY, plan[0].kind)
        assertEquals(millisOf(hour = 8), plan[0].triggerAtMillis)

        assertEquals(PlannedKind.TODO_TIME, plan[1].kind)
        assertEquals("soon", plan[1].todoId)
        assertEquals(millisOf(hour = 7, minute = 33), plan[1].triggerAtMillis)

        assertEquals(PlannedKind.TODO_TIME, plan[2].kind)
        assertEquals("later", plan[2].todoId)
        assertEquals(millisOf(hour = 8), plan[2].triggerAtMillis)
    }

    @Test
    fun dueTodosIncludeTodayAndOverdueSortedByDate() {
        val today = LocalDate.of(2026, 11, 4)
        val todos = listOf(
            todo("future", nextDate = "2026-11-05", title = "未来"),
            todo("overdue2", nextDate = "2026-11-01", title = "逾期二"),
            todo("today", nextDate = "2026-11-04", title = "今天"),
            todo("overdue1", nextDate = "2026-11-01", title = "逾期一"),
            todo("doneToday", nextDate = "2026-11-04", completedDates = listOf("2026-11-04")),
            todo("inactive", nextDate = "2026-11-04", isActive = false),
            todo("deleted", nextDate = "2026-11-04", deleted = true),
        )

        val due = ReminderPlan.dueTodos(todos, today)

        assertEquals(listOf("overdue1", "overdue2", "today"), due.map { it.id })
    }

    @Test
    fun summaryContentSingleUsesNoteOrFallback() {
        assertNull(ReminderPlan.summaryContent(emptyList()))

        val withNote = ReminderPlan.summaryContent(
            listOf(todo("t1", title = "交房租", note = "本月 2400 元")),
        )
        assertEquals("交房租", withNote?.title)
        assertEquals("本月 2400 元", withNote?.body)

        val withoutNote = ReminderPlan.summaryContent(listOf(todo("t2", title = "喝水", note = "")))
        assertEquals("喝水", withoutNote?.title)
        assertEquals("今天有件事该做啦", withoutNote?.body)
    }

    @Test
    fun summaryContentMultipleListsTitlesSortedByDueDate() {
        val today = LocalDate.of(2026, 11, 4)
        val due = ReminderPlan.dueTodos(
            listOf(
                todo("b", nextDate = "2026-11-04", title = "喝水"),
                todo("a", nextDate = "2026-11-02", title = "交房租"),
                todo("c", nextDate = "2026-11-03", title = "买猫粮"),
            ),
            today,
        )

        val content = ReminderPlan.summaryContent(due)

        assertEquals("今天 3 个待办到期", content?.title)
        assertEquals("还有：交房租、买猫粮、喝水", content?.body)
    }

    @Test
    fun summaryContentClipsLongTitleListToOneLine() {
        val due = (1..10).map { todo("t$it", title = "很长的待办标题$it") }

        val content = ReminderPlan.summaryContent(due)

        assertTrue(content!!.body.length <= ReminderPlan.MAX_BODY_CHARS)
        assertTrue(content.body.endsWith("…"))
    }

    @Test
    fun timedReminderValidity() {
        val today = LocalDate.of(2026, 11, 4)
        assertTrue(ReminderPlan.isTimedReminderStillValid(todo("ok"), today))
        assertFalse(
            ReminderPlan.isTimedReminderStillValid(
                todo("done", completedDates = listOf("2026-11-04")),
                today,
            ),
        )
        assertFalse(ReminderPlan.isTimedReminderStillValid(todo("yesterday", nextDate = "2026-11-03"), today))
        assertFalse(ReminderPlan.isTimedReminderStillValid(todo("noTime", time = null), today))
        assertFalse(ReminderPlan.isTimedReminderStillValid(todo("inactive", isActive = false), today))
        assertFalse(ReminderPlan.isTimedReminderStillValid(todo("deleted", deleted = true), today))
    }

    @Test
    fun timedContentUsesTitleAndNote() {
        val content = ReminderPlan.timedContent(todo("t", title = "交房租", note = "转给房东"))
        assertEquals("交房租", content.title)
        assertEquals("转给房东", content.body)
        assertEquals("到时间啦", ReminderPlan.timedContent(todo("t", title = "喝水")).body)
    }
}
