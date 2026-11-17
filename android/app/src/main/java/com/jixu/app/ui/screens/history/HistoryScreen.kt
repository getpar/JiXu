package com.jixu.app.ui.screens.history

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
import com.jixu.app.export.ExcelExporter
import com.jixu.app.export.ExportRow
import com.jixu.app.ui.screens.common.BConfirm
import com.jixu.app.ui.screens.common.BDialog
import com.jixu.app.ui.screens.common.BTextField
import com.jixu.app.ui.screens.common.Chip
import com.jixu.app.ui.screens.common.DayHeader
import com.jixu.app.ui.screens.common.EmptyLine
import com.jixu.app.ui.screens.common.HLine
import com.jixu.app.ui.screens.common.MicroLabel
import com.jixu.app.ui.screens.common.MiniButton
import com.jixu.app.ui.screens.common.ModuleHeader
import com.jixu.app.ui.screens.common.Panel
import com.jixu.app.ui.screens.common.PhotoPreviewDialog
import com.jixu.app.ui.screens.common.RowItem
import com.jixu.app.ui.screens.common.Seg
import com.jixu.app.ui.screens.common.SwipeAction
import com.jixu.app.ui.screens.common.SwipeRow
import com.jixu.app.ui.screens.common.mmddDot
import com.jixu.app.ui.screens.common.monthDot
import com.jixu.app.ui.screens.common.monthOptions
import com.jixu.app.ui.screens.common.showToast
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
import java.time.YearMonth
import kotlin.math.min

/** 统计页下钻带给账单页的筛选（§8.3-3） */
data class HistoryDrillDown(val month: String, val catKey: String?, val catName: String?)

private const val PAGE_SIZE = 50

