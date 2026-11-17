package com.jixu.app.ui.screens.savings

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.core.content.FileProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.AppContainer
import com.jixu.app.core.AMOUNT_INPUT_MAX_LENGTH
import com.jixu.app.core.formatMoneyExact
import com.jixu.app.core.jsNumberToString
import com.jixu.app.core.localDateStr
import com.jixu.app.core.parseAmountInput
import com.jixu.app.core.sanitizeAmountInput
import com.jixu.app.core.sumAmounts
import com.jixu.app.data.db.SavingsEntity
import com.jixu.app.export.ExcelExporter
import com.jixu.app.export.SavingsExportRow
import com.jixu.app.ui.screens.common.BConfirm
import com.jixu.app.ui.screens.common.BDialog
import com.jixu.app.ui.screens.common.BTextField
import com.jixu.app.ui.screens.common.BTopBar
import com.jixu.app.ui.screens.common.EmptyLine
import com.jixu.app.ui.screens.common.HLine
import com.jixu.app.ui.screens.common.HeroAmount
import com.jixu.app.ui.screens.common.MicroLabel
import com.jixu.app.ui.screens.common.MiniButton
import com.jixu.app.ui.screens.common.ModuleHeader
import com.jixu.app.ui.screens.common.Panel
import com.jixu.app.ui.screens.common.currentMonth
import com.jixu.app.ui.screens.common.dayName
import com.jixu.app.ui.screens.common.mmddDot
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.screens.common.todayStr
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.MonoFamily
import com.jixu.app.ui.theme.SansFamily
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

