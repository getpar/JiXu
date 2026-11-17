package com.jixu.app.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jixu.app.data.db.RecordEntity
import com.jixu.app.ui.screens.common.EmptyLine
import com.jixu.app.ui.screens.common.HLine
import com.jixu.app.ui.screens.common.MicroLabel
import com.jixu.app.ui.screens.common.ModuleHeader
import com.jixu.app.ui.screens.common.Panel
import com.jixu.app.ui.screens.common.RowItem
import com.jixu.app.ui.screens.common.mmddDot
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.SansFamily

@Composable
internal fun HomeRecentCard(
    recent: List<RecordEntity>,
    onOpenHistory: () -> Unit,
    onPreviewPhoto: (String) -> Unit,
) {
    val c = JiXuTheme.colors
    // ===== M-03 最近记录 =====
    Panel(contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
        Row(
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ModuleHeader(id = "M-03", title = "最近记录", en = "RECENT") {
                Text(
                    "全部 ›",
                    style = TextStyle(fontFamily = SansFamily, fontSize = 12.sp, color = c.dim),
                    modifier = Modifier
                        .clickable(onClick = onOpenHistory)
                        .padding(vertical = 6.dp, horizontal = 2.dp),
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        if (recent.isEmpty()) {
            EmptyLine("暂无记录，去记一笔吧")
        } else {
            recent.forEachIndexed { index, r ->
                if (index > 0) HLine(Modifier.padding(horizontal = 16.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onOpenHistory)
                        .padding(horizontal = 16.dp),
                ) {
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
                        modifier = Modifier.weight(1f),
                    ) {
                        if (!r.photo.isNullOrEmpty()) {
                            Text(
                                "凭证",
                                style = TextStyle(fontFamily = SansFamily, fontSize = 11.sp, color = c.ac),
                                modifier = Modifier
                                    .padding(start = 8.dp, top = 3.dp)
                                    .clickable { onPreviewPhoto(r.photo) },
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(6.dp))
    }
}

@Composable
internal fun HomeQuickActions(
    mini: Boolean,
    budget: Double,
    onOpenAdd: () -> Unit,
    onOpenTodos: () -> Unit,
    onEditBudget: () -> Unit,
    onOpenCategories: () -> Unit,
    onOpenRecurring: () -> Unit,
    onOpenStats: () -> Unit,
) {
    val c = JiXuTheme.colors
    // ===== 快捷入口 =====
    val actions: List<Pair<String, String>> = listOf(
        "记一笔" to "ADD",
        "待办" to "TODO",
        (if (budget > 0) "预算" else "设预算") to "BUDGET",
        "分类" to "CATS",
        "周期" to "CYCLE",
        "统计" to "STATS",
    )
    val handlers: List<() -> Unit> = listOf(
        onOpenAdd,
        onOpenTodos,
        {
            onEditBudget()
        },
        onOpenCategories,
        onOpenRecurring,
        onOpenStats,
    )
    actions.chunked(3).forEachIndexed { rowIndex, row ->
        if (rowIndex > 0) Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            row.forEachIndexed { i, (label, en) ->
                val global = rowIndex * 3 + i
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clip(if (mini) RoundedCornerShape(14.dp) else RoundedCornerShape(0.dp))
                        .background(c.p1)
                        .border(1.dp, c.ln, if (mini) RoundedCornerShape(14.dp) else RoundedCornerShape(0.dp))
                        .clickable { handlers[global]() }
                        .padding(horizontal = 12.dp, vertical = if (mini) 15.dp else 11.dp),
                ) {
                    Text(
                        label,
                        style = TextStyle(fontFamily = SansFamily, fontSize = 13.sp, color = c.tx),
                    )
                    MicroLabel(en, modifier = Modifier.padding(top = 3.dp), color = c.fnt)
                }
            }
        }
    }
}
