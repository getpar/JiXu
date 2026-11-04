package com.jixu.app.ui.screens.todos

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerDialog
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.AppContainer
import com.jixu.app.core.AMOUNT_INPUT_MAX_LENGTH
import com.jixu.app.core.CategoryGroup
import com.jixu.app.core.DEFAULT_CATEGORIES
import com.jixu.app.core.formatMoneyExact
import com.jixu.app.core.localDateStr
import com.jixu.app.core.parseAmountInput
import com.jixu.app.core.sanitizeAmountInput
import com.jixu.app.data.NewTodo
import com.jixu.app.data.db.TodoEntity
import com.jixu.app.ui.screens.common.JxCard
import com.jixu.app.ui.screens.common.JxConfirmDialog
import com.jixu.app.ui.screens.common.JxDialog
import com.jixu.app.ui.screens.common.JxEmpty
import com.jixu.app.ui.screens.common.JxLabel
import com.jixu.app.ui.screens.common.JxLink
import com.jixu.app.ui.screens.common.JxPrimaryButton
import com.jixu.app.ui.screens.common.JxSmallAction
import com.jixu.app.ui.screens.common.JxTag
import com.jixu.app.ui.screens.common.JxTextField
import com.jixu.app.ui.screens.common.JxTopBar
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.screens.common.todayStr
import com.jixu.app.ui.theme.JiXuTheme
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Locale

private val CYCLE_KEYS = listOf("daily", "weekly", "monthly", "yearly", "once")
private val CYCLE_LABELS = mapOf(
    "daily" to "每天", "weekly" to "每周", "monthly" to "每月", "yearly" to "每年", "once" to "单次",
)
private val TIME_CYCLES = setOf("daily", "weekly", "once")

private fun cycleLabel(cycle: String): String = CYCLE_LABELS[cycle] ?: cycle

private fun mmdd(date: String): String = if (date.length >= 10) date.substring(5) else date

private fun completedDatesOf(raw: String): List<String> = runCatching {
    Json.parseToJsonElement(raw).jsonArray.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
}.getOrElse { emptyList() }

