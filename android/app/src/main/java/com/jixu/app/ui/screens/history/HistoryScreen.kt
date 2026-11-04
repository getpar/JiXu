package com.jixu.app.ui.screens.history

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.AppContainer
import com.jixu.app.core.AMOUNT_INPUT_MAX_LENGTH
import com.jixu.app.core.CategoryGroup
import com.jixu.app.core.formatMoney
import com.jixu.app.core.formatMoneyExact
import com.jixu.app.core.isSuspiciousAmount
import com.jixu.app.core.jsNumberToString
import com.jixu.app.core.localDateStr
import com.jixu.app.core.parseAmountInput
import com.jixu.app.core.sanitizeAmountInput
import com.jixu.app.core.sumAmounts
import com.jixu.app.data.RecordUpdate
import com.jixu.app.data.db.RecordEntity
import com.jixu.app.ui.screens.common.JxAmount
import com.jixu.app.ui.screens.common.JxCard
import com.jixu.app.ui.screens.common.JxConfirmDialog
import com.jixu.app.ui.screens.common.JxDialog
import com.jixu.app.ui.screens.common.JxDivider
import com.jixu.app.ui.screens.common.JxEmpty
import com.jixu.app.ui.screens.common.JxLabel
import com.jixu.app.ui.screens.common.JxLink
import com.jixu.app.ui.screens.common.JxTag
import com.jixu.app.ui.screens.common.JxTextField
import com.jixu.app.ui.screens.common.monthOptions
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.theme.JiXuTheme
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.math.min

/** 统计页下钻带给账单页的筛选（§8.3-3） */
data class HistoryDrillDown(val month: String, val catKey: String?, val catName: String?)

private const val PAGE_SIZE = 50

private data class EditForm(
    val id: String,
    val amount: String,
    val date: String,
    val catKey: String,
    val subKey: String,
    val note: String,
    val person: String,
)

