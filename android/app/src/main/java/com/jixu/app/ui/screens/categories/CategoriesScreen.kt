package com.jixu.app.ui.screens.categories

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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.AppContainer
import com.jixu.app.core.CustomCategory
import com.jixu.app.core.mergedCategories
import com.jixu.app.ui.screens.common.BConfirm
import com.jixu.app.ui.screens.common.BTextField
import com.jixu.app.ui.screens.common.BTopBar
import com.jixu.app.ui.screens.common.HLine
import com.jixu.app.ui.screens.common.MicroLabel
import com.jixu.app.ui.screens.common.MiniButton
import com.jixu.app.ui.screens.common.ModuleHeader
import com.jixu.app.ui.screens.common.Panel
import com.jixu.app.ui.screens.common.categoryIcon
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.MonoFamily
import com.jixu.app.ui.theme.SansFamily
import kotlinx.coroutines.launch

/**
 * 分类管理（开发文档 §8.5）：自定义分类只存本机；Room Flow 自动刷新。
 * 默认分类不可删除，自定义分类带 ×。
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CategoriesScreen(container: AppContainer, onBack: () -> Unit) {
    val c = JiXuTheme.colors
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val repo = container.repository

    val customFlow = remember { repo.observeCustomCategories() }
    val customRows by customFlow.collectAsStateWithLifecycle(emptyList())
    val cats = remember(customRows) {
        mergedCategories(
            customRows.map { CustomCategory(it.categoryKey, it.categoryName, it.subcategoryKey, it.subcategoryName) },
        )
    }
    val customKeys = remember(customRows) { customRows.mapTo(HashSet()) { it.subcategoryKey } }

    var showNewMajor by rememberSaveable { mutableStateOf(false) }
    var newMajorName by rememberSaveable { mutableStateOf("") }
    var newSubName by rememberSaveable { mutableStateOf("") }
    var editingGroup by remember { mutableStateOf<String?>(null) }
    var subName by rememberSaveable { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf<String?>(null) }
    var lastStamp by remember { mutableLongStateOf(System.currentTimeMillis()) }

    fun nextStamp(): Long {
        val now = System.currentTimeMillis()
        val next = if (now > lastStamp) now else lastStamp + 1
        lastStamp = next
        return next
    }

    fun addMajor() {
        val mn = newMajorName.trim()
        val sn = newSubName.trim()
        if (mn.isEmpty()) {
            context.showToast("请输入大类名称")
            return
        }
        if (sn.isEmpty()) {
            context.showToast("请输入小类名称")
            return
        }
        val majorKey = "custom_${nextStamp()}"
        val subKey = "${majorKey}_${nextStamp()}"
        focusManager.clearFocus()
        scope.launch {
            repo.addCustomCategory(majorKey, mn, subKey, sn)
            showNewMajor = false
            newMajorName = ""
            newSubName = ""
            context.showToast("已添加")
        }
    }

    fun addSub(majorKey: String) {
        val name = subName.trim()
        if (name.isEmpty()) {
            context.showToast("请输入分类名")
            return
        }
        val major = cats.firstOrNull { it.key == majorKey } ?: return
        val subKey = "${majorKey}_${nextStamp()}"
        focusManager.clearFocus()
        scope.launch {
            repo.addCustomCategory(majorKey, major.name, subKey, name)
            editingGroup = null
            subName = ""
            context.showToast("已添加")
        }
    }

    Column(Modifier.fillMaxSize()) {
        BTopBar(title = "分类管理", en = "05 · CATS", onBack = onBack) {
            MiniButton("+ 新大类", onClick = {
                showNewMajor = true
                newMajorName = ""
                newSubName = ""
                editingGroup = null
            })
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 14.dp),
        ) {
            Spacer(Modifier.height(4.dp))

            if (showNewMajor) {
                Panel {
                    ModuleHeader(id = "C-NEW", title = "新大类", en = "NEW GROUP")
                    Spacer(Modifier.height(12.dp))
                    MicroLabel("大类名称 · GROUP", color = c.fnt)
                    BTextField(
                        value = newMajorName,
                        onValueChange = { newMajorName = it },
                        placeholder = "如：育儿",
                        maxLength = 10,
                        textSize = 14.sp,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                    HLine(Modifier.padding(top = 6.dp))
                    Spacer(Modifier.height(12.dp))
                    MicroLabel("小类名称 · SUB", color = c.fnt)
                    BTextField(
                        value = newSubName,
                        onValueChange = { newSubName = it },
                        placeholder = "如：猫粮",
                        maxLength = 10,
                        textSize = 14.sp,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                    HLine(Modifier.padding(top = 6.dp))
                    Spacer(Modifier.height(14.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Spacer(Modifier.weight(1f))
                        MiniButton("取消", onClick = {
                            showNewMajor = false
                            newMajorName = ""
                            newSubName = ""
                        })
                        MiniButton("确认添加", onClick = { addMajor() }, primary = true)
                    }
                }
                Spacer(Modifier.height(10.dp))
            }

            cats.forEachIndexed { index, cat ->
                Panel {
                    ModuleHeader(
                        id = "C-" + (index + 1).toString().padStart(2, '0'),
                        title = cat.name,
                        en = "CATEGORY · ${cat.subs.size}",
                    ) {
                        Text(
                            if (editingGroup == cat.key) "取消" else "+ 添加小类",
                            style = TextStyle(
                                fontFamily = SansFamily,
                                fontSize = 12.sp,
                                color = if (editingGroup == cat.key) c.dim else c.ac,
                            ),
                            modifier = Modifier
                                .clickable {
                                    editingGroup = if (editingGroup == cat.key) null else cat.key
                                    subName = ""
                                }
                                .padding(vertical = 6.dp),
                        )
                    }

                    if (editingGroup == cat.key) {
                        Spacer(Modifier.height(10.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            BTextField(
                                value = subName,
                                onValueChange = { subName = it },
                                placeholder = "小类名称",
                                maxLength = 8,
                                textSize = 13.sp,
                                modifier = Modifier.weight(1f),
                            )
                            Spacer(Modifier.width(10.dp))
                            MiniButton("确认", onClick = { addSub(cat.key) }, primary = true)
                        }
                        HLine(Modifier.padding(top = 6.dp))
                    }

                    Spacer(Modifier.height(12.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        cat.subs.forEach { sub ->
                            val custom = sub.key in customKeys
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .height(30.dp)
                                    .background(c.p3)
                                    .border(1.dp, c.ln)
                                    .padding(start = 9.dp, end = if (custom) 4.dp else 9.dp),
                            ) {
                                Text(
                                    sub.name,
                                    style = TextStyle(fontFamily = SansFamily, fontSize = 11.5.sp, color = c.dim),
                                )
                                if (custom) {
                                    Icon(
                                        Icons.Filled.Close,
                                        contentDescription = "删除",
                                        tint = c.fnt,
                                        modifier = Modifier
                                            .padding(start = 4.dp)
                                            .size(16.dp)
                                            .clickable { confirmDelete = sub.key }
                                            .padding(2.dp),
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
            }

            Panel(flat = true, contentPadding = PaddingValues(0.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(6.dp).background(c.fnt))
                    Text(
                        "带 × 号的可删除（自定义分类），其余为默认分类不可删除",
                        style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.fnt),
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
        }
    }

    confirmDelete?.let { subKey ->
        BConfirm(
            title = "确定删除？",
            message = "删除后该分类不再出现在记账页，已记录的账保持不变",
            confirmText = "删除",
            onDismiss = { confirmDelete = null },
            onConfirm = {
                confirmDelete = null
                scope.launch { repo.deleteCustomCategory(subKey) }
            },
        )
    }
}
