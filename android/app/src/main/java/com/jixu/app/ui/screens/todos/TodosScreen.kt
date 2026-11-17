package com.jixu.app.ui.screens.todos

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.AppContainer
import com.jixu.app.core.AMOUNT_INPUT_MAX_LENGTH
import com.jixu.app.core.DEFAULT_CATEGORIES
import com.jixu.app.core.formatMoneyExact
import com.jixu.app.core.localDateStr
import com.jixu.app.core.parseAmountInput
import com.jixu.app.core.sanitizeAmountInput
import com.jixu.app.data.NewTodo
import com.jixu.app.data.db.TodoEntity
import com.jixu.app.notify.ReminderScheduler
import com.jixu.app.ui.screens.common.BConfirm
import com.jixu.app.ui.screens.common.BDialog
import com.jixu.app.ui.screens.common.BTextField
import com.jixu.app.ui.screens.common.BTopBar
import com.jixu.app.ui.screens.common.Chip
import com.jixu.app.ui.screens.common.EmptyLine
import com.jixu.app.ui.screens.common.HLine
import com.jixu.app.ui.screens.common.MicroLabel
import com.jixu.app.ui.screens.common.MiniButton
import com.jixu.app.ui.screens.common.ModuleHeader
import com.jixu.app.ui.screens.common.Panel
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.screens.common.todayStr
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.MonoFamily
import com.jixu.app.ui.theme.SansFamily
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
 * 待办事项（开发文档 §8.7）：周期待办 + 到期提醒 + 关联金额自动记账。
 * 业务逻辑与旧版一致，排版换成 B 的清单语言。
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TodosScreen(container: AppContainer, onBack: () -> Unit) {
    val c = JiXuTheme.colors
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val repo = container.repository

    val todosFlow = remember { repo.observeTodos() }
    val catsFlow = remember { repo.observeMergedCategories() }
    val todos by todosFlow.collectAsStateWithLifecycle(emptyList())
    val cats by catsFlow.collectAsStateWithLifecycle(DEFAULT_CATEGORIES)

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
        BTopBar(title = "待办事项", en = "07 · TODO", onBack = onBack) {
            Box(
                Modifier
                    .background(c.corS)
                    .border(1.dp, c.cor)
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            ) {
                Text(
                    undone.size.toString(),
                    style = TextStyle(fontFamily = MonoFamily, fontSize = 11.sp, color = c.cor),
                )
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
                        .background(c.ambS)
                        .border(1.dp, c.amb.copy(alpha = 0.35f))
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(6.dp).background(c.amb))
                    Text(
                        "今天有 ${dueToday.size} 个待办到期还没完成",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.amb),
                        modifier = Modifier.padding(start = 10.dp),
                    )
                }
                Spacer(Modifier.height(10.dp))
            }

            ReminderStatusCard(container)

            MiniButton(
                "+ 添加待办",
                onClick = {
                    resetForm()
                    showAdd = true
                },
                primary = true,
                height = 44.dp,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))

            if (active.isEmpty()) {
                Panel {
                    ModuleHeader(id = "T-00", title = "待办", en = "TASKS")
                    EmptyLine("暂无待办")
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "进行中",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = c.tx),
                    )
                    Text(
                        "(${undone.size}" + (if (doneToday.isNotEmpty()) " · 今天已完成 ${doneToday.size}" else "") + ")",
                        style = TextStyle(fontFamily = MonoFamily, fontSize = 10.5.sp, color = c.dim),
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
                Spacer(Modifier.height(6.dp))
            }

            (undone + doneToday).forEachIndexed { index, todo ->
                val done = completedDatesOf(todo.completedDates).lastOrNull() == today
                val due = !done && todo.nextDate <= today
                val overdue = !done && todo.nextDate < today
                TodoCard(
                    index = index,
                    todo = todo,
                    done = done,
                    due = due,
                    overdue = overdue,
                    onComplete = { complete(todo) },
                    onDisable = { scope.launch { repo.toggleTodo(todo.id, false) } },
                    onDelete = { deleteId = todo.id },
                )
                Spacer(Modifier.height(8.dp))
            }

            if (completed.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showDone = !showDone }
                        .padding(vertical = 10.dp),
                ) {
                    MicroLabel("已完成 · DONE (${completed.size})", color = c.dim)
                    Spacer(Modifier.weight(1f))
                    Text(
                        if (showDone) "收起 ▴" else "展开 ▾",
                        style = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, color = c.fnt),
                    )
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
        BDialog(title = "添加待办", en = "NEW TODO", onDismiss = { showAdd = false }) {
            MicroLabel("标题 · TITLE", color = c.fnt)
            BTextField(
                value = title,
                onValueChange = { title = it },
                placeholder = "如：交房租、喝水",
                maxLength = 20,
                textSize = 14.sp,
                modifier = Modifier.padding(top = 6.dp),
            )
            HLine(Modifier.padding(top = 6.dp))

            Spacer(Modifier.height(14.dp))
            MicroLabel("周期 · CYCLE", color = c.fnt)
            Spacer(Modifier.height(6.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                CYCLE_KEYS.forEach { key ->
                    Chip(cycleLabel(key), selected = fCycle == key, onClick = {
                        fCycle = key
                        if (key !in TIME_CYCLES) fTime = ""
                        focusManager.clearFocus()
                    })
                }
            }

            Spacer(Modifier.height(14.dp))
            MicroLabel(if (fCycle == "once") "截止日期 · DUE" else "首次日期 · NEXT", color = c.fnt)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        focusManager.clearFocus()
                        showDatePicker = true
                    }
                    .padding(vertical = 10.dp),
            ) {
                Text(
                    fNextDate,
                    style = TextStyle(fontFamily = MonoFamily, fontSize = 13.sp, color = c.tx),
                    modifier = Modifier.weight(1f),
                )
                Text("›", style = TextStyle(fontFamily = MonoFamily, fontSize = 14.sp, color = c.fnt))
            }
            HLine()

            if (fCycle in TIME_CYCLES) {
                Spacer(Modifier.height(14.dp))
                MicroLabel("具体时间 · TIME（可选）", color = c.fnt)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            focusManager.clearFocus()
                            showTimePicker = true
                        }
                        .padding(vertical = 10.dp),
                ) {
                    Text(
                        fTime.ifEmpty { "不限" },
                        style = TextStyle(
                            fontFamily = MonoFamily,
                            fontSize = 13.sp,
                            color = if (fTime.isEmpty()) c.fnt else c.tx,
                        ),
                        modifier = Modifier.weight(1f),
                    )
                    Text("›", style = TextStyle(fontFamily = MonoFamily, fontSize = 14.sp, color = c.fnt))
                }
                HLine()
            }

            Spacer(Modifier.height(14.dp))
            MicroLabel("关联金额 · AMOUNT（可选）", color = c.fnt)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("¥", style = TextStyle(fontFamily = MonoFamily, fontSize = 18.sp, color = c.dim))
                Spacer(Modifier.width(8.dp))
                BTextField(
                    value = fAmount,
                    onValueChange = { fAmount = sanitizeAmountInput(it) },
                    placeholder = "填了自动记账",
                    maxLength = AMOUNT_INPUT_MAX_LENGTH,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textSize = 20.sp,
                    mono = true,
                    modifier = Modifier.weight(1f),
                )
            }
            HLine(Modifier.padding(top = 6.dp))

            if (hasAmount) {
                Spacer(Modifier.height(14.dp))
                MicroLabel("一级分类 · CATEGORY", color = c.fnt)
                Spacer(Modifier.height(6.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    cats.forEach { cat ->
                        Chip(cat.name, selected = fCatKey == cat.key, onClick = {
                            if (fCatKey != cat.key) {
                                fCatKey = cat.key
                                fSubKey = ""
                            }
                        })
                    }
                }
                Spacer(Modifier.height(12.dp))
                MicroLabel("二级分类 · SUB", color = c.fnt)
                Spacer(Modifier.height(6.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    subs.forEach { s ->
                        Chip(s.name, selected = fSubKey == s.key, onClick = { fSubKey = s.key })
                    }
                }
            }

            Spacer(Modifier.height(14.dp))
            MicroLabel("备注 · NOTE（可选）", color = c.fnt)
            BTextField(
                value = fNote,
                onValueChange = { fNote = it },
                placeholder = "补充说明",
                maxLength = 30,
                textSize = 13.sp,
                modifier = Modifier.padding(top = 6.dp),
            )
            HLine(Modifier.padding(top = 6.dp))

            Spacer(Modifier.height(16.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Spacer(Modifier.weight(1f))
                MiniButton("取消", onClick = { showAdd = false })
                MiniButton("添加", onClick = { addTodo() }, primary = true)
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
        BConfirm(
            title = "确定删除？",
            message = "删除后无法恢复",
            confirmText = "删除",
            onDismiss = { deleteId = null },
            onConfirm = {
                deleteId = null
                scope.launch { repo.deleteTodo(id) }
            },
        )
    }
}

@Composable
private fun ReminderStatusCard(container: AppContainer) {
    val c = JiXuTheme.colors
    val context = LocalContext.current
    var notificationsEnabled by remember { mutableStateOf(ReminderScheduler.notificationsEnabled(context)) }
    var exactAllowed by remember { mutableStateOf(ReminderScheduler.canScheduleExact(context)) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        notificationsEnabled = ReminderScheduler.notificationsEnabled(context)
        if (granted) {
            container.reminders.rescheduleSoon()
        } else {
            context.showToast("未开启通知权限，到期提醒无法显示")
        }
    }

    // 从系统设置返回后刷新状态（重排由 MainActivity.onResume 统一触发）
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        notificationsEnabled = ReminderScheduler.notificationsEnabled(context)
        exactAllowed = ReminderScheduler.canScheduleExact(context)
    }

    fun openSystem(intent: Intent) {
        runCatching {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    Panel(contentPadding = PaddingValues(14.dp)) {
        ModuleHeader(id = "T-REM", title = "到期提醒", en = "REMINDER") {
            Box(
                Modifier
                    .size(7.dp)
                    .background(if (notificationsEnabled) c.acF else c.fnt),
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            if (notificationsEnabled) {
                "到期提醒已开启 · 每天 08:00 和设定时间提醒你"
            } else {
                "开启后，每天 08:00 汇总到期待办，设了具体时间的待办到点提醒"
            },
            style = TextStyle(fontFamily = SansFamily, fontSize = 11.5.sp, lineHeight = 18.sp, color = c.dim),
        )
        if (!notificationsEnabled) {
            Spacer(Modifier.height(10.dp))
            MiniButton("开启到期提醒", onClick = {
                val needsRuntimePermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.POST_NOTIFICATIONS,
                    ) != PackageManager.PERMISSION_GRANTED
                if (needsRuntimePermission) {
                    permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    // 权限已被用户拒绝过/通知被系统关闭：只能去系统设置里打开
                    openSystem(ReminderScheduler.openNotificationSettingsIntent(context))
                }
            }, primary = true)
        }
        if (notificationsEnabled && !exactAllowed) {
            Spacer(Modifier.height(8.dp))
            MiniButton("提醒可能延迟，点这里允许准时提醒", onClick = {
                openSystem(ReminderScheduler.openExactAlarmSettingsIntent(context))
            })
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "部分手机需允许后台运行才能准时提醒 ›",
            style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.fnt),
            modifier = Modifier.clickable { openSystem(ReminderScheduler.openAppDetailsIntent(context)) },
        )
    }
    Spacer(Modifier.height(10.dp))
}

@Composable
private fun TodoCheck(done: Boolean) {
    val c = JiXuTheme.colors
    Box(
        modifier = Modifier
            .size(22.dp)
            .background(if (done) c.acF else androidx.compose.ui.graphics.Color.Transparent)
            .border(1.5.dp, if (done) c.acF else c.ln2),
        contentAlignment = Alignment.Center,
    ) {
        if (done) {
            Icon(
                Icons.Filled.Check,
                contentDescription = null,
                tint = c.onAc,
                modifier = Modifier.size(15.dp),
            )
        }
    }
}

@Composable
private fun Tag(text: String, fg: androidx.compose.ui.graphics.Color, bg: androidx.compose.ui.graphics.Color) {
    Box(
        Modifier.background(bg).padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text(text, style = TextStyle(fontFamily = SansFamily, fontSize = 10.sp, color = fg), maxLines = 1)
    }
}

@Composable
private fun TodoCard(
    index: Int,
    todo: TodoEntity,
    done: Boolean,
    due: Boolean,
    overdue: Boolean,
    onComplete: () -> Unit,
    onDisable: () -> Unit,
    onDelete: () -> Unit,
) {
    val c = JiXuTheme.colors
    val accent = when {
        done -> c.inc
        overdue -> c.cor
        due -> c.amb
        else -> c.fnt
    }
    Panel(contentPadding = PaddingValues(14.dp)) {
        Row {
            Column(
                Modifier
                    .padding(top = 1.dp)
                    .clickable { if (!done) onComplete() },
            ) {
                TodoCheck(done)
            }
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MicroLabel("T-" + (index + 1).toString().padStart(2, '0'), color = c.fnt)
                    Spacer(Modifier.width(8.dp))
                    Tag(
                        cycleLabel(todo.cycle) + if (overdue) " 已过期" else "",
                        fg = accent,
                        bg = c.p3,
                    )
                    if (done) {
                        Spacer(Modifier.width(6.dp))
                        Tag("今天已完成", fg = c.inc, bg = c.incS)
                    } else if (due) {
                        Spacer(Modifier.width(6.dp))
                        Tag("今天到期", fg = c.amb, bg = c.ambS)
                    }
                    Spacer(Modifier.weight(1f))
                    Text(
                        if (done) {
                            "下次 ${mmdd(todo.nextDate)}"
                        } else {
                            mmdd(todo.nextDate) + (if (!todo.time.isNullOrEmpty()) " ${todo.time}" else "")
                        },
                        style = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, color = c.dim),
                    )
                }
                Spacer(Modifier.height(7.dp))
                Text(
                    todo.title,
                    style = TextStyle(
                        fontFamily = SansFamily,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (done) c.dim else c.tx,
                        textDecoration = if (done) TextDecoration.LineThrough else null,
                    ),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val amount = todo.amount
                if (amount != null && amount > 0) {
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "¥" + formatMoneyExact(amount),
                            style = TextStyle(fontFamily = MonoFamily, fontSize = 12.5.sp, color = c.amb),
                        )
                        if (!todo.categoryName.isNullOrEmpty()) {
                            Text(
                                "· ${todo.categoryName} / ${todo.subcategoryName}",
                                style = TextStyle(fontFamily = SansFamily, fontSize = 10.5.sp, color = c.fnt),
                                modifier = Modifier.padding(start = 6.dp),
                                maxLines = 1,
                            )
                        }
                    }
                }
                if (!todo.note.isNullOrEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        todo.note,
                        style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.fnt),
                        maxLines = 2,
                    )
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (done) {
                        Text(
                            "✓ 今天已完成",
                            style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.inc),
                        )
                    } else {
                        MiniButton(
                            if (amount != null && amount > 0) "✓ 完成并记账" else "✓ 完成",
                            onClick = onComplete,
                            primary = true,
                            height = 32.dp,
                        )
                    }
                    MiniButton("停用", onClick = onDisable, height = 32.dp)
                    MiniButton("删除", onClick = onDelete, danger = true, height = 32.dp)
                }
            }
        }
    }
}

@Composable
private fun DoneTodoRow(todo: TodoEntity, onEnable: () -> Unit, onDelete: () -> Unit) {
    val c = JiXuTheme.colors
    val dates = completedDatesOf(todo.completedDates)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(c.p1)
            .border(1.dp, c.ln)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                todo.title,
                style = TextStyle(fontFamily = SansFamily, fontSize = 13.sp, color = c.dim),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                cycleLabel(todo.cycle) +
                    (if (dates.isNotEmpty()) " · 最后完成 ${dates.last()}" else "") +
                    (if (!todo.isActive) " · 已停用" else ""),
                style = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, color = c.fnt),
                modifier = Modifier.padding(top = 3.dp),
                maxLines = 1,
            )
        }
        if (!todo.isActive) {
            MiniButton("重新启用", onClick = onEnable, height = 30.dp)
            Spacer(Modifier.width(6.dp))
        }
        MiniButton("删除", onClick = onDelete, danger = true, height = 30.dp)
    }
}
