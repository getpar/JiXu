package com.jixu.app.ui.screens.recurring

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
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
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

private val CYCLE_KEYS = listOf("monthly", "weekly", "daily", "yearly")
private val CYCLE_LABELS = mapOf("daily" to "每天", "weekly" to "每周", "monthly" to "每月", "yearly" to "每年")

private fun cycleLabel(cycle: String): String = CYCLE_LABELS[cycle] ?: cycle

/**
 * 周期账单（开发文档 §8.6，参照 miniapp/src/pages/recurring/index.tsx）。
 * 笔记：周期账单不在后台自动记账，仍由首页同步结束后执行（§10）。
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RecurringScreen(container: AppContainer, onBack: () -> Unit) {
    val colors = JiXuTheme.colors
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val repo = container.repository

    val bills by repo.observeRecurringBills().collectAsStateWithLifecycle(emptyList())
    val cats by repo.observeMergedCategories().collectAsStateWithLifecycle(DEFAULT_CATEGORIES)

    var showAdd by remember { mutableStateOf(false) }
    var deleteId by remember { mutableStateOf<String?>(null) }

    var fType by rememberSaveable { mutableStateOf("expense") }
    var fAmount by rememberSaveable { mutableStateOf("") }
    var fCycle by rememberSaveable { mutableStateOf("monthly") }
    var fNextDate by rememberSaveable { mutableStateOf(todayStr()) }
    var fCatKey by rememberSaveable { mutableStateOf("food") }
    var fSubKey by rememberSaveable { mutableStateOf("") }
    var fNote by rememberSaveable { mutableStateOf("") }
    var cycleOpen by remember { mutableStateOf(false) }
    var catOpen by remember { mutableStateOf(false) }
    var subOpen by remember { mutableStateOf(false) }
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
        JxTopBar(title = "周期账单", onBack = onBack)

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 14.dp),
        ) {
            Spacer(Modifier.height(4.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(colors.soft)
                    .padding(horizontal = 14.dp, vertical = 11.dp),
            ) {
                Text(
                    "房租、订阅等固定开销，到期一键记录，不用每次手动填",
                    fontSize = 12.sp,
                    color = colors.sub,
                    lineHeight = 19.sp,
                )
            }
            Spacer(Modifier.height(10.dp))
            JxPrimaryButton("+ 添加周期账单", onClick = {
                resetForm()
                showAdd = true
            })
            Spacer(Modifier.height(10.dp))

            if (bills.isEmpty()) {
                JxEmpty("暂无周期账单")
            } else {
                bills.forEach { bill ->
                    BillCard(
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
        JxDialog(title = "添加周期账单", onDismiss = { showAdd = false }) {
            JxLabel("类型")
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(7.dp))
                    .background(colors.soft)
                    .padding(3.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                listOf("expense" to "支出", "income" to "收入").forEach { (key, label) ->
                    val selected = fType == key
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(5.dp))
                            .background(
                                if (selected) {
                                    if (key == "income") colors.inc else colors.exp
                                } else {
                                    Color.Transparent
                                },
                            )
                            .clickable {
                                fType = key
                                focusManager.clearFocus()
                            }
                            .padding(vertical = 7.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            label,
                            fontSize = 13.sp,
                            color = if (selected) Color.White else colors.sub,
                            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            JxLabel("金额")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("¥", fontSize = 22.sp, fontWeight = FontWeight.Medium, color = colors.accent)
                Spacer(Modifier.width(8.dp))
                JxTextField(
                    value = fAmount,
                    onValueChange = { fAmount = sanitizeAmountInput(it) },
                    placeholder = "输入金额",
                    maxLength = AMOUNT_INPUT_MAX_LENGTH,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textSize = 22.sp,
                    modifier = Modifier.weight(1f),
                )
            }

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
                                cycleOpen = false
                            },
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            JxLabel("下次日期")
            PickerRow(text = fNextDate) {
                focusManager.clearFocus()
                showDatePicker = true
            }

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

            Spacer(Modifier.height(12.dp))
            JxLabel("备注")
            JxTextField(
                value = fNote,
                onValueChange = { fNote = it },
                placeholder = "如：房租、Netflix",
            )

            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp), modifier = Modifier.fillMaxWidth()) {
                Spacer(Modifier.weight(1f))
                JxLink("取消", onClick = { showAdd = false }, color = colors.sub, size = 14.sp)
                JxLink("添加", onClick = { addBill() }, size = 14.sp)
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
        JxConfirmDialog(
            title = "确定删除？",
            message = "删除后无法恢复",
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BillCard(
    bill: RecurringBillEntity,
    onToggle: () -> Unit,
    onExecute: () -> Unit,
    onDelete: () -> Unit,
) {
    val colors = JiXuTheme.colors
    JxCard(modifier = Modifier.alpha(if (bill.isActive) 1f else 0.5f)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(if (bill.type == "income") colors.inc else colors.exp),
            )
            Spacer(Modifier.width(6.dp))
            Text(
                "${bill.categoryName} · ${bill.subcategoryName}",
                fontSize = 12.sp,
                color = colors.sub,
                modifier = Modifier.weight(1f),
            )
            Text(
                (if (bill.type == "income") "+" else "-") + "¥" + formatMoneyExact(bill.amount),
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                color = if (bill.type == "income") colors.inc else colors.exp,
            )
        }
        Spacer(Modifier.height(8.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            JxTag(cycleLabel(bill.cycle), fg = colors.sub, bg = colors.soft)
            Text("下次：${bill.nextDate}", fontSize = 11.sp, color = colors.muted)
            if (bill.note.isNotEmpty()) {
                Text("· ${bill.note}", fontSize = 11.sp, color = colors.faint)
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (bill.isActive) {
                JxSmallAction("已启用", onClick = onToggle, fg = colors.inc, bg = colors.incSoft)
            } else {
                JxSmallAction("已停用", onClick = onToggle, fg = colors.muted, bg = colors.soft)
            }
            JxSmallAction("立即记录", onClick = onExecute)
            JxSmallAction("删除", onClick = onDelete, fg = colors.exp, bg = colors.expSoft)
        }
    }
}