/**
 * 账单（开发文档 §8.3，参照 miniapp/src/pages/history/index.tsx）。
 * 列表用 LazyColumn 分批渲染；导出在 P7 接线。
 */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    container: AppContainer,
    drillDown: HistoryDrillDown?,
    onDrillDownConsumed: () -> Unit,
) {
    val colors = JiXuTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = container.repository
    val alive by repo.observeAliveRecords().collectAsStateWithLifecycle(emptyList())
    val deleted by repo.observeDeletedRecords().collectAsStateWithLifecycle(emptyList())

    var month by rememberSaveable { mutableStateOf("") }
    var type by rememberSaveable { mutableStateOf("") }
    var keyword by rememberSaveable { mutableStateOf("") }
    var catKey by rememberSaveable { mutableStateOf("") }
    var catName by rememberSaveable { mutableStateOf("") }
    var shown by remember { mutableIntStateOf(PAGE_SIZE) }
    var trashOpen by rememberSaveable { mutableStateOf(false) }
    var monthOpen by remember { mutableStateOf(false) }
    var typeOpen by remember { mutableStateOf(false) }
    var edit by remember { mutableStateOf<EditForm?>(null) }
    var editCatMenuOpen by remember { mutableStateOf(false) }
    var editDatePicker by remember { mutableStateOf(false) }
    var deleteId by remember { mutableStateOf<String?>(null) }
    var restoreId by remember { mutableStateOf<String?>(null) }
    var purgeId by remember { mutableStateOf<String?>(null) }
    var editCategories by remember { mutableStateOf<List<CategoryGroup>>(emptyList()) }

    // 进页同步（非强制）；Room Flow 自动刷新列表
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        scope.launch {
            runCatching { container.syncManager.syncNow(false) }
            editCategories = runCatching { repo.getMergedCategories() }.getOrDefault(emptyList())
        }
    }

    // 从统计页下钻：设置月份 + 分类筛选，清空类型与关键词
    LaunchedEffect(drillDown) {
        val d = drillDown ?: return@LaunchedEffect
        month = d.month
        type = ""
        keyword = ""
        catKey = d.catKey ?: ""
        catName = d.catName ?: ""
        onDrillDownConsumed()
    }

    val filtered = remember(alive, month, type, keyword, catKey) {
        alive.asSequence()
            .filter { month.isEmpty() || it.date.startsWith(month) }
            .filter { type.isEmpty() || it.type == type }
            .filter { catKey.isEmpty() || it.categoryKey == catKey || it.subcategoryKey == catKey }
            .filter {
                keyword.isEmpty() ||
                    it.note.contains(keyword) ||
                    it.categoryName.contains(keyword) ||
                    it.subcategoryName.contains(keyword) ||
                    it.person.contains(keyword)
            }
            .toList()
    }

    val expenseSum = remember(filtered) {
        sumAmounts(filtered.filter { it.type == "expense" }.map { it.amount }.toDoubleArray())
    }
    val incomeSum = remember(filtered) {
        sumAmounts(filtered.filter { it.type == "income" }.map { it.amount }.toDoubleArray())
    }

    LaunchedEffect(month, type, keyword, catKey) { shown = PAGE_SIZE }

    val monthLabels = remember { listOf("全部日期") + monthOptions() }
    val monthLabel = month.ifEmpty { "全部日期" }
    val typeLabel = when (type) {
        "expense" -> "支出"
        "income" -> "收入"
        else -> "全部"
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .imePadding(),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(key = "filters") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f)) {
                    FilterCard(monthLabel) { monthOpen = true }
                    DropdownMenu(expanded = monthOpen, onDismissRequest = { monthOpen = false }) {
                        monthLabels.forEach { label ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        label,
                                        color = if (label == monthLabel) colors.accent else colors.text,
                                    )
                                },
                                onClick = {
                                    month = if (label == "全部日期") "" else label
                                    monthOpen = false
                                },
                            )
                        }
                    }
                }
                Box(Modifier.weight(1f)) {
                    FilterCard(typeLabel) { typeOpen = true }
                    DropdownMenu(expanded = typeOpen, onDismissRequest = { typeOpen = false }) {
                        listOf("全部" to "", "支出" to "expense", "收入" to "income").forEach { (label, key) ->
                            DropdownMenuItem(
                                text = { Text(label, color = if (key == type) colors.accent else colors.text) },
                                onClick = {
                                    type = key
                                    typeOpen = false
                                },
                            )
                        }
                    }
                }
            }
        }

        item(key = "search") {
            JxCard(padding = 0.dp) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                ) {
                    JxTextField(
                        value = keyword,
                        onValueChange = { keyword = it },
                        placeholder = "搜索备注或分类...",
                        modifier = Modifier.weight(1f),
                    )
                    if (keyword.isNotEmpty()) {
                        Text(
                            "✕",
                            fontSize = 14.sp,
                            color = colors.faint,
                            modifier = Modifier
                                .clip(RoundedCornerShape(99.dp))
                                .clickable { keyword = "" }
                                .padding(horizontal = 4.dp, vertical = 2.dp),
                        )
                    }
                }
            }
        }

        if (catKey.isNotEmpty()) {
            item(key = "catFilter") {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(colors.accentSoft)
                        .clickable {
                            catKey = ""
                            catName = ""
                        }
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Text("分类：$catName", fontSize = 12.sp, color = colors.accent)
                    Spacer(Modifier.width(8.dp))
                    Text("✕", fontSize = 12.sp, color = colors.accent)
                }
            }
        }

        item(key = "summary") {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("支出 ¥" + formatMoney(expenseSum), fontSize = 12.sp, color = colors.exp, fontWeight = FontWeight.Medium)
                Text("收入 ¥" + formatMoney(incomeSum), fontSize = 12.sp, color = colors.inc, fontWeight = FontWeight.Medium)
                Text("共 ${filtered.size} 条", fontSize = 12.sp, color = colors.muted)
                JxLink("导出Excel", onClick = { context.showToast("导出功能将在 P7 阶段实现") }, size = 12.sp)
            }
        }

        if (filtered.isEmpty()) {
            item(key = "empty") { JxEmpty("暂无记录") }
        }

        items(filtered.take(shown), key = { it.id }) { r ->
            RecordRow(
                record = r,
                onEdit = {
                    editCatMenuOpen = false
                    editDatePicker = false
                    edit = EditForm(
                        id = r.id,
                        amount = sanitizeAmountInput(jsNumberToString(r.amount)),
                        date = r.date,
                        catKey = r.categoryKey,
                        subKey = r.subcategoryKey,
                        note = r.note,
                        person = r.person,
                    )
                },
                onDelete = { deleteId = r.id },
            )
        }

        if (filtered.size > shown) {
            item(key = "more-$shown") {
                LaunchedEffect(filtered.size, shown) {
                    shown = min(shown + PAGE_SIZE, filtered.size)
                }
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "上滑加载更多（$shown / ${filtered.size}）",
                        fontSize = 12.sp,
                        color = colors.muted,
                    )
                }
            }
        }

        // ===== 回收站 =====
        if (deleted.isNotEmpty()) {
            item(key = "trash") {
                JxCard(padding = 0.dp) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { trashOpen = !trashOpen }
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                    ) {
                        Text(
                            "已删除 (${deleted.size})",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = colors.sub,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            if (trashOpen) "收起 ▴" else "展开 ▾",
                            fontSize = 11.sp,
                            color = colors.faint,
                        )
                    }
                    if (trashOpen) {
                        Text(
                            "误删的账可以恢复，恢复后其它设备同步时也会跟着恢复",
                            fontSize = 11.sp,
                            color = colors.faint,
                            modifier = Modifier.padding(horizontal = 14.dp).padding(bottom = 8.dp),
                        )
                        deleted.forEachIndexed { index, r ->
                            if (index > 0) JxDivider(Modifier.padding(horizontal = 14.dp))
                            TrashRow(
                                record = r,
                                onRestore = { restoreId = r.id },
                                onPurge = { purgeId = r.id },
                            )
                        }
                    }
                }
            }
        }

        item(key = "bottom") { Spacer(Modifier.height(10.dp)) }
    }

    // ===== 删除确认 =====
    deleteId?.let { id ->
        JxConfirmDialog(
            title = "确定删除？",
            confirmText = "确定",
            confirmColor = colors.exp,
            onConfirm = {
                deleteId = null
                scope.launch { runCatching { repo.deleteRecord(id) } }
            },
            onDismiss = { deleteId = null },
        )
    }

    // ===== 恢复确认 =====
    restoreId?.let { id ->
        JxConfirmDialog(
            title = "恢复这条记录？",
            message = "恢复后将回到账单列表，其它设备同步后也会跟着恢复",
            confirmText = "恢复",
            confirmColor = colors.accent,
            onConfirm = {
                restoreId = null
                scope.launch {
                    runCatching { repo.restoreRecord(id) }
                    context.showToast("已恢复")
                }
            },
            onDismiss = { restoreId = null },
        )
    }

    // ===== 彻底删除确认 =====
    purgeId?.let { id ->
        JxConfirmDialog(
            title = "彻底删除？",
            message = "这笔账将从手机和所有设备上永久清除，无法恢复",
            confirmText = "彻底删除",
            confirmColor = colors.exp,
            onConfirm = {
                purgeId = null
                scope.launch {
                    runCatching { repo.purgeRecord(id) }
                    context.showToast("已彻底删除")
                }
            },
            onDismiss = { purgeId = null },
        )
    }

    // ===== 编辑弹窗 =====
    val form = edit
    if (form != null) {
        val formCat = editCategories.firstOrNull { it.key == form.catKey }
        JxDialog(title = "编辑记录", onDismiss = { edit = null }) {
            JxLabel("金额")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("¥", fontSize = 22.sp, fontWeight = FontWeight.Medium, color = colors.accent)
                Spacer(Modifier.width(8.dp))
                JxTextField(
                    value = form.amount,
                    onValueChange = { v -> edit = edit?.copy(amount = sanitizeAmountInput(v)) },
                    maxLength = AMOUNT_INPUT_MAX_LENGTH,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textSize = 22.sp,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            JxDivider()
            Spacer(Modifier.height(12.dp))

            JxLabel("日期")
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { editDatePicker = true }
                    .padding(vertical = 6.dp),
            ) {
                Text(form.date, fontSize = 15.sp, color = colors.text, modifier = Modifier.weight(1f))
                Text("›", fontSize = 18.sp, color = colors.faint)
            }

            Spacer(Modifier.height(10.dp))
            JxLabel("分类")
            Box {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { editCatMenuOpen = true }
                        .padding(vertical = 6.dp),
                ) {
                    Text(
                        formCat?.name ?: "选择一级分类",
                        fontSize = 15.sp,
                        color = if (formCat != null) colors.text else colors.faint,
                        modifier = Modifier.weight(1f),
                    )
                    Text("›", fontSize = 18.sp, color = colors.faint)
                }
                DropdownMenu(expanded = editCatMenuOpen, onDismissRequest = { editCatMenuOpen = false }) {
                    editCategories.forEach { c ->
                        DropdownMenuItem(
                            text = { Text(c.name, color = if (c.key == form.catKey) colors.accent else colors.text) },
                            onClick = {
                                if (c.key != form.catKey) edit = edit?.copy(catKey = c.key, subKey = "")
                                editCatMenuOpen = false
                            },
                        )
                    }
                }
            }
            if (formCat != null) {
                Spacer(Modifier.height(8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    formCat.subs.forEach { s ->
                        val selected = form.subKey == s.key
                        Text(
                            s.name,
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(if (selected) colors.accent else colors.soft)
                                .clickable { edit = edit?.copy(subKey = s.key) }
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                            fontSize = 12.sp,
                            color = if (selected) Color.White else colors.sub,
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            JxLabel("记录人")
            JxTextField(
                value = form.person,
                onValueChange = { v -> edit = edit?.copy(person = v) },
                placeholder = "可选：谁花的",
                maxLength = 10,
            )

            Spacer(Modifier.height(12.dp))
            JxLabel("备注")
            JxTextField(
                value = form.note,
                onValueChange = { v -> edit = edit?.copy(note = v) },
                maxLength = 200,
            )

            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.weight(1f))
                JxLink("取消", onClick = { edit = null }, color = colors.sub, size = 14.sp)
                JxLink("保存", onClick = {
                    val current = edit ?: return@JxLink
                    val parsed = parseAmountInput(current.amount)
                    if (!parsed.ok) {
                        context.showToast(parsed.message)
                        return@JxLink
                    }
                    val cat = editCategories.firstOrNull { it.key == current.catKey }
                    val sub = cat?.subs?.firstOrNull { it.key == current.subKey }
                    if (cat == null || sub == null) {
                        context.showToast("请选择二级分类")
                        return@JxLink
                    }
                    scope.launch {
                        runCatching {
                            repo.updateRecord(
                                current.id,
                                RecordUpdate(
                                    amount = parsed.value,
                                    categoryKey = cat.key,
                                    categoryName = cat.name,
                                    subcategoryKey = sub.key,
                                    subcategoryName = sub.name,
                                    note = current.note,
                                    date = current.date,
                                    person = current.person.trim(),
                                ),
                            )
                        }
                        edit = null
                        context.showToast("修改成功")
                    }
                }, size = 14.sp)
            }
        }
    }

    // ===== 编辑里的日期选择 =====
    if (editDatePicker && form != null) {
        val initial = runCatching { LocalDate.parse(form.date) }.getOrNull() ?: LocalDate.now()
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { editDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { millis ->
                        val d = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
                        edit = edit?.copy(date = localDateStr(d))
                    }
                    editDatePicker = false
                }) { Text("确定") }
            },
            dismissButton = {
                TextButton(onClick = { editDatePicker = false }) { Text("取消") }
            },
        ) {
            DatePicker(state = pickerState)
        }
    }
}

