package com.jixu.app.ui.screens.recurring

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.AppContainer
import com.jixu.app.core.AMOUNT_INPUT_MAX_LENGTH
import com.jixu.app.core.CategoryGroup
import com.jixu.app.core.DEFAULT_CATEGORIES
import com.jixu.app.core.formatMoneyExact
import com.jixu.app.core.localDateStr
import com.jixu.app.core.parseAmountInput
import com.jixu.app.core.sanitizeAmountInput
import com.jixu.app.data.NewRecurringBill
import com.jixu.app.data.db.RecurringBillEntity
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
import com.jixu.app.ui.screens.common.Seg
import com.jixu.app.ui.screens.common.Toggle
import com.jixu.app.ui.screens.common.dayName
import com.jixu.app.ui.screens.common.mmddDot
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.screens.common.todayStr
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.MonoFamily
import com.jixu.app.ui.theme.SansFamily
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

private val CYCLE_KEYS = listOf("monthly", "weekly", "daily", "yearly")
private val CYCLE_LABELS = mapOf("daily" to "每天", "weekly" to "每周", "monthly" to "每月", "yearly" to "每年")

private fun cycleLabel(cycle: String): String = CYCLE_LABELS[cycle] ?: cycle

/**
 * 周期账单（开发文档 §8.6）：房租、订阅等固定开销，到期一键记录。
 * 后台不自动记账，仍由首页同步结束后执行（§10）。
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RecurringScreen(container: AppContainer, onBack: () -> Unit) {
    val c = JiXuTheme.colors
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val repo = container.repository

    val billsFlow = remember { repo.observeRecurringBills() }
    val catsFlow = remember { repo.observeMergedCategories() }
    val bills by billsFlow.collectAsStateWithLifecycle(emptyList())
    val cats by catsFlow.collectAsStateWithLifecycle(DEFAULT_CATEGORIES)

    var showAdd by remember { mutableStateOf(false) }
    var deleteId by remember { mutableStateOf<String?>(null) }

    var fType by rememberSaveable { mutableStateOf("expense") }
    var fAmount by rememberSaveable { mutableStateOf("") }
    var fCycle by rememberSaveable { mutableStateOf("monthly") }
    var fNextDate by rememberSaveable { mutableStateOf(todayStr()) }
    var fCatKey by rememberSaveable { mutableStateOf("food") }
    var fSubKey by rememberSaveable { mutableStateOf("") }
    var fNote by rememberSaveable { mutableStateOf("") }
    var showDatePicker by remember { mutableStateOf(false) }

    val currentCat = cats.firstOrNull { it.key == fCatKey }
    val subs = currentCat?.subs ?: emptyList()

    fun resetForm() {
        fType = "expense"
        fAmount = ""
        fCycle = "monthly"
        fNextDate = todayStr()
        fCatKey = "food"
        fSubKey = ""
        fNote = ""
    }

    fun addBill() {
        val parsed = parseAmountInput(fAmount)
        if (!parsed.ok) {
            context.showToast(parsed.message)
            return
        }
        val cat = cats.firstOrNull { it.key == fCatKey }
        val sub = cat?.subs?.firstOrNull { it.key == fSubKey }
        if (sub == null) {
            context.showToast("请选择分类")
            return
        }
        focusManager.clearFocus()
        scope.launch {
            repo.addRecurringBill(
                NewRecurringBill(
                    type = fType,
                    amount = parsed.value,
                    categoryKey = fCatKey,
                    categoryName = cat.name,
                    subcategoryKey = sub.key,
                    subcategoryName = sub.name,
                    note = fNote,
                    cycle = fCycle,
                    nextDate = fNextDate,
                    isActive = true,
                ),
            )
            context.showToast("添加成功")
            showAdd = false
            resetForm()
        }
    }

    Column(Modifier.fillMaxSize()) {
        BTopBar(title = "周期账单", en = "06 · CYCLE", onBack = onBack) {
            MiniButton("+ 添加", onClick = {
                resetForm()
                showAdd = true
            }, primary = true)
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 14.dp),
        ) {
            Spacer(Modifier.height(4.dp))
            Panel(flat = true, contentPadding = PaddingValues(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.width(2.dp).height(28.dp).background(c.acF))
                    Text(
                        "房租、订阅等固定开销，到期一键记录，不用每次手动填",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, lineHeight = 19.sp, color = c.dim),
                        modifier = Modifier.padding(start = 10.dp),
                    )
                }
            }
            Spacer(Modifier.height(10.dp))

            if (bills.isEmpty()) {
                Panel {
                    ModuleHeader(id = "R-00", title = "周期账单", en = "RECURRING")
                    EmptyLine("暂无周期账单")
                }
            } else {
                bills.forEachIndexed { index, bill ->
                    BillCard(
                        index = index,
                        bill = bill,
                        onToggle = {
                            scope.launch { repo.toggleRecurringBill(bill.id, !bill.isActive) }
                        },
                        onExecute = {
                            scope.launch {
                                repo.executeRecurringBill(bill.id)
                                context.showToast("已记录 ¥${formatMoneyExact(bill.amount)}")
                            }
                        },
                        onDelete = { deleteId = bill.id },
                    )
                    Spacer(Modifier.height(10.dp))
                }
            }
            Spacer(Modifier.height(20.dp))
        }
    }

    if (showAdd) {
        BDialog(title = "添加周期账单", en = "NEW", onDismiss = { showAdd = false }) {
            MicroLabel("类型 · TYPE", color = c.fnt)
            Spacer(Modifier.height(6.dp))
            Seg(
                options = listOf("expense" to "支出", "income" to "收入"),
                selected = fType,
                onSelect = {
                    fType = it
                    focusManager.clearFocus()
                },
                accent = if (fType == "income") c.inc else c.acF,
            )

            Spacer(Modifier.height(14.dp))
            MicroLabel("金额 · AMOUNT", color = c.fnt)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("¥", style = TextStyle(fontFamily = MonoFamily, fontSize = 18.sp, color = c.dim))
                Spacer(Modifier.width(8.dp))
                BTextField(
                    value = fAmount,
                    onValueChange = { fAmount = sanitizeAmountInput(it) },
                    placeholder = "输入金额",
                    maxLength = AMOUNT_INPUT_MAX_LENGTH,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textSize = 22.sp,
                    mono = true,
                    modifier = Modifier.weight(1f),
                )
            }
            HLine(Modifier.padding(top = 6.dp))

            Spacer(Modifier.height(14.dp))
            MicroLabel("周期 · CYCLE", color = c.fnt)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                CYCLE_KEYS.forEach { key ->
                    Chip(cycleLabel(key), selected = fCycle == key, onClick = { fCycle = key })
                }
            }

            Spacer(Modifier.height(14.dp))
            MicroLabel("下次日期 · NEXT", color = c.fnt)
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
                    dayName(fNextDate) + " " + mmddDot(fNextDate),
                    style = TextStyle(fontFamily = MonoFamily, fontSize = 13.sp, color = c.tx),
                    modifier = Modifier.weight(1f),
                )
                Text("›", style = TextStyle(fontFamily = MonoFamily, fontSize = 14.sp, color = c.fnt))
            }
            HLine()

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
                        focusManager.clearFocus()
                    })
                }
            }

            if (subs.isNotEmpty()) {
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
            MicroLabel("备注 · NOTE", color = c.fnt)
            BTextField(
                value = fNote,
                onValueChange = { fNote = it },
                placeholder = "如：房租、Netflix",
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
                MiniButton("添加", onClick = { addBill() }, primary = true)
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

    deleteId?.let { id ->
        BConfirm(
            title = "确定删除？",
            message = "删除后无法恢复，已记录的账不受影响",
            confirmText = "删除",
            onDismiss = { deleteId = null },
            onConfirm = {
                deleteId = null
                scope.launch {
                    repo.deleteRecurringBill(id)
                    context.showToast("已删除")
                }
            },
        )
    }
}

@Composable
private fun BillCard(
    index: Int,
    bill: RecurringBillEntity,
    onToggle: () -> Unit,
    onExecute: () -> Unit,
    onDelete: () -> Unit,
) {
    val c = JiXuTheme.colors
    Panel(modifier = Modifier.alpha(if (bill.isActive) 1f else 0.55f)) {
        ModuleHeader(
            id = "R-" + (index + 1).toString().padStart(2, '0'),
            title = bill.subcategoryName.ifEmpty { bill.categoryName },
            en = cycleLabel(bill.cycle).let {
                when (bill.cycle) {
                    "daily" -> "DAILY"
                    "weekly" -> "WEEKLY"
                    "monthly" -> "MONTHLY"
                    "yearly" -> "YEARLY"
                    else -> "CYCLE"
                }
            },
        ) {
            Toggle(checked = bill.isActive, onChange = { onToggle() })
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                (if (bill.type == "income") "+" else "-") + "¥" + formatMoneyExact(bill.amount),
                style = TextStyle(
                    fontFamily = MonoFamily,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Light,
                    letterSpacing = (-0.5).sp,
                    color = if (bill.type == "income") c.inc else c.tx,
                ),
            )
            Spacer(Modifier.weight(1f))
            Text(
                "${bill.categoryName} · ${bill.subcategoryName}",
                style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.dim),
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "下次 " + mmddDot(bill.nextDate),
                style = TextStyle(fontFamily = MonoFamily, fontSize = 10.5.sp, color = c.dim),
            )
            if (bill.note.isNotEmpty()) {
                Text(
                    "· ${bill.note}",
                    style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.fnt),
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
            Spacer(Modifier.weight(1f))
            Text(
                if (bill.isActive) "已启用" else "已停用",
                style = TextStyle(fontFamily = SansFamily, fontSize = 10.5.sp, color = if (bill.isActive) c.inc else c.fnt),
            )
        }
        Spacer(Modifier.height(10.dp))
        HLine()
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            MiniButton("立即记录", onClick = onExecute, primary = true)
            MiniButton("删除", onClick = onDelete, danger = true)
        }
    }
}
