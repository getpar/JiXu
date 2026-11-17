package com.jixu.app.ui.screens.add

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.AppContainer
import com.jixu.app.core.AMOUNT_INPUT_MAX_LENGTH
import com.jixu.app.core.CategoryGroup
import com.jixu.app.core.formatMoneyExact
import com.jixu.app.core.jsNumberToString
import com.jixu.app.core.localDateStr
import com.jixu.app.core.parseAmountInput
import com.jixu.app.core.sanitizeAmountInput
import com.jixu.app.data.NewRecord
import com.jixu.app.data.db.RecordEntity
import com.jixu.app.ui.screens.common.BDialog
import com.jixu.app.ui.screens.common.BTextField
import com.jixu.app.ui.screens.common.BiLabel
import com.jixu.app.ui.screens.common.Chip
import com.jixu.app.ui.screens.common.Ease
import com.jixu.app.ui.screens.common.HLine
import com.jixu.app.ui.screens.common.Keypad
import com.jixu.app.ui.screens.common.MicroLabel
import com.jixu.app.ui.screens.common.MiniButton
import com.jixu.app.ui.screens.common.ModuleHeader
import com.jixu.app.ui.screens.common.Panel
import com.jixu.app.ui.screens.common.PhotoPreviewDialog
import com.jixu.app.ui.screens.common.PhotoThumb
import com.jixu.app.ui.screens.common.Seg
import com.jixu.app.ui.screens.common.UndoToast
import com.jixu.app.ui.screens.common.categoryIcon
import com.jixu.app.ui.screens.common.dayName
import com.jixu.app.ui.screens.common.mmddDot
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.screens.common.todayStr
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.MonoFamily
import com.jixu.app.ui.theme.SansFamily
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.util.Locale
import kotlin.math.ceil

private data class AddSnapshot(
    val type: String,
    val amount: Double,
    val catKey: String,
    val subKey: String,
    val note: String,
    val person: String,
    val date: String,
    val photo: String,
)

private data class UndoState(val id: String, val label: String, val snapshot: AddSnapshot)