/**
 * 待办事项（开发文档 §8.7，参照 miniapp/src/pages/todos/index.tsx）。
 * 第 3 条「通知状态卡片」按执行计划留到 P8。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodosScreen(container: AppContainer, onBack: () -> Unit) {
    val colors = JiXuTheme.colors
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val repo = container.repository

    val todos by repo.observeTodos().collectAsStateWithLifecycle(emptyList())
    val cats by repo.observeMergedCategories().collectAsStateWithLifecycle(DEFAULT_CATEGORIES)

    var today by remember { mutableStateOf(todayStr()) }
    var showAdd by remember { mutableStateOf(false) }
    var showDone by rememberSaveable { mutableStateOf(false) }
    var deleteId by remember { mutableStateOf<String?>(null) }

    var title by rememberSaveable { mutableStateOf("") }
    var fCycle by rememberSaveable { mutableStateOf("daily") }
    var fNextDate by rememberSaveable { mutableStateOf(todayStr()) }
    var fTime by rememberSaveable { mutableStateOf("") }
    var fAmount by rememberSaveable { mutableStateOf("") }
    var fCatKey by rememberSaveable { mutableStateOf("food") }
    var fSubKey by rememberSaveable { mutableStateOf("") }
    var fNote by rememberSaveable { mutableStateOf("") }
    var cycleOpen by remember { mutableStateOf(false) }
    var catOpen by remember { mutableStateOf(false) }
    var subOpen by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var showTimePicker by remember { mutableStateOf(false) }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        today = todayStr()
    }

    val active = remember(todos) { todos.filter { it.isActive }.sortedBy { it.nextDate } }
    val undone = remember(active, today) {
        active.filter { completedDatesOf(it.completedDates).lastOrNull() != today }
    }
    val doneToday = remember(active, today) {
        active.filter { completedDatesOf(it.completedDates).lastOrNull() == today }
    }
    val completed = remember(todos) {
        todos.filter { t ->
            !t.isActive || (t.cycle == "once" && completedDatesOf(t.completedDates).isNotEmpty())
        }
    }
    val dueToday = undone.filter { it.nextDate <= today }

    val currentCat = cats.firstOrNull { it.key == fCatKey }
    val subs = currentCat?.subs ?: emptyList()
    val hasAmount = fAmount.isNotEmpty() && (fAmount.toDoubleOrNull() ?: 0.0) > 0

    fun resetForm() {
        title = ""
        fCycle = "daily"
        fNextDate = todayStr()
        fTime = ""
        fAmount = ""
        fCatKey = "food"
        fSubKey = ""
        fNote = ""
    }

    fun addTodo() {
        if (title.trim().isEmpty()) {
            context.showToast("请输入标题")
            return
        }
        var amount: Double? = null
        val cat = cats.firstOrNull { it.key == fCatKey }
        val sub = cat?.subs?.firstOrNull { it.key == fSubKey }
        if (fAmount.trim().isNotEmpty()) {
            val parsed = parseAmountInput(fAmount)
            if (!parsed.ok) {
                context.showToast(parsed.message)
                return
            }
            amount = parsed.value
            if (sub == null) {
                context.showToast("填了金额请选择二级分类")
                return
            }
        }
        val withAmount = amount != null && amount > 0
        focusManager.clearFocus()
        scope.launch {
            repo.addTodo(
                NewTodo(
                    title = title.trim(),
                    cycle = fCycle,
                    nextDate = fNextDate,
                    time = if (fCycle in TIME_CYCLES && fTime.isNotEmpty()) fTime else null,
                    isActive = true,
                    amount = if (withAmount) amount else null,
                    categoryKey = if (withAmount) cat?.key else null,
                    categoryName = if (withAmount) cat?.name else null,
                    subcategoryKey = if (withAmount) sub?.key else null,
                    subcategoryName = if (withAmount) sub?.name else null,
                    note = fNote.ifEmpty { null },
                ),
            )
            context.showToast("已添加")
            showAdd = false
            resetForm()
        }
    }

    fun complete(todo: TodoEntity) {
        scope.launch {
            repo.completeTodo(todo.id)
            val amount = todo.amount
            if (amount != null && amount > 0) {
                context.showToast("已完成并记账 ¥${formatMoneyExact(amount)}")
            } else {
                context.showToast("已完成")
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        JxTopBar(title = "待办事项", onBack = onBack) {
            Box(
                Modifier
                    .clip(CircleShape)
                    .background(colors.exp)
                    .padding(horizontal = 7.dp, vertical = 2.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(undone.size.toString(), fontSize = 11.sp, color = Color.White, fontWeight = FontWeight.Medium)
            }
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 14.dp),
        ) {
            Spacer(Modifier.height(4.dp))

            if (dueToday.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(IntrinsicSize.Min)
                        .clip(RoundedCornerShape(8.dp))
                        .background(colors.card),
                ) {
                    Box(
                        Modifier
                            .width(3.dp)
                            .fillMaxHeight()
                            .background(colors.warn),
                    )
                    Text(
                        "今天有 ${dueToday.size} 个待办到期还没完成",
                        fontSize = 12.sp,
                        color = colors.text,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
                    )
                }
                Spacer(Modifier.height(10.dp))
            }

            JxPrimaryButton("+ 添加待办", onClick = {
                resetForm()
                showAdd = true
            })
            Spacer(Modifier.height(12.dp))

            if (active.isEmpty()) {
                JxEmpty("暂无待办")
            } else {
                Text(
                    "进行中 (${undone.size}" +
                        (if (doneToday.isNotEmpty()) " · 今天已完成 ${doneToday.size}" else "") + ")",
                    fontSize = 12.sp,
                    color = colors.exp,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }

            (undone + doneToday).forEach { todo ->
                val done = completedDatesOf(todo.completedDates).lastOrNull() == today
                val due = !done && todo.nextDate <= today
                val overdue = !done && todo.nextDate < today
                TodoCard(
                    todo = todo,
                    done = done,
                    due = due,
                    overdue = overdue,
                    onComplete = { complete(todo) },
                    onDisable = {
                        scope.launch { repo.toggleTodo(todo.id, false) }
                    },
                    onDelete = { deleteId = todo.id },
                )
                Spacer(Modifier.height(10.dp))
            }

            if (completed.isNotEmpty()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showDone = !showDone }
                        .padding(vertical = 8.dp),
                ) {
                    Text(
                        "已完成 (${completed.size})",
                        fontSize = 12.sp,
                        color = colors.sub,
                        modifier = Modifier.weight(1f),
                    )
                    Text(if (showDone) "▲" else "▼", fontSize = 11.sp, color = colors.muted)
                }
                if (showDone) {
                    completed.forEach { todo ->
                        DoneTodoRow(
                            todo = todo,
                            onEnable = { scope.launch { repo.toggleTodo(todo.id, true) } },
                            onDelete = { deleteId = todo.id },
                        )
                        Spacer(Modifier.height(8.dp))
                    }
                }
            }

            Spacer(Modifier.height(20.dp))
        }
    }

    if (showAdd) {
        JxDialog(title = "添加待办", onDismiss = { showAdd = false }) {
            JxLabel("标题")
            JxTextField(
                value = title,
                onValueChange = { title = it },
                placeholder = "如：交房租、喝水",
                maxLength = 20,
            )

            Spacer(Modifier.height(12.dp))
            JxLabel("周期")
            Box {
                PickerRow(text = cycleLabel(fCycle)) {
                    focusManager.clearFocus()
                    cycleOpen = true
                }
                DropdownMenu(expanded = cycleOpen, onDismissRequest = { cycleOpen = false }) {
                    CYCLE_KEYS.forEach { key ->
                        DropdownMenuItem(
                            text = { Text(cycleLabel(key), color = if (key == fCycle) colors.accent else colors.text) },
                            onClick = {
                                fCycle = key
                                if (key !in TIME_CYCLES) fTime = ""
                                cycleOpen = false
                            },
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            JxLabel(if (fCycle == "once") "截止日期" else "首次日期")
            PickerRow(text = fNextDate) {
                focusManager.clearFocus()
                showDatePicker = true
            }

            if (fCycle in TIME_CYCLES) {
                Spacer(Modifier.height(12.dp))
                JxLabel("具体时间（可选）")
                PickerRow(text = fTime.ifEmpty { "不限" }, placeholder = fTime.isEmpty()) {
                    focusManager.clearFocus()
                    showTimePicker = true
                }
            }

            Spacer(Modifier.height(12.dp))
            JxLabel("关联金额（可选）")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("¥", fontSize = 22.sp, fontWeight = FontWeight.Medium, color = colors.accent)
                Spacer(Modifier.width(8.dp))
                JxTextField(
                    value = fAmount,
                    onValueChange = { fAmount = sanitizeAmountInput(it) },
                    placeholder = "填了自动记账",
                    maxLength = AMOUNT_INPUT_MAX_LENGTH,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textSize = 22.sp,
                    modifier = Modifier.weight(1f),
                )
            }

            if (hasAmount) {
                Spacer(Modifier.height(12.dp))
                JxLabel("一级分类")
                Box {
                    PickerRow(text = currentCat?.name ?: "请选择", placeholder = currentCat == null) {
                        focusManager.clearFocus()
                        catOpen = true
                    }
                    DropdownMenu(expanded = catOpen, onDismissRequest = { catOpen = false }) {
                        cats.forEach { c ->
                            DropdownMenuItem(
                                text = { Text(c.name, color = if (c.key == fCatKey) colors.accent else colors.text) },
                                onClick = {
                                    if (c.key != fCatKey) {
                                        fCatKey = c.key
                                        fSubKey = ""
                                    }
                                    catOpen = false
                                },
                            )
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                JxLabel("二级分类")
                Box {
                    val subName = subs.firstOrNull { it.key == fSubKey }?.name
                    PickerRow(text = subName ?: "选择小类", placeholder = subName == null) {
                        focusManager.clearFocus()
                        subOpen = true
                    }
                    DropdownMenu(expanded = subOpen, onDismissRequest = { subOpen = false }) {
                        subs.forEach { s ->
                            DropdownMenuItem(
                                text = { Text(s.name, color = if (s.key == fSubKey) colors.accent else colors.text) },
                                onClick = {
                                    fSubKey = s.key
                                    subOpen = false
                                },
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            JxLabel("备注（可选）")
            JxTextField(
                value = fNote,
                onValueChange = { fNote = it },
                placeholder = "补充说明",
                maxLength = 30,
            )

            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp), modifier = Modifier.fillMaxWidth()) {
                Spacer(Modifier.weight(1f))
                JxLink("取消", onClick = { showAdd = false }, color = colors.sub, size = 14.sp)
                JxLink("添加", onClick = { addTodo() }, size = 14.sp)
            }
        }
    }

    if (showDatePicker) {
        val initial = runCatching { LocalDate.parse(fNextDate) }.getOrNull() ?: LocalDate.now()
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let {
                        fNextDate = localDateStr(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate())
                    }
                    showDatePicker = false
                }) { Text("确定") }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("取消") }
            },
        ) {
            DatePicker(state = pickerState)
        }
    }

    if (showTimePicker) {
        val parts = fTime.ifEmpty { "09:00" }.split(":")
        val timeState = rememberTimePickerState(
            initialHour = parts.getOrNull(0)?.toIntOrNull() ?: 9,
            initialMinute = parts.getOrNull(1)?.toIntOrNull() ?: 0,
            is24Hour = true,
        )
        TimePickerDialog(
            onDismissRequest = { showTimePicker = false },
            title = { Text("选择时间", fontSize = 16.sp, fontWeight = FontWeight.Medium) },
            confirmButton = {
                TextButton(onClick = {
                    fTime = String.format(Locale.US, "%02d:%02d", timeState.hour, timeState.minute)
                    showTimePicker = false
                }) { Text("确定") }
            },
            dismissButton = {
                TextButton(onClick = { showTimePicker = false }) { Text("取消") }
            },
        ) {
            TimePicker(state = timeState)
        }
    }

    deleteId?.let { id ->
        JxConfirmDialog(
            title = "确定删除？",
            message = "删除后无法恢复",
            onDismiss = { deleteId = null },
            onConfirm = {
                deleteId = null
                scope.launch { repo.deleteTodo(id) }
            },
        )
    }
}

@Composable
private fun PickerRow(text: String, placeholder: Boolean = false, onClick: () -> Unit) {
    val colors = JiXuTheme.colors
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(7.dp))
            .background(colors.soft)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(
            text,
            fontSize = 14.sp,
            color = if (placeholder) colors.faint else colors.text,
            modifier = Modifier.weight(1f),
        )
        Text("▼", fontSize = 9.sp, color = colors.muted)
    }
}

@Composable
private fun TodoCard(
    todo: TodoEntity,
    done: Boolean,
    due: Boolean,
    overdue: Boolean,
    onComplete: () -> Unit,
    onDisable: () -> Unit,
    onDelete: () -> Unit,
) {
    val colors = JiXuTheme.colors
    val border = when {
        done -> colors.inc
        due -> colors.warn
        else -> Color.Transparent
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .clip(RoundedCornerShape(10.dp))
            .background(if (done) colors.soft else colors.card),
    ) {
        if (border != Color.Transparent) {
            Box(Modifier.width(3.dp).fillMaxHeight().background(border))
        }
        Column(Modifier.weight(1f).padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f),
                ) {
                    JxTag(
                        cycleLabel(todo.cycle) + if (overdue) " 已过期" else "",
                        fg = if (overdue) colors.exp else colors.sub,
                        bg = if (overdue) colors.expSoft else colors.soft,
                    )
                    if (done) {
                        JxTag("✓ 今天已完成", fg = colors.inc, bg = colors.incSoft)
                    } else if (due) {
                        JxTag("今天到期", fg = colors.warn, bg = colors.warnSoft)
                    }
                }
                Text(
                    if (done) "下次 ${mmdd(todo.nextDate)}"
                    else mmdd(todo.nextDate) + (if (!todo.time.isNullOrEmpty()) " ${todo.time}" else ""),
                    fontSize = 11.sp,
                    color = colors.muted,
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                todo.title,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                color = if (done) colors.muted else colors.text,
                textDecoration = if (done) TextDecoration.LineThrough else null,
            )
            val amount = todo.amount
            if (amount != null && amount > 0) {
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "¥" + formatMoneyExact(amount),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = colors.warn,
                    )
                    if (!todo.categoryName.isNullOrEmpty()) {
                        Spacer(Modifier.width(6.dp))
                        Text(
                            "· ${todo.categoryName} - ${todo.subcategoryName}",
                            fontSize = 11.sp,
                            color = colors.muted,
                        )
                    }
                }
            }
            if (!todo.note.isNullOrEmpty()) {
                Spacer(Modifier.height(3.dp))
                Text(todo.note, fontSize = 11.sp, color = colors.faint)
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (done) {
                    Text(
                        "✓ 今天已完成",
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(colors.incSoft)
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = colors.inc,
                    )
                } else {
                    JxSmallAction(
                        if (amount != null && amount > 0) "✓ 完成并记账" else "✓ 完成",
                        onClick = onComplete,
                        fg = Color.White,
                        bg = colors.inc,
                    )
                }
                JxSmallAction("停用", onClick = onDisable, fg = colors.sub, bg = colors.soft)
                JxSmallAction("删除", onClick = onDelete, fg = colors.exp, bg = colors.expSoft)
            }
        }
    }
}

@Composable
private fun DoneTodoRow(todo: TodoEntity, onEnable: () -> Unit, onDelete: () -> Unit) {
    val colors = JiXuTheme.colors
    val dates = completedDatesOf(todo.completedDates)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(colors.soft)
            .padding(12.dp),
    ) {
        Text(todo.title, fontSize = 14.sp, color = colors.sub)
        Spacer(Modifier.height(3.dp))
        Text(
            cycleLabel(todo.cycle) +
                (if (dates.isNotEmpty()) " · 最后完成 ${dates.last()}" else "") +
                (if (!todo.isActive) " · 已停用" else ""),
            fontSize = 11.sp,
            color = colors.faint,
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!todo.isActive) {
                JxSmallAction("重新启用", onClick = onEnable, fg = colors.inc, bg = colors.incSoft)
            }
            JxSmallAction("删除", onClick = onDelete, fg = colors.exp, bg = colors.expSoft)
        }
    }
}