@Composable
private fun FilterCard(label: String, onClick: () -> Unit) {
    val colors = JiXuTheme.colors
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(colors.card)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 11.dp),
    ) {
        Text(label, fontSize = 13.sp, color = colors.text, modifier = Modifier.weight(1f))
        Text("▼", fontSize = 9.sp, color = colors.faint)
    }
}

@Composable
private fun RecordRow(record: RecordEntity, onEdit: () -> Unit, onDelete: () -> Unit) {
    val colors = JiXuTheme.colors
    JxCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    JxTag(record.categoryName)
                    JxTag(record.subcategoryName, fg = colors.sub, bg = colors.soft)
                    if (!record.photo.isNullOrEmpty()) {
                        JxTag("凭证", fg = colors.accent2, bg = colors.accentSoft)
                    }
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    record.date +
                        (if (record.person.isNotEmpty()) " · " + record.person else "") +
                        (if (record.note.isNotEmpty()) " " + record.note else ""),
                    fontSize = 11.sp,
                    color = colors.muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                JxAmount(record.amount, record.type)
                if (isSuspiciousAmount(record.amount)) {
                    Spacer(Modifier.height(4.dp))
                    JxTag("金额异常", fg = colors.exp, bg = colors.expSoft)
                }
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    JxLink("编辑", onClick = onEdit, size = 12.sp)
                    JxLink("删除", onClick = onDelete, color = colors.exp, size = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun TrashRow(record: RecordEntity, onRestore: () -> Unit, onPurge: () -> Unit) {
    val colors = JiXuTheme.colors
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 11.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                JxTag(record.categoryName)
                JxTag(record.subcategoryName, fg = colors.sub, bg = colors.soft)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                record.date +
                    (if (record.person.isNotEmpty()) " · " + record.person else "") +
                    (if (record.note.isNotEmpty()) " " + record.note else ""),
                fontSize = 11.sp,
                color = colors.muted,
                maxLines = 1,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                (if (record.type == "income") "+" else "-") + "¥" + formatMoneyExact(record.amount),
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = colors.muted,
                textDecoration = TextDecoration.LineThrough,
            )
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                JxLink("恢复", onClick = onRestore, color = colors.inc, size = 12.sp)
                JxLink("彻底删除", onClick = onPurge, color = colors.exp, size = 12.sp)
            }
        }
    }
}