/**
 * 记一笔（开发文档 §8.2）：A-01 金额数码管 / A-02 分类 / A-03 详情 + 底部键盘。
 * 业务逻辑（校验、保存、撤销、照片、跨零点换日期）与旧版完全一致。
 */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun AddScreen(container: AppContainer) {
    val c = JiXuTheme.colors
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val repo = container.repository
    val recordsFlow = remember { repo.observeAliveRecords() }
    val records by recordsFlow.collectAsStateWithLifecycle(emptyList())

    var type by rememberSaveable { mutableStateOf("expense") }
    var amount by rememberSaveable { mutableStateOf("") }
    var date by rememberSaveable { mutableStateOf(todayStr()) }
    var catKey by rememberSaveable { mutableStateOf("") }
    var subKey by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    var person by rememberSaveable { mutableStateOf("") }
    var photo by rememberSaveable { mutableStateOf("") }
    var autoDate by rememberSaveable { mutableStateOf(todayStr()) }
    var cats by remember { mutableStateOf<List<CategoryGroup>>(emptyList()) }
    var showDatePicker by remember { mutableStateOf(false) }
    var undo by remember { mutableStateOf<UndoState?>(null) }
    var undoRemain by remember { mutableIntStateOf(5) }
    var cameraFile by remember { mutableStateOf<File?>(null) }
    var showPhotoSheet by remember { mutableStateOf(false) }
    var photoPreview by remember { mutableStateOf(false) }

    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val file = cameraFile
        cameraFile = null
        if (ok && file != null) {
            scope.launch {
                val saved = runCatching { container.photos.saveFromUri(Uri.fromFile(file)) }.getOrNull()
                file.delete()
                if (saved != null) photo = saved else context.showToast("照片保存失败")
            }
        } else {
            file?.delete()
        }
    }
    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            scope.launch {
                val saved = runCatching { container.photos.saveFromUri(uri) }.getOrNull()
                if (saved != null) photo = saved else context.showToast("照片保存失败")
            }
        }
    }

    // v0.9.6：每次回到本页重读分类；停在本页跨过零点且没手动改日期时换成新的今天
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        scope.launch {
            cats = runCatching { repo.getMergedCategories() }.getOrDefault(emptyList())
        }
        val t = todayStr()
        if (t != autoDate) {
            val prev = autoDate
            autoDate = t
            if (date == prev) date = t
        }
    }

    // 撤销条倒计时按截止时刻算，切后台不漂移
    LaunchedEffect(undo?.id) {
        val current = undo ?: return@LaunchedEffect
        val deadline = System.currentTimeMillis() + 5000
        while (true) {
            val left = deadline - System.currentTimeMillis()
            if (left <= 0) {
                undo = null
                break
            }
            undoRemain = ceil(left / 1000.0).toInt()
            delay(200)
        }
    }

    val currentCat = cats.firstOrNull { it.key == catKey }
    val subs = currentCat?.subs ?: emptyList()

    // 常用分类/记录人（按使用次数倒序；次数相同保持原有顺序）
    val catCount = remember(records, type) {
        val cc = LinkedHashMap<String, Int>()
        for (r in records) {
            if (r.type != type) continue
            cc[r.categoryKey] = (cc[r.categoryKey] ?: 0) + 1
        }
        cc
    }
    val subCount = remember(records, type) {
        val sc = LinkedHashMap<String, Int>()
        for (r in records) {
            if (r.type != type) continue
            sc[r.subcategoryKey] = (sc[r.subcategoryKey] ?: 0) + 1
        }
        sc
    }
    val freqCats = remember(catCount, cats) {
        catCount.entries
            .sortedByDescending { it.value }
            .take(4)
            .mapNotNull { e -> cats.firstOrNull { it.key == e.key } }
    }
    val subsSorted = remember(subs, subCount) {
        subs.sortedByDescending { subCount[it.key] ?: 0 }
    }
    val freqPersons = remember(records) {
        val cnt = LinkedHashMap<String, Int>()
        for (r in records) {
            if (r.person.isNotEmpty()) cnt[r.person] = (cnt[r.person] ?: 0) + 1
        }
        cnt.entries.sortedByDescending { it.value }.take(6).map { it.key }
    }

    fun submit() {
        val parsed = parseAmountInput(amount)
        if (!parsed.ok) {
            context.showToast(parsed.message)
            return
        }
        val cat = cats.firstOrNull { it.key == catKey }
        if (cat == null) {
            context.showToast("请选择分类")
            return
        }
        val sub = cat.subs.firstOrNull { it.key == subKey }
        if (sub == null) {
            context.showToast("请选择子分类")
            return
        }
        val snapshot = AddSnapshot(type, parsed.value, catKey, subKey, note, person.trim(), date, photo)
        scope.launch {
            val id = repo.addRecord(
                NewRecord(
                    type = type,
                    amount = parsed.value,
                    categoryKey = catKey,
                    categoryName = cat.name,
                    subcategoryKey = subKey,
                    subcategoryName = sub.name,
                    note = note,
                    date = date,
                    person = person.trim(),
                    photo = photo.ifEmpty { null },
                ),
            )
            val t = todayStr()
            autoDate = t
            focusManager.clearFocus()
            amount = ""
            catKey = ""
            subKey = ""
            note = ""
            person = ""
            photo = ""
            date = t
            undoRemain = 5
            undo = UndoState(
                id,
                "${if (type == "income") "收入" else "支出"} ¥${formatMoneyExact(parsed.value)}",
                snapshot,
            )
        }
    }

    fun undoLast() {
        val u = undo ?: return
        undo = null
        scope.launch {
            runCatching { repo.deleteRecord(u.id) }
            val s = u.snapshot
            type = s.type
            amount = jsNumberToString(s.amount)
            catKey = s.catKey
            subKey = s.subKey
            note = s.note
            person = s.person
            date = s.date
            photo = s.photo
            focusManager.clearFocus()
            context.showToast("已撤销，可改后重记")
        }
    }

    val imeVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val last = records.firstOrNull()

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().imePadding()) {
            // ===== 顶栏 =====
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "记一笔",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = c.tx),
                    )
                    MicroLabel("02 · ENTRY", modifier = Modifier.padding(top = 3.dp), color = c.dim)
                }
                Text(
                    dayName(date) + " " + mmddDot(date),
                    style = TextStyle(fontFamily = MonoFamily, fontSize = 11.sp, color = c.dim),
                )
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 14.dp),
            ) {
                // ===== A-01 金额 =====
                Panel {
                    ModuleHeader(id = "A-01", title = "金额", en = "AMOUNT") {
                        Seg(
                            options = listOf("expense" to "支出", "income" to "收入"),
                            selected = type,
                            onSelect = {
                                type = it
                                focusManager.clearFocus()
                            },
                            modifier = Modifier.width(150.dp),
                            height = 32.dp,
                            accent = if (type == "income") c.inc else c.acF,
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    LcdPanel(
                        amount = amount,
                        income = type == "income",
                        catLabel = currentCat?.name?.let { cn ->
                            cn + " · " + (subs.firstOrNull { it.key == subKey }?.name ?: "未选小类")
                        } ?: "未选分类 · NO CAT",
                        dateLabel = dayName(date) + " " + mmddDot(date),
                        personLabel = person.ifEmpty { "我" },
                    )
                    if (last != null) {
                        Spacer(Modifier.height(10.dp))
                        HLine()
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            MicroLabel("LAST", color = c.fnt)
                            Spacer(Modifier.width(10.dp))
                            Text(
                                last.subcategoryName.ifEmpty { last.categoryName },
                                style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.dim),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                (if (last.type == "income") "+" else "-") + "¥" + formatMoneyExact(last.amount),
                                style = TextStyle(fontFamily = MonoFamily, fontSize = 12.sp, color = c.tx),
                            )
                            Text(
                                mmddDot(last.date),
                                style = TextStyle(fontFamily = MonoFamily, fontSize = 10.sp, color = c.fnt),
                                modifier = Modifier.padding(start = 10.dp),
                            )
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))

                // ===== A-02 分类 =====
                Panel {
                    ModuleHeader(
                        id = "A-02",
                        title = "分类",
                        en = "CATEGORY",
                    ) {
                        if (currentCat != null) {
                            Box(
                                Modifier
                                    .background(c.acS)
                                    .border(1.dp, c.ac)
                                    .padding(horizontal = 7.dp, vertical = 3.dp),
                            ) {
                                Text(
                                    currentCat.name,
                                    style = TextStyle(fontFamily = SansFamily, fontSize = 10.5.sp, color = c.ac),
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                    if (freqCats.isNotEmpty()) {
                        Spacer(Modifier.height(12.dp))
                        MicroLabel("常用 · FREQUENT", color = c.fnt)
                        Spacer(Modifier.height(7.dp))
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            freqCats.forEach { cat ->
                                Chip(
                                    text = cat.name,
                                    selected = catKey == cat.key,
                                    onClick = {
                                        if (catKey != cat.key) {
                                            catKey = cat.key
                                            subKey = ""
                                        }
                                    },
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    // 6 列分类格
                    cats.chunked(6).forEach { rowCats ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            rowCats.forEach { cat ->
                                val on = catKey == cat.key
                                Column(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(56.dp)
                                        .background(if (on) c.acS else Color.Transparent)
                                        .border(1.dp, if (on) c.ac else c.ln)
                                        .clickable {
                                            if (catKey != cat.key) {
                                                catKey = cat.key
                                                subKey = ""
                                            }
                                            focusManager.clearFocus()
                                        },
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                ) {
                                    Icon(
                                        categoryIcon(cat.key),
                                        contentDescription = null,
                                        tint = if (on) c.ac else c.dim,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        cat.name,
                                        style = TextStyle(
                                            fontFamily = SansFamily,
                                            fontSize = 10.sp,
                                            color = if (on) c.tx else c.dim,
                                        ),
                                        maxLines = 1,
                                    )
                                }
                            }
                            repeat(6 - rowCats.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }

                    if (subs.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        MicroLabel("二级 · SUB", color = c.fnt)
                        Spacer(Modifier.height(7.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            subsSorted.forEach { sub ->
                                Chip(
                                    text = sub.name,
                                    selected = subKey == sub.key,
                                    onClick = {
                                        subKey = sub.key
                                        focusManager.clearFocus()
                                    },
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))

                // ===== A-03 详情 =====
                Panel {
                    ModuleHeader(id = "A-03", title = "详情", en = "DETAIL")
                    Spacer(Modifier.height(6.dp))
                    DetailRow("日期", if (date == todayStr()) "今天 · ${mmddDot(date)}" else date) {
                        focusManager.clearFocus()
                        showDatePicker = true
                    }
                    HLine()
                    Spacer(Modifier.height(10.dp))
                    MicroLabel("谁花的 · WHO（可选）", color = c.fnt)
                    Spacer(Modifier.height(7.dp))
                    if (freqPersons.isNotEmpty()) {
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            freqPersons.forEach { p ->
                                Chip(
                                    text = p,
                                    selected = person == p,
                                    onClick = { person = if (person == p) "" else p },
                                )
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                    BTextField(
                        value = person,
                        onValueChange = { person = it },
                        placeholder = "如：爸爸、妈妈、我...",
                        maxLength = 10,
                        textSize = 13.sp,
                    )
                    HLine(Modifier.padding(top = 6.dp))
                    Spacer(Modifier.height(10.dp))
                    MicroLabel("备注 · NOTE（可选）", color = c.fnt)
                    Spacer(Modifier.height(7.dp))
                    BTextField(
                        value = note,
                        onValueChange = { note = it },
                        placeholder = "可选：添加备注...",
                        maxLength = 200,
                        textSize = 13.sp,
                    )
                    HLine(Modifier.padding(top = 6.dp))
                    Spacer(Modifier.height(12.dp))
                    MicroLabel("小票 · RECEIPT（只存本机）", color = c.fnt)
                    Spacer(Modifier.height(8.dp))
                    if (photo.isNotEmpty()) {
                        Box {
                            PhotoThumb(path = photo, onClick = { photoPreview = true }, size = 68)
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .background(Color(0x99000000))
                                    .clickable {
                                        val old = photo
                                        photo = ""
                                        scope.launch { container.photos.delete(old) }
                                    }
                                    .padding(horizontal = 5.dp, vertical = 1.dp),
                            ) {
                                Text("×", style = TextStyle(fontFamily = MonoFamily, fontSize = 12.sp, color = Color.White))
                            }
                        }
                    } else {
                        MiniButton("拍小票 / 选照片", onClick = { showPhotoSheet = true })
                    }
                }

                Spacer(Modifier.height(16.dp))
            }

            // ===== 底部键盘（弹出输入法时让位） =====
            if (!imeVisible) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(c.bg)
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                ) {
                    Keypad(
                        onDigit = { d -> amount = sanitizeAmountInput(amount + d) },
                        onDot = { if (!amount.contains('.')) amount = sanitizeAmountInput(amount.ifEmpty { "0" } + ".") },
                        onBackspace = { amount = amount.dropLast(1) },
                        onClear = { amount = "" },
                        onDoubleZero = { amount = sanitizeAmountInput(amount + "00") },
                        onSave = { submit() },
                        income = type == "income",
                    )
                }
            }
        }

        // ===== 5 秒撤销条 =====
        val currentUndo = undo
        UndoToast(
            visible = currentUndo != null,
            message = "已记 " + (currentUndo?.label ?: ""),
            actionText = "${undoRemain}s 撤销",
            onAction = { undoLast() },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(horizontal = 14.dp, vertical = if (imeVisible) 14.dp else 258.dp),
        )
    }

    // ===== 日期选择 =====
    if (showDatePicker) {
        val initialMillis = (parseDate(date) ?: LocalDate.now())
            .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
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

    // ===== 照片来源 =====
    if (showPhotoSheet) {
        BDialog(title = "小票照片", en = "RECEIPT", onDismiss = { showPhotoSheet = false }) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        showPhotoSheet = false
                        val file = container.photos.newCameraFile()
                        cameraFile = file
                        runCatching { takePicture.launch(container.photos.uriFor(file)) }
                            .onFailure {
                                cameraFile = null
                                file.delete()
                                context.showToast("照片保存失败")
                            }
                    }
                    .padding(vertical = 14.dp),
            ) {
                Text("拍小票", style = TextStyle(fontFamily = SansFamily, fontSize = 14.sp, color = c.tx))
            }
            HLine()
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        showPhotoSheet = false
                        runCatching {
                            pickPhoto.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                            )
                        }.onFailure { context.showToast("照片保存失败") }
                    }
                    .padding(vertical = 14.dp),
            ) {
                Text("选照片", style = TextStyle(fontFamily = SansFamily, fontSize = 14.sp, color = c.tx))
            }
        }
    }

    // ===== 小票大图 =====
    if (photoPreview && photo.isNotEmpty()) {
        PhotoPreviewDialog(path = photo, onDismiss = { photoPreview = false })
    }
}

/** 数码管：扫描线 + 闪烁光标 + 右侧大号等宽金额。 */
@Composable
private fun LcdPanel(
    amount: String,
    income: Boolean,
    catLabel: String,
    dateLabel: String,
    personLabel: String,
) {
    val c = JiXuTheme.colors
    val ink = if (income) Color(0xFF5BF0B7) else c.lcdT
    val blink by rememberInfiniteTransition(label = "caret").animateFloat(
        initialValue = 1f,
        targetValue = 0.1f,
        animationSpec = infiniteRepeatable(tween(560, easing = Ease), RepeatMode.Reverse),
        label = "caretAlpha",
    )
    val now = remember { LocalTime.now() }
    val recTime = String.format(Locale.US, "%02d:%02d", now.hour, now.minute)
    val display = amount.ifEmpty { "0" }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(c.lcd)
            .border(1.dp, if (income) Color(0x2E5BF0B7) else Color(0x1FD4FF3F))
            .drawBehind {
                // 扫描线
                val step = 3.dp.toPx()
                var y = 0f
                while (y < size.height) {
                    drawLine(
                        color = Color.Black.copy(alpha = 0.18f),
                        start = Offset(0f, y),
                        end = Offset(size.width, y),
                        strokeWidth = 1.dp.toPx(),
                    )
                    y += step
                }
            }
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (income) "CH-02 · IN · INCOME" else "CH-01 · OUT · EXPENSE",
                style = TextStyle(fontFamily = MonoFamily, fontSize = 9.sp, letterSpacing = 1.2.sp, color = ink.copy(alpha = 0.6f)),
            )
            Spacer(Modifier.weight(1f))
            Text(
                "REC $recTime",
                style = TextStyle(fontFamily = MonoFamily, fontSize = 9.sp, letterSpacing = 1.2.sp, color = ink.copy(alpha = 0.6f)),
            )
        }
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                catLabel,
                style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = ink.copy(alpha = 0.55f)),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(bottom = 6.dp, end = 8.dp),
            )
            Text(
                "¥",
                style = TextStyle(fontFamily = MonoFamily, fontSize = 18.sp, color = ink.copy(alpha = 0.6f)),
                modifier = Modifier.padding(bottom = 6.dp, end = 6.dp),
            )
            Text(
                display,
                style = TextStyle(
                    fontFamily = MonoFamily,
                    fontSize = lcdSize(display),
                    fontWeight = FontWeight.Light,
                    letterSpacing = (-1).sp,
                    color = if (amount.isEmpty()) ink.copy(alpha = 0.28f) else ink,
                ),
                maxLines = 1,
            )
            Box(
                Modifier
                    .padding(start = 3.dp, bottom = 8.dp)
                    .size(width = 3.dp, height = 26.dp)
                    .background(ink.copy(alpha = blink)),
            )
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "$dateLabel · $personLabel",
                style = TextStyle(fontFamily = MonoFamily, fontSize = 10.5.sp, color = ink.copy(alpha = 0.7f)),
            )
            Spacer(Modifier.weight(1f))
            Text(
                if (income) "INCOME" else "EXPENSE",
                style = TextStyle(fontFamily = MonoFamily, fontSize = 9.sp, letterSpacing = 1.sp, color = ink.copy(alpha = 0.45f)),
            )
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String, onClick: () -> Unit) {
    val c = JiXuTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BiLabel(label, "DATE")
        Spacer(Modifier.weight(1f))
        Text(
            value,
            style = TextStyle(fontFamily = MonoFamily, fontSize = 12.5.sp, color = c.tx),
        )
        Text(
            "›",
            style = TextStyle(fontFamily = MonoFamily, fontSize = 14.sp, color = c.fnt),
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

/** 数码管字号随位数收敛，避免长金额把 ¥ 与光标挤出去。 */
private fun lcdSize(text: String) = when {
    text.length <= 7 -> 40.sp
    text.length <= 9 -> 34.sp
    text.length <= 11 -> 28.sp
    else -> 22.sp
}

private fun parseDate(value: String): LocalDate? =
    runCatching { LocalDate.parse(value) }.getOrNull()
