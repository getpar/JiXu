package com.jixu.app.ui.screens.add

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.AppContainer
import com.jixu.app.core.AMOUNT_INPUT_MAX_LENGTH
import com.jixu.app.core.CategoryGroup
import com.jixu.app.core.jsNumberToString
import com.jixu.app.core.localDateStr
import com.jixu.app.core.parseAmountInput
import com.jixu.app.core.sanitizeAmountInput
import com.jixu.app.data.NewRecord
import com.jixu.app.data.db.RecordEntity
import com.jixu.app.ui.screens.common.JxCard
import com.jixu.app.ui.screens.common.JxChip
import com.jixu.app.ui.screens.common.JxLabel
import com.jixu.app.ui.screens.common.JxTextField
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.screens.common.todayStr
import com.jixu.app.ui.theme.JiXuTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.math.ceil

private data class AddSnapshot(
    val type: String,
    val amount: Double,
    val catKey: String,
    val subKey: String,
    val note: String,
    val person: String,
    val date: String,
)

private data class UndoState(val id: String, val label: String, val snapshot: AddSnapshot)

/**
 * 记一笔（开发文档 §8.2，参照 miniapp/src/pages/add/index.tsx）。
 * 小票照片在 P7 接入；保存不等待网络（每次输入过 sanitizeAmountInput，提交过 parseAmountInput）。
 */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun AddScreen(container: AppContainer) {
    val colors = JiXuTheme.colors
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val repo = container.repository
    val records by repo.observeAliveRecords().collectAsStateWithLifecycle(emptyList())

    var type by rememberSaveable { mutableStateOf("expense") }
    var amount by rememberSaveable { mutableStateOf("") }
    var date by rememberSaveable { mutableStateOf(todayStr()) }
    var catKey by rememberSaveable { mutableStateOf("") }
    var subKey by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    var person by rememberSaveable { mutableStateOf("") }
    var autoDate by rememberSaveable { mutableStateOf(todayStr()) }
    var cats by remember { mutableStateOf<List<CategoryGroup>>(emptyList()) }
    var catMenuOpen by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var undo by remember { mutableStateOf<UndoState?>(null) }
    var undoRemain by remember { mutableIntStateOf(5) }

    val focusRequester = remember { FocusRequester() }

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

    LaunchedEffect(Unit) {
        runCatching { focusRequester.requestFocus() }
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
        val snapshot = AddSnapshot(type, parsed.value, catKey, subKey, note, person.trim(), date)
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
            date = t
            undoRemain = 5
            undo = UndoState(id, "${if (type == "income") "收入" else "支出"} ¥${com.jixu.app.core.formatMoneyExact(parsed.value)}", snapshot)
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
            focusManager.clearFocus()
            context.showToast("已撤销，可改后重记")
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 14.dp),
        ) {
            Spacer(Modifier.height(10.dp))

            // ===== 支出 / 收入 =====
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(colors.soft)
                    .padding(3.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                listOf("expense" to "支出", "income" to "收入").forEach { (key, label) ->
                    val selected = type == key
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(6.dp))
                            .background(
                                if (selected) {
                                    if (key == "income") colors.inc else colors.exp
                                } else {
                                    Color.Transparent
                                },
                            )
                            .clickable { type = key }
                            .padding(vertical = 10.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            label,
                            fontSize = 14.sp,
                            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                            color = if (selected) Color.White else colors.sub,
                        )
                    }
                }
            }

            Spacer(Modifier.height(10.dp))

            // ===== 金额 =====
            JxCard {
                JxLabel("金额")
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("¥", fontSize = 26.sp, fontWeight = FontWeight.Medium, color = colors.accent)
                    Spacer(Modifier.width(8.dp))
                    JxTextField(
                        value = amount,
                        onValueChange = { amount = sanitizeAmountInput(it) },
                        placeholder = "0.00",
                        maxLength = AMOUNT_INPUT_MAX_LENGTH,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        textSize = 26.sp,
                        modifier = Modifier
                            .weight(1f)
                            .focusRequester(focusRequester),
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            // ===== 日期 =====
            JxCard {
                JxLabel("日期")
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            focusManager.clearFocus()
                            showDatePicker = true
                        }
                        .padding(vertical = 6.dp),
                ) {
                    Text(date, fontSize = 15.sp, color = colors.text, modifier = Modifier.weight(1f))
                    Text("›", fontSize = 18.sp, color = colors.faint)
                }
            }

            Spacer(Modifier.height(10.dp))

            // ===== 一级分类 =====
            JxCard {
                JxLabel("一级分类")
                Box {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                focusManager.clearFocus()
                                catMenuOpen = true
                            }
                            .padding(vertical = 6.dp),
                    ) {
                        Text(
                            currentCat?.name ?: "选择大类",
                            fontSize = 15.sp,
                            color = if (currentCat != null) colors.text else colors.faint,
                            modifier = Modifier.weight(1f),
                        )
                        Text("›", fontSize = 18.sp, color = colors.faint)
                    }
                    DropdownMenu(expanded = catMenuOpen, onDismissRequest = { catMenuOpen = false }) {
                        cats.forEach { c ->
                            DropdownMenuItem(
                                text = { Text(c.name, color = if (c.key == catKey) colors.accent else colors.text) },
                                onClick = {
                                    if (catKey != c.key) {
                                        catKey = c.key
                                        subKey = ""
                                    }
                                    catMenuOpen = false
                                },
                            )
                        }
                    }
                }
                if (freqCats.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        freqCats.forEach { c ->
                            JxChip(c.name, selected = catKey == c.key, onClick = {
                                if (catKey != c.key) {
                                    catKey = c.key
                                    subKey = ""
                                }
                            })
                        }
                    }
                }
            }

            // ===== 二级分类 =====
            if (currentCat != null) {
                Spacer(Modifier.height(10.dp))
                JxCard {
                    JxLabel("二级分类")
                    Spacer(Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        subsSorted.forEach { s ->
                            JxChip(s.name, selected = subKey == s.key, onClick = { subKey = s.key })
                        }
                    }
                }
            }

            Spacer(Modifier.height(10.dp))

            // ===== 谁花的（可选） =====
            JxCard {
                JxLabel("谁花的（可选）")
                if (freqPersons.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        freqPersons.forEach { p ->
                            JxChip(p, selected = person == p, onClick = {
                                person = if (person == p) "" else p
                            })
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                JxTextField(
                    value = person,
                    onValueChange = { person = it },
                    placeholder = "如：爸爸、妈妈、我...",
                    maxLength = 10,
                    textSize = 14.sp,
                )
            }

            Spacer(Modifier.height(10.dp))

            // ===== 备注 =====
            JxCard {
                JxLabel("备注")
                Spacer(Modifier.height(4.dp))
                JxTextField(
                    value = note,
                    onValueChange = { note = it },
                    placeholder = "可选：添加备注...",
                    maxLength = 200,
                    textSize = 14.sp,
                )
            }

            Spacer(Modifier.height(18.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(colors.accent)
                    .clickable { submit() }
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("保存记录", fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Color.White)
            }

            Spacer(Modifier.height(90.dp))
        }

        // ===== 5 秒撤销条 =====
        val currentUndo = undo
        if (currentUndo != null) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(14.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(colors.text)
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Text(
                    "已记 ${currentUndo.label}",
                    fontSize = 13.sp,
                    color = colors.bg,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    "${undoRemain}s 撤销",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = colors.accent3,
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .clickable { undoLast() }
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
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
}

private fun parseDate(value: String): LocalDate? =
    runCatching { LocalDate.parse(value) }.getOrNull()
