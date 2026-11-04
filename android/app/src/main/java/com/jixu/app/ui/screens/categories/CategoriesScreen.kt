package com.jixu.app.ui.screens.categories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jixu.app.AppContainer
import com.jixu.app.core.CustomCategory
import com.jixu.app.core.mergedCategories
import com.jixu.app.ui.screens.common.JxCard
import com.jixu.app.ui.screens.common.JxConfirmDialog
import com.jixu.app.ui.screens.common.JxLabel
import com.jixu.app.ui.screens.common.JxLink
import com.jixu.app.ui.screens.common.JxSmallAction
import com.jixu.app.ui.screens.common.JxTextField
import com.jixu.app.ui.screens.common.JxTitle
import com.jixu.app.ui.screens.common.JxTopBar
import com.jixu.app.ui.screens.common.showToast
import com.jixu.app.ui.theme.JiXuTheme
import kotlinx.coroutines.launch

/**
 * 分类管理（开发文档 §8.5，参照 miniapp/src/pages/categories/index.tsx）。
 * 自定义分类只存本机；Room Flow 自动刷新。
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CategoriesScreen(container: AppContainer, onBack: () -> Unit) {
    val colors = JiXuTheme.colors
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
        JxTopBar(title = "分类管理", onBack = onBack) {
            JxLink("+ 新大类", onClick = {
                showNewMajor = true
                newMajorName = ""
                newSubName = ""
                editingGroup = null
            }, size = 13.sp)
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
                JxCard {
                    JxTitle("添加新大类及第一个小类")
                    Spacer(Modifier.height(12.dp))
                    JxLabel("大类名称")
                    JxTextField(
                        value = newMajorName,
                        onValueChange = { newMajorName = it },
                        placeholder = "如：育儿",
                        maxLength = 10,
                    )
                    Spacer(Modifier.height(10.dp))
                    JxLabel("小类名称")
                    JxTextField(
                        value = newSubName,
                        onValueChange = { newSubName = it },
                        placeholder = "如：猫粮",
                        maxLength = 10,
                    )
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(20.dp), modifier = Modifier.fillMaxWidth()) {
                        Spacer(Modifier.weight(1f))
                        JxLink("取消", onClick = {
                            showNewMajor = false
                            newMajorName = ""
                            newSubName = ""
                        }, color = colors.sub, size = 14.sp)
                        JxLink("确认添加", onClick = { addMajor() }, size = 14.sp)
                    }
                }
                Spacer(Modifier.height(10.dp))
            }

            cats.forEach { cat ->
                JxCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        JxTitle(cat.name, Modifier.weight(1f))
                        JxLink(
                            if (editingGroup == cat.key) "取消" else "+ 添加小类",
                            onClick = {
                                editingGroup = if (editingGroup == cat.key) null else cat.key
                                subName = ""
                            },
                            color = if (editingGroup == cat.key) colors.sub else colors.accent,
                            size = 12.sp,
                        )
                    }

                    if (editingGroup == cat.key) {
                        Spacer(Modifier.height(10.dp))
                        JxLabel("添加到「${cat.name}」")
                        Spacer(Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            JxTextField(
                                value = subName,
                                onValueChange = { subName = it },
                                placeholder = "小类名称",
                                maxLength = 8,
                                modifier = Modifier.weight(1f),
                            )
                            Spacer(Modifier.width(10.dp))
                            JxSmallAction("确认", onClick = { addSub(cat.key) })
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        cat.subs.forEach { sub ->
                            val custom = sub.key in customKeys
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(colors.soft)
                                    .padding(horizontal = 8.dp, vertical = 5.dp),
                            ) {
                                Text(sub.name, fontSize = 12.sp, color = colors.sub)
                                if (custom) {
                                    Spacer(Modifier.width(4.dp))
                                    Text(
                                        "×",
                                        fontSize = 14.sp,
                                        color = colors.muted,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(99.dp))
                                            .clickable { confirmDelete = sub.key }
                                            .padding(horizontal = 3.dp),
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
            }

            Text(
                "带 × 号的可删除（自定义分类），其余为默认分类不可删除",
                fontSize = 11.sp,
                color = colors.faint,
                modifier = Modifier.padding(vertical = 4.dp),
            )
            Spacer(Modifier.height(20.dp))
        }
    }

    confirmDelete?.let { subKey ->
        JxConfirmDialog(
            title = "确定删除？",
            onDismiss = { confirmDelete = null },
            onConfirm = {
                confirmDelete = null
                scope.launch { repo.deleteCustomCategory(subKey) }
            },
        )
    }
}