private const val MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

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
 * 账单（开发文档 §8.3）：筛选条 + 按日分组 + 左滑编辑/删除 + 回收站 + 导出。
 * 数据与写操作与旧版一致，只是排版换成 B 的表格语言。
 */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    container: AppContainer,
    drillDown: HistoryDrillDown?,
    onDrillDownConsumed: () -> Unit,
) {
    val c = JiXuTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = container.repository
    // Flow 必须 remember：每次重组新建 Flow 会让 collectAsStateWithLifecycle 反复重启收集，
    // 页面从后台/系统分享返回时可能一直停在初始空列表
    val aliveFlow = remember { repo.observeAliveRecords() }
    val deletedFlow = remember { repo.observeDeletedRecords() }
    val alive by aliveFlow.collectAsStateWithLifecycle(emptyList())
    val deleted by deletedFlow.collectAsStateWithLifecycle(emptyList())

    var month by rememberSaveable { mutableStateOf("") }
    var type by rememberSaveable { mutableStateOf("") }
    var keyword by rememberSaveable { mutableStateOf("") }
    var catKey by rememberSaveable { mutableStateOf("") }
    var catName by rememberSaveable { mutableStateOf("") }
    var shown by remember { mutableIntStateOf(PAGE_SIZE) }
    var trashOpen by rememberSaveable { mutableStateOf(false) }
    var edit by remember { mutableStateOf<EditForm?>(null) }
    var editDatePicker by remember { mutableStateOf(false) }
    var deleteId by remember { mutableStateOf<String?>(null) }
    var restoreId by remember { mutableStateOf<String?>(null) }
    var purgeId by remember { mutableStateOf<String?>(null) }
    var editCategories by remember { mutableStateOf<List<CategoryGroup>>(emptyList()) }
    var exportFile by remember { mutableStateOf<File?>(null) }
    var exportSheet by remember { mutableStateOf(false) }
    var photoPreview by remember { mutableStateOf<String?>(null) }

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

    // 分组（保持原有顺序）
    val groups = remember(filtered, shown) {
        val visible = filtered.take(shown)
        val m = LinkedHashMap<String, MutableList<RecordEntity>>()
        visible.forEach { r -> m.getOrPut(r.date) { mutableListOf() }.add(r) }
        m.map { (d, list) ->
            val exp = sumAmounts(list.filter { it.type == "expense" }.map { it.amount }.toDoubleArray())
            val inc = sumAmounts(list.filter { it.type == "income" }.map { it.amount }.toDoubleArray())
            Triple(d, list, exp to inc)
        }
    }

    // 分类筹码：当前月份/类型下的分类计数（最多 8 个）
    val catChips = remember(alive, month, type) {
        val cnt = LinkedHashMap<String, Pair<String, Int>>()
        for (r in alive) {
            if (month.isNotEmpty() && !r.date.startsWith(month)) continue
            if (type.isNotEmpty() && r.type != type) continue
            if (r.categoryKey.isEmpty()) continue
            val prev = cnt[r.categoryKey]
            cnt[r.categoryKey] = r.categoryName to ((prev?.second ?: 0) + 1)
        }
        cnt.entries.sortedByDescending { it.value.second }.take(8)
            .map { it.key to (it.value.first to it.value.second) }
    }

    /** §11：导出当前筛选结果，行序同列表 */
    fun handleExport() {
        if (filtered.isEmpty()) {
            context.showToast("无数据可导出")
            return
        }
        scope.launch {
            val rows = filtered.map {
                ExportRow(
                    date = it.date,
                    type = it.type,
                    categoryName = it.categoryName,
                    subcategoryName = it.subcategoryName,
                    amount = it.amount,
                    person = it.person,
                    note = it.note,
                )
            }
            val file = runCatching {
                ExcelExporter.write(
                    File(File(context.cacheDir, "exports"), "计序_${localDateStr()}.xlsx"),
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
                this.type = MIME_XLSX // 必须显式 this：局部筛选变量 type 会遮蔽 Intent.type
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = android.content.ClipData.newRawUri("计序导出", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            // 不包 createChooser：部分国产 ROM 的 ChooserActivity 会过滤掉微信等目标（实测小米）
            context.startActivity(intent)
            exportSheet = false
        }.onFailure { context.showToast("导出失败") }
    }

    LaunchedEffect(month, type, keyword, catKey) { shown = PAGE_SIZE }

    Column(Modifier.fillMaxSize().imePadding()) {
        // ===== 顶栏 =====
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    "账单",
                    style = TextStyle(fontFamily = SansFamily, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = c.tx),
                )
                MicroLabel("03 · LOG", modifier = Modifier.padding(top = 3.dp), color = c.dim)
            }
            Text(
                "${filtered.size} 条 · 支出 ¥${formatMoney(expenseSum, 0)}",
                style = TextStyle(fontFamily = MonoFamily, fontSize = 10.5.sp, color = c.dim),
            )
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 16.dp),
        ) {
            // ===== 筛选面板 =====
            item(key = "filters") {
                Panel(contentPadding = PaddingValues(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .height(38.dp)
                                .border(1.dp, c.ln2)
                                .padding(horizontal = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "⌕",
                                style = TextStyle(fontFamily = MonoFamily, fontSize = 13.sp, color = c.fnt),
                                modifier = Modifier.padding(end = 8.dp),
                            )
                            BTextField(
                                value = keyword,
                                onValueChange = { keyword = it },
                                placeholder = "搜索备注或分类",
                                textSize = 12.5.sp,
                                modifier = Modifier.weight(1f),
                            )
                            if (keyword.isNotEmpty()) {
                                Text(
                                    "✕",
                                    style = TextStyle(fontFamily = MonoFamily, fontSize = 12.sp, color = c.dim),
                                    modifier = Modifier
                                        .clickable { keyword = "" }
                                        .padding(horizontal = 4.dp),
                                )
                            }
                        }
                        Spacer(Modifier.width(8.dp))
                        Seg(
                            options = listOf("" to "全部", "expense" to "支出", "income" to "收入"),
                            selected = type,
                            onSelect = { type = it },
                            modifier = Modifier.width(148.dp),
                            height = 34.dp,
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    // 月份筹码
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Chip("全部月份", selected = month.isEmpty(), onClick = { month = "" })
                        monthOptions().forEach { m ->
                            Chip(
                                monthChipLabel(m),
                                selected = month == m,
                                onClick = { month = if (month == m) "" else m },
                            )
                        }
                    }
                    if (catChips.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Chip(
                                "全部分类",
                                selected = catKey.isEmpty(),
                                onClick = {
                                    catKey = ""
                                    catName = ""
                                },
                            )
                            catChips.forEach { (key, pair) ->
                                Chip(
                                    pair.first,
                                    selected = catKey == key,
                                    count = pair.second.toString(),
                                    onClick = {
                                        if (catKey == key) {
                                            catKey = ""
                                            catName = ""
                                        } else {
                                            catKey = key
                                            catName = pair.first
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
            }

            // ===== 汇总行 =====
            item(key = "summary") {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "支出 ¥${formatMoney(expenseSum)}",
                        style = TextStyle(fontFamily = MonoFamily, fontSize = 11.sp, color = c.cor),
                    )
                    Text(
                        "收入 ¥${formatMoney(incomeSum)}",
                        style = TextStyle(fontFamily = MonoFamily, fontSize = 11.sp, color = c.inc),
                        modifier = Modifier.padding(start = 12.dp),
                    )
                    if (catKey.isNotEmpty()) {
                        Text(
                            "分类：$catName ✕",
                            style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.ac),
                            modifier = Modifier
                                .padding(start = 12.dp)
                                .clickable {
                                    catKey = ""
                                    catName = ""
                                },
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    Text(
                        "导出 Excel",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 11.5.sp, color = c.dim),
                        modifier = Modifier
                            .clickable { handleExport() }
                            .padding(vertical = 6.dp, horizontal = 2.dp),
                    )
                }
            }

            // ===== 记录（按日分组） =====
            if (groups.isEmpty()) {
                item(key = "empty") {
                    Panel {
                        ModuleHeader(id = "L-01", title = "账单", en = "LOG")
                        EmptyLine("暂无记录")
                    }
                }
            } else {
                groups.forEachIndexed { gi, (date, list, sums) ->
                    item(key = "dh-$date") {
                        Spacer(Modifier.height(if (gi == 0) 6.dp else 10.dp))
                        DayHeader(
                            date = date,
                            count = list.size,
                            expense = sums.first,
                            income = sums.second,
                        )
                    }
                    items(items = list, key = { it.id }) { r ->
                        Box(Modifier.background(c.p1)) {
                            SwipeRow(
                                actions = {
                                    SwipeAction(
                                        "编辑",
                                        onClick = {
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
                                        modifier = Modifier.weight(1f),
                                    )
                                    SwipeAction(
                                        "删除",
                                        onClick = { deleteId = r.id },
                                        danger = true,
                                        modifier = Modifier.weight(1f),
                                    )
                                },
                            ) {
                                Column(Modifier.background(c.p1)) {
                                    RowItem(
                                        title = r.subcategoryName.ifEmpty { r.categoryName },
                                        sub = r.note,
                                        meta = listOfNotNull(
                                            r.person.takeIf { it.isNotEmpty() },
                                            mmddDot(r.date),
                                            "小票".takeIf { !r.photo.isNullOrEmpty() },
                                        ).joinToString(" · "),
                                        amount = r.amount,
                                        income = r.type == "income",
                                        iconKey = r.categoryKey,
                                        modifier = Modifier.padding(horizontal = 12.dp),
                                    ) {
                                        if (!r.photo.isNullOrEmpty()) {
                                            Text(
                                                "凭证",
                                                style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.ac),
                                                modifier = Modifier
                                                    .padding(start = 8.dp, top = 3.dp)
                                                    .clickable { photoPreview = r.photo },
                                            )
                                        }
                                        if (isSuspiciousAmount(r.amount)) {
                                            Text(
                                                "!",
                                                style = TextStyle(
                                                    fontFamily = MonoFamily,
                                                    fontSize = 11.sp,
                                                    color = c.cor,
                                                ),
                                                modifier = Modifier.padding(start = 6.dp, top = 2.dp),
                                            )
                                        }
                                    }
                                    HLine(Modifier.padding(horizontal = 12.dp))
                                }
                            }
                        }
                    }
                }
            }

            // ===== 分页 =====
            if (filtered.size > shown) {
                item(key = "more-$shown") {
                    LaunchedEffect(filtered.size, shown) {
                        shown = min(shown + PAGE_SIZE, filtered.size)
                    }
                    Box(
                        Modifier.fillMaxWidth().padding(vertical = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        MicroLabel("上滑加载更多 · $shown / ${filtered.size}", color = c.fnt)
                    }
                }
            }

            // ===== 回收站 =====
            if (deleted.isNotEmpty()) {
                item(key = "trash") {
                    Spacer(Modifier.height(10.dp))
                    Panel(contentPadding = PaddingValues(0.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { trashOpen = !trashOpen }
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                        ) {
                            Text(
                                "已删除 · TRASH (${deleted.size})",
                                style = TextStyle(fontFamily = SansFamily, fontSize = 12.5.sp, color = c.dim),
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                if (trashOpen) "收起 ▴" else "展开 ▾",
                                style = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, color = c.fnt),
                            )
                        }
                        if (trashOpen) {
                            Text(
                                "误删的账可以恢复，恢复后其它设备同步时也会跟着恢复",
                                style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.fnt),
                                modifier = Modifier.padding(horizontal = 14.dp).padding(bottom = 8.dp),
                            )
                            deleted.forEachIndexed { index, r ->
                                if (index > 0) HLine(Modifier.padding(horizontal = 14.dp))
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

            item(key = "bottom") { Spacer(Modifier.height(8.dp)) }
        }
    }

    // ===== 删除确认 =====
    deleteId?.let { id ->
        BConfirm(
            title = "确定删除？",
            message = "删除后进入回收站，可再恢复",
            confirmText = "删除",
            onConfirm = {
                deleteId = null
                scope.launch { runCatching { repo.deleteRecord(id) } }
            },
            onDismiss = { deleteId = null },
        )
    }

    // ===== 恢复确认 =====
    restoreId?.let { id ->
        BConfirm(
            title = "恢复这条记录？",
            message = "恢复后将回到账单列表，其它设备同步后也会跟着恢复",
            confirmText = "恢复",
            danger = false,
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
        BConfirm(
            title = "彻底删除？",
            message = "这笔账将从手机和所有设备上永久清除，无法恢复",
            confirmText = "彻底删除",
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
        BDialog(title = "编辑记录", en = "EDIT", onDismiss = { edit = null }) {
            MicroLabel("金额 · AMOUNT", color = c.fnt)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("¥", style = TextStyle(fontFamily = MonoFamily, fontSize = 18.sp, color = c.dim))
                Spacer(Modifier.width(8.dp))
                BTextField(
                    value = form.amount,
                    onValueChange = { v -> edit = edit?.copy(amount = sanitizeAmountInput(v)) },
                    maxLength = AMOUNT_INPUT_MAX_LENGTH,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textSize = 22.sp,
                    mono = true,
                    modifier = Modifier.weight(1f),
                )
            }
            HLine(Modifier.padding(top = 6.dp))
            Spacer(Modifier.height(12.dp))

            MicroLabel("日期 · DATE", color = c.fnt)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { editDatePicker = true }
                    .padding(vertical = 10.dp),
            ) {
                Text(
                    form.date,
                    style = TextStyle(fontFamily = MonoFamily, fontSize = 13.sp, color = c.tx),
                    modifier = Modifier.weight(1f),
                )
                Text("›", style = TextStyle(fontFamily = MonoFamily, fontSize = 14.sp, color = c.fnt))
            }
            HLine()

            Spacer(Modifier.height(12.dp))
            MicroLabel("分类 · CATEGORY", color = c.fnt)
            FlowRow(
                modifier = Modifier.padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                editCategories.forEach { cat ->
                    Chip(
                        cat.name,
                        selected = form.catKey == cat.key,
                        onClick = {
                            if (form.catKey != cat.key) edit = edit?.copy(catKey = cat.key, subKey = "")
                        },
                    )
                }
            }
            if (formCat != null) {
                Spacer(Modifier.height(8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    formCat.subs.forEach { s ->
                        Chip(
                            s.name,
                            selected = form.subKey == s.key,
                            onClick = { edit = edit?.copy(subKey = s.key) },
                        )
                    }
                }
            }

            Spacer(Modifier.height(14.dp))
            MicroLabel("记录人 · WHO", color = c.fnt)
            BTextField(
                value = form.person,
                onValueChange = { v -> edit = edit?.copy(person = v) },
                placeholder = "可选：谁花的",
                maxLength = 10,
                textSize = 13.sp,
                modifier = Modifier.padding(top = 6.dp),
            )
            HLine(Modifier.padding(top = 6.dp))

            Spacer(Modifier.height(12.dp))
            MicroLabel("备注 · NOTE", color = c.fnt)
            BTextField(
                value = form.note,
                onValueChange = { v -> edit = edit?.copy(note = v) },
                maxLength = 200,
                textSize = 13.sp,
                modifier = Modifier.padding(top = 6.dp),
            )
            HLine(Modifier.padding(top = 6.dp))

            Spacer(Modifier.height(16.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Spacer(Modifier.weight(1f))
                MiniButton("取消", onClick = { edit = null })
                MiniButton("保存", onClick = {
                    val current = edit ?: return@MiniButton
                    val parsed = parseAmountInput(current.amount)
                    if (!parsed.ok) {
                        context.showToast(parsed.message)
                        return@MiniButton
                    }
                    val cat = editCategories.firstOrNull { it.key == current.catKey }
                    val sub = cat?.subs?.firstOrNull { it.key == current.subKey }
                    if (cat == null || sub == null) {
                        context.showToast("请选择二级分类")
                        return@MiniButton
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
                }, primary = true)
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

    // ===== 导出选项（§11：底部选项） =====
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
                    "导出 Excel",
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

    // ===== 小票大图（§12） =====
    photoPreview?.let { path ->
        PhotoPreviewDialog(path = path, onDismiss = { photoPreview = null })
    }
}

private fun monthChipLabel(month: String): String {
    val ym = runCatching { YearMonth.parse(month) }.getOrNull() ?: return month
    return "${ym.monthValue}月"
}

@Composable
private fun TrashRow(record: RecordEntity, onRestore: () -> Unit, onPurge: () -> Unit) {
    val c = JiXuTheme.colors
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                "${record.categoryName} · ${record.subcategoryName}",
                style = TextStyle(fontFamily = SansFamily, fontSize = 12.5.sp, color = c.dim),
                maxLines = 1,
            )
            Text(
                record.date + (if (record.person.isNotEmpty()) " · " + record.person else ""),
                style = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, color = c.fnt),
                maxLines = 1,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
        Text(
            (if (record.type == "income") "+" else "-") + "¥" + formatMoneyExact(record.amount),
            style = TextStyle(
                fontFamily = MonoFamily,
                fontSize = 12.5.sp,
                color = c.dim,
                textDecoration = TextDecoration.LineThrough,
            ),
        )
        Spacer(Modifier.width(10.dp))
        MiniButton("恢复", onClick = onRestore, height = 30.dp)
        Spacer(Modifier.width(6.dp))
        MiniButton("彻底删除", onClick = onPurge, danger = true, height = 30.dp)
    }
}