private const val MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/**
 * 存钱罐（需求评估-02）：完全独立的小账本。
 *
 * 注意：本页面不读取、不修改 records；存款金额也不参与首页收入/支出/结余和统计。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SavingsScreen(container: AppContainer, onBack: () -> Unit) {
    val c = JiXuTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = container.repository

    val savingsFlow = remember { repo.observeSavings() }
    val deletedFlow = remember { repo.observeDeletedSavings() }
    val savings by savingsFlow.collectAsStateWithLifecycle(emptyList())
    val deleted by deletedFlow.collectAsStateWithLifecycle(emptyList())
    val syncState by container.savingsSyncManager.state.collectAsStateWithLifecycle()

    var addDirection by remember { mutableStateOf<String?>(null) }
    var editTarget by remember { mutableStateOf<SavingsEntity?>(null) }
    var deleteTarget by remember { mutableStateOf<SavingsEntity?>(null) }
    var restoreTarget by remember { mutableStateOf<SavingsEntity?>(null) }
    var showDeleted by rememberSaveable { mutableStateOf(false) }
    var exportFile by remember { mutableStateOf<File?>(null) }
    var exportSheet by remember { mutableStateOf(false) }

    val saveDocument = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(MIME_XLSX),
    ) { uri ->
        val file = exportFile
        if (uri != null && file != null) {
            scope.launch {
                val ok = withContext(Dispatchers.IO) {
                    runCatching {
                        context.contentResolver.openOutputStream(uri)?.use { out ->
                            file.inputStream().use { input -> input.copyTo(out) }
                        } ?: error("无法写入")
                    }.isSuccess
                }
                context.showToast(if (ok) "已保存" else "保存失败")
            }
        }
        exportFile = null
    }

    val summary = remember(savings) {
        val month = currentMonth()
        val totalIn = sumAmounts(savings.filter { it.direction == "in" }.map { it.amount }.toDoubleArray())
        val totalOut = sumAmounts(savings.filter { it.direction == "out" }.map { it.amount }.toDoubleArray())
        val monthIn = sumAmounts(
            savings.filter { it.direction == "in" && it.date.startsWith(month) }.map { it.amount }.toDoubleArray(),
        )
        val monthOut = sumAmounts(
            savings.filter { it.direction == "out" && it.date.startsWith(month) }.map { it.amount }.toDoubleArray(),
        )
        val total = sumAmounts(
            savings.map { if (it.direction == "in") it.amount else -it.amount }.toDoubleArray(),
        )
        doubleArrayOf(total, totalIn, totalOut, monthIn, monthOut)
    }

    fun refreshSync() {
        scope.launch { runCatching { container.savingsSyncManager.syncNow(true) } }
    }

    fun afterWrite() {
        container.savingsSyncManager.pushSoon()
    }

    fun handleExport() {
        if (savings.isEmpty()) {
            context.showToast("无数据可导出")
            return
        }
        scope.launch {
            val rows = savings.map {
                SavingsExportRow(date = it.date, direction = it.direction, amount = it.amount, note = it.note)
            }
            val file = runCatching {
                ExcelExporter.writeSavings(
                    File(File(context.cacheDir, "exports"), "计序_存钱罐_${localDateStr()}.xlsx"),
                    rows,
                )
            }.getOrNull()
            if (file == null) {
                context.showToast("导出失败")
            } else {
                exportFile = file
                exportSheet = true
            }
        }
    }

    fun shareFile(file: File) {
        runCatching {
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file,
            )
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = MIME_XLSX
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = android.content.ClipData.newRawUri("计序存钱罐导出", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(intent)
            exportSheet = false
        }.onFailure { context.showToast("导出失败") }
    }

    // 进入页面先拉一次云端；和账单同步互不影响
    LaunchedEffect(Unit) {
        runCatching { container.savingsSyncManager.syncNow(false) }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        scope.launch { runCatching { container.savingsSyncManager.syncNow(false) } }
    }

    val total = summary[0]
    val totalIn = summary[1]
    val totalOut = summary[2]
    val monthIn = summary[3]
    val monthOut = summary[4]

    val syncLabel = when {
        syncState.syncing -> "同步中…"
        syncState.lastOk == true -> "已同步"
        syncState.lastOk == false -> "仅本机"
        else -> "待同步"
    }

    Column(Modifier.fillMaxSize()) {
        BTopBar(title = "存钱罐", en = "SAVINGS · $syncLabel", onBack = onBack) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MiniButton("导出", onClick = { handleExport() }, height = 30.dp)
                Spacer(Modifier.width(8.dp))
                MiniButton("同步", onClick = { refreshSync() }, height = 30.dp)
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

            Panel {
                ModuleHeader(id = "V-01", title = "当前存款", en = "TOTAL") {
                    Text(
                        "不参与首页结余",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 10.5.sp, color = c.fnt),
                    )
                }
                Spacer(Modifier.height(14.dp))
                HeroAmount(total, intSize = 48.sp)
                Spacer(Modifier.height(14.dp))
                HLine()
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth()) {
                    Readout("累计存入", "IN", totalIn, Modifier.weight(1f))
                    Box(Modifier.width(1.dp).height(30.dp).background(c.ln))
                    Readout("累计取出", "OUT", totalOut, Modifier.weight(1f).padding(start = 12.dp))
                    Box(Modifier.width(1.dp).height(30.dp).background(c.ln))
                    Readout("本月存入", "THIS MONTH", monthIn, Modifier.weight(1f).padding(start = 12.dp))
                }
                if (monthOut > 0) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "本月取出 ¥${formatMoneyExact(monthOut)}",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.dim),
                    )
                }
            }

            if (syncState.lastOk == false) {
                Spacer(Modifier.height(8.dp))
                Panel(flat = true, contentPadding = PaddingValues(12.dp)) {
                    Text(
                        "云同步暂时不可用：存钱记录先保存在本机，联网或创建 savings 云集合后会自动补传。",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 11.5.sp, lineHeight = 18.sp, color = c.dim),
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                MiniButton(
                    "+ 存一笔",
                    onClick = { addDirection = "in" },
                    primary = true,
                    modifier = Modifier.weight(1f),
                    height = 40.dp,
                )
                MiniButton(
                    "− 取一笔",
                    onClick = {
                        if (total > 0.004) addDirection = "out"
                        else context.showToast("还没有存款，先存一笔吧")
                    },
                    modifier = Modifier.weight(1f),
                    height = 40.dp,
                )
            }

            Spacer(Modifier.height(10.dp))

            Panel(contentPadding = PaddingValues(0.dp)) {
                Row(
                    modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ModuleHeader(id = "V-02", title = "存钱记录", en = "HISTORY") {
                        Text(
                            "共 ${savings.size} 笔",
                            style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.dim),
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                if (savings.isEmpty()) {
                    EmptyLine("还没有存钱记录，点「存一笔」开始吧")
                } else {
                    savings.forEachIndexed { index, item ->
                        if (index > 0) HLine(Modifier.padding(horizontal = 16.dp))
                        SavingRow(
                            item = item,
                            onClick = { editTarget = item },
                            onDelete = { deleteTarget = item },
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
            }

            if (deleted.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Panel(contentPadding = PaddingValues(0.dp)) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showDeleted = !showDeleted }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "已删除 (${deleted.size})",
                            style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.dim),
                        )
                        Spacer(Modifier.weight(1f))
                        Text(
                            if (showDeleted) "收起 ▴" else "展开 ▾",
                            style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.fnt),
                        )
                    }
                    if (showDeleted) {
                        deleted.forEachIndexed { index, item ->
                            if (index > 0) HLine(Modifier.padding(horizontal = 16.dp))
                            DeletedSavingRow(item, onRestore = { restoreTarget = item })
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }

    addDirection?.let { direction ->
        SavingEditDialog(
            title = if (direction == "in") "存一笔" else "取一笔",
            en = if (direction == "in") "DEPOSIT" else "WITHDRAW",
            direction = direction,
            initial = null,
            maxOut = total,
            onDismiss = { addDirection = null },
            onSave = { amount, date, note ->
                scope.launch {
                    repo.addSaving(direction, amount, date, note)
                    context.showToast(if (direction == "in") "已存入 ¥${formatMoneyExact(amount)}" else "已取出 ¥${formatMoneyExact(amount)}")
                    addDirection = null
                    afterWrite()
                }
            },
        )
    }

    editTarget?.let { target ->
        val maxOut = total + if (target.direction == "out") target.amount else 0.0
        SavingEditDialog(
            title = "编辑存款记录",
            en = "EDIT",
            direction = target.direction,
            initial = target,
            maxOut = maxOut,
            onDismiss = { editTarget = null },
            onSave = { amount, date, note ->
                scope.launch {
                    repo.updateSaving(target.id, amount, date, note)
                    context.showToast("已修改")
                    editTarget = null
                    afterWrite()
                }
            },
        )
    }

    deleteTarget?.let { target ->
        BConfirm(
            title = "确定删除？",
            message = "删除后这笔存钱记录会移到「已删除」，可以恢复；不会影响任何账单。",
            confirmText = "删除",
            onDismiss = { deleteTarget = null },
            onConfirm = {
                deleteTarget = null
                scope.launch {
                    repo.deleteSaving(target.id)
                    context.showToast("已删除，可在下方恢复")
                    afterWrite()
                }
            },
        )
    }

    restoreTarget?.let { target ->
        BConfirm(
            title = "恢复这条存钱记录？",
            message = "恢复后会重新计入存钱罐总额。",
            confirmText = "恢复",
            danger = false,
            onDismiss = { restoreTarget = null },
            onConfirm = {
                restoreTarget = null
                scope.launch {
                    repo.restoreSaving(target.id)
                    context.showToast("已恢复")
                    afterWrite()
                }
            },
        )
    }

    val file = exportFile
    if (exportSheet && file != null) {
        ModalBottomSheet(
            onDismissRequest = { exportSheet = false },
            containerColor = c.p1,
        ) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp)
                    .padding(bottom = 26.dp),
            ) {
                MicroLabel("导出 · EXPORT", color = c.fnt)
                Text(
                    "导出存钱记录",
                    style = TextStyle(fontFamily = SansFamily, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = c.tx),
                    modifier = Modifier.padding(top = 6.dp),
                )
                Text(
                    file.name,
                    style = TextStyle(fontFamily = MonoFamily, fontSize = 10.5.sp, color = c.dim),
                    modifier = Modifier.padding(top = 4.dp),
                )
                Spacer(Modifier.height(12.dp))
                HLine()
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { shareFile(file) }
                        .padding(vertical = 15.dp),
                ) {
                    Text(
                        "发送给微信好友 / 其他应用",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 14.sp, color = c.tx),
                    )
                }
                HLine()
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            exportSheet = false
                            saveDocument.launch(file.name)
                        }
                        .padding(vertical = 15.dp),
                ) {
                    Text(
                        "保存到手机",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 14.sp, color = c.tx),
                    )
                }
            }
        }
    }
}

@Composable
private fun Readout(label: String, en: String, amount: Double, modifier: Modifier = Modifier) {
    val c = JiXuTheme.colors
    Column(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = TextStyle(fontFamily = SansFamily, fontSize = 10.5.sp, color = c.dim))
            MicroLabel(en, modifier = Modifier.padding(start = 4.dp), color = c.fnt)
        }
        Spacer(Modifier.height(5.dp))
        Text(
            "¥" + formatMoneyExact(amount),
            style = TextStyle(fontFamily = MonoFamily, fontSize = 13.sp, color = c.tx),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun SavingRow(
    item: SavingsEntity,
    onClick: () -> Unit,
    onDelete: () -> Unit,
) {
    val c = JiXuTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                if (item.direction == "in") "存入" else "取出",
                style = TextStyle(fontFamily = SansFamily, fontSize = 13.sp, color = c.tx),
            )
            Spacer(Modifier.height(3.dp))
            Text(
                "${mmddDot(item.date)} · ${item.note.ifEmpty { "现金" }}",
                style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.dim),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            (if (item.direction == "in") "+" else "−") + "¥" + formatMoneyExact(item.amount),
            style = TextStyle(
                fontFamily = MonoFamily,
                fontSize = 15.sp,
                color = if (item.direction == "in") c.tx else c.dim,
            ),
            maxLines = 1,
        )
        Text(
            "删除",
            style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.cor),
            modifier = Modifier
                .clickable(onClick = onDelete)
                .padding(start = 14.dp, top = 6.dp, bottom = 6.dp, end = 2.dp),
        )
    }
}

@Composable
private fun DeletedSavingRow(item: SavingsEntity, onRestore: () -> Unit) {
    val c = JiXuTheme.colors
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                (if (item.direction == "in") "存入 " else "取出 ") + "¥" + formatMoneyExact(item.amount),
                style = TextStyle(
                    fontFamily = MonoFamily,
                    fontSize = 13.sp,
                    color = c.dim,
                    textDecoration = TextDecoration.LineThrough,
                ),
            )
            Spacer(Modifier.height(3.dp))
            Text(
                "${mmddDot(item.date)} · ${item.note.ifEmpty { "现金" }}",
                style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.fnt),
                maxLines = 1,
            )
        }
        MiniButton("恢复", onClick = onRestore, height = 30.dp)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SavingEditDialog(
    title: String,
    en: String,
    direction: String,
    initial: SavingsEntity?,
    maxOut: Double,
    onDismiss: () -> Unit,
    onSave: (amount: Double, date: String, note: String) -> Unit,
) {
    val c = JiXuTheme.colors
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current

    var amount by rememberSaveable(initial?.id, direction) {
        mutableStateOf(initial?.let { jsNumberToString(it.amount) } ?: "")
    }
    var date by rememberSaveable(initial?.id, direction) {
        mutableStateOf(initial?.date ?: todayStr())
    }
    var note by rememberSaveable(initial?.id, direction) {
        mutableStateOf(initial?.note ?: "")
    }
    var showDatePicker by remember { mutableStateOf(false) }

    fun submit() {
        val parsed = parseAmountInput(amount)
        if (!parsed.ok) {
            context.showToast(parsed.message)
            return
        }
        if (direction == "out" && parsed.value > maxOut + 0.004) {
            context.showToast("取钱金额不能大于存款总额")
            return
        }
        focusManager.clearFocus()
        onSave(parsed.value, date, note)
    }

    BDialog(title = title, en = en, onDismiss = onDismiss) {
        MicroLabel("金额 · AMOUNT", color = c.fnt)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("¥", style = TextStyle(fontFamily = MonoFamily, fontSize = 18.sp, color = c.dim))
            Spacer(Modifier.width(8.dp))
            BTextField(
                value = amount,
                onValueChange = { amount = sanitizeAmountInput(it) },
                placeholder = "输入金额",
                maxLength = AMOUNT_INPUT_MAX_LENGTH,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                textSize = 24.sp,
                mono = true,
                modifier = Modifier.weight(1f),
            )
        }
        HLine(Modifier.padding(top = 6.dp))

        Spacer(Modifier.height(14.dp))
        MicroLabel("日期 · DATE", color = c.fnt)
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
                dayName(date) + " " + mmddDot(date),
                style = TextStyle(fontFamily = MonoFamily, fontSize = 13.sp, color = c.tx),
                modifier = Modifier.weight(1f),
            )
            Text("›", style = TextStyle(fontFamily = MonoFamily, fontSize = 14.sp, color = c.fnt))
        }
        HLine()

        Spacer(Modifier.height(14.dp))
        MicroLabel("备注 · NOTE（可选）", color = c.fnt)
        BTextField(
            value = note,
            onValueChange = { note = it },
            placeholder = "如：给妈妈保管、放在抽屉",
            maxLength = 50,
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
            MiniButton("取消", onClick = onDismiss)
            MiniButton("保存", onClick = { submit() }, primary = true)
        }
    }

    if (showDatePicker) {
        val initialDate = runCatching { LocalDate.parse(date) }.getOrNull() ?: LocalDate.now()
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = initialDate.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let {
                        date = localDateStr(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate())
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
}
