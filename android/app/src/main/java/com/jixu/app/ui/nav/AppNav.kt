package com.jixu.app.ui.nav

import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.jixu.app.JiXuApp
import com.jixu.app.ui.screens.add.AddScreen
import com.jixu.app.ui.screens.categories.CategoriesScreen
import com.jixu.app.ui.screens.common.Ease
import com.jixu.app.ui.screens.history.HistoryDrillDown
import com.jixu.app.ui.screens.history.HistoryScreen
import com.jixu.app.ui.screens.home.HomeScreen
import com.jixu.app.ui.screens.recurring.RecurringScreen
import com.jixu.app.ui.screens.savings.SavingsScreen
import com.jixu.app.ui.screens.stats.StatsScreen
import com.jixu.app.ui.screens.todos.TodosScreen
import com.jixu.app.ui.theme.JiXuTheme
import com.jixu.app.ui.theme.SansFamily
import com.jixu.app.ui.theme.UiStyle

private data class TabItem(
    val label: String,
    val route: String,
    val icon: ImageVector,
    /** 底栏中间那个凸起的「+」 */
    val raised: Boolean = false,
)

/** 底部 4 个页签（开发文档 §8）。二级页面从首页快捷入口进入，不带底栏。 */
private val tabs = listOf(
    TabItem("首页", "home", Icons.Filled.Home),
    TabItem("记一笔", "add", Icons.Filled.Add, raised = true),
    TabItem("账单", "history", Icons.AutoMirrored.Filled.ReceiptLong),
    TabItem("统计", "stats", Icons.Filled.BarChart),
)

private val tabRoutes = tabs.map { it.route }.toSet()

/** 页签间切换：短距离横向滑动 + 轻微淡入淡出；比默认淡入淡出更利落，也不会让旧页在下面停很久。 */
private const val TAB_SWITCH_ANIM_MS = 220

private fun tabIndex(route: String?): Int = tabs.indexOfFirst { it.route == route }

@Composable
fun JiXuNavHost(
    openTodos: Boolean = false,
    onOpenTodosHandled: () -> Unit = {},
) {
    val navController = rememberNavController()
    val colors = JiXuTheme.colors
    val context = LocalContext.current
    val container = (context.applicationContext as JiXuApp).container
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route

    // 点到期提醒通知直达待办页（已运行/冷启动都走这里）
    LaunchedEffect(openTodos) {
        if (openTodos) {
            navController.navigate("todos") { launchSingleTop = true }
            onOpenTodosHandled()
        }
    }

    var homeBadge by remember { mutableIntStateOf(0) }
    var historyDrillDown by remember { mutableStateOf<HistoryDrillDown?>(null) }

    val switchTab: (String) -> Unit = { route ->
        navController.navigate(route) {
            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
    val back: () -> Unit = { navController.popBackStack() }

    Scaffold(
        containerColor = colors.bg,
        bottomBar = {
            if (currentRoute in tabRoutes) {
                if (JiXuTheme.style == UiStyle.MINIAPP) {
                    MiniBottomBar(
                        current = currentRoute ?: "home",
                        badge = homeBadge,
                        onSelect = { route -> if (route != currentRoute) switchTab(route) },
                    )
                } else {
                    BottomBar(
                        current = currentRoute ?: "home",
                        badge = homeBadge,
                        onSelect = { route -> if (route != currentRoute) switchTab(route) },
                    )
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = tabs.first().route,
            modifier = Modifier.padding(innerPadding),
            enterTransition = {
                val fromIndex = tabIndex(initialState.destination.route)
                val toIndex = tabIndex(targetState.destination.route)
                if (fromIndex >= 0 && toIndex >= 0) {
                    // 底部页签：按页签顺序决定方向，幅度只占屏宽的 1/6，避免大位移造成晕眩
                    val direction = if (toIndex >= fromIndex) 1 else -1
                    slideInHorizontally(
                        animationSpec = tween(TAB_SWITCH_ANIM_MS, easing = Ease),
                        initialOffsetX = { width -> width * direction / 6 },
                    ) + fadeIn(tween(TAB_SWITCH_ANIM_MS - 40))
                } else {
                    slideInHorizontally(
                        animationSpec = tween(240, easing = Ease),
                        initialOffsetX = { width -> width / 5 },
                    ) + fadeIn(tween(180))
                }
            },
            exitTransition = {
                val fromIndex = tabIndex(initialState.destination.route)
                val toIndex = tabIndex(targetState.destination.route)
                if (fromIndex >= 0 && toIndex >= 0) {
                    val direction = if (toIndex >= fromIndex) 1 else -1
                    slideOutHorizontally(
                        animationSpec = tween(TAB_SWITCH_ANIM_MS, easing = Ease),
                        targetOffsetX = { width -> -width * direction / 8 },
                    ) + fadeOut(tween(TAB_SWITCH_ANIM_MS - 60))
                } else {
                    slideOutHorizontally(
                        animationSpec = tween(220, easing = Ease),
                        targetOffsetX = { width -> -width / 8 },
                    ) + fadeOut(tween(160))
                }
            },
            popEnterTransition = {
                slideInHorizontally(
                    animationSpec = tween(240, easing = Ease),
                    initialOffsetX = { width -> -width / 5 },
                ) + fadeIn(tween(180))
            },
            popExitTransition = {
                slideOutHorizontally(
                    animationSpec = tween(220, easing = Ease),
                    targetOffsetX = { width -> width / 5 },
                ) + fadeOut(tween(160))
            },
        ) {
            composable("home") {
                HomeScreen(
                    container = container,
                    onOpenAdd = { switchTab("add") },
                    onOpenHistory = { switchTab("history") },
                    onOpenStats = { switchTab("stats") },
                    onOpenTodos = { navController.navigate("todos") },
                    onOpenCategories = { navController.navigate("categories") },
                    onOpenRecurring = { navController.navigate("recurring") },
                    onOpenSavings = { navController.navigate("savings") },
                    onDueCount = { homeBadge = it },
                )
            }
            composable("add") {
                AddScreen(container)
            }
            composable("history") {
                HistoryScreen(
                    container = container,
                    drillDown = historyDrillDown,
                    onDrillDownConsumed = { historyDrillDown = null },
                )
            }
            composable("stats") {
                StatsScreen(
                    container = container,
                    onDrillDown = { month, key, name ->
                        historyDrillDown = HistoryDrillDown(month, key, name)
                        switchTab("history")
                    },
                )
            }
            composable("todos") {
                TodosScreen(container = container, onBack = back)
            }
            composable("categories") {
                CategoriesScreen(container = container, onBack = back)
            }
            composable("recurring") {
                RecurringScreen(container = container, onBack = back)
            }
            composable("savings") {
                SavingsScreen(container = container, onBack = back)
            }
        }
    }
}

/**
 * B 底栏：1dp 顶线 + 4 个等宽位；「记一笔」做成凸起的圆形 +。
 * 选中：图标与顶部 2dp 短条用强调色，文字回到主文字色。
 */
@Composable
private fun BottomBar(
    current: String,
    badge: Int,
    onSelect: (String) -> Unit,
) {
    val c = JiXuTheme.colors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(c.bg)
            .navigationBarsPadding(),
    ) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.ln))
        Row(
            modifier = Modifier.fillMaxWidth().height(62.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            tabs.forEach { tab ->
                val on = current == tab.route
                if (tab.raised) {
                    RaisedAdd(
                        selected = on,
                        onClick = { onSelect(tab.route) },
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clickable { onSelect(tab.route) },
                    ) {
                        // 顶部 2dp 短条：选中态
                        val barAlpha by animateFloatAsState(if (on) 1f else 0f, tween(200), label = "bar")
                        Box(
                            Modifier
                                .align(Alignment.TopCenter)
                                .padding(top = 0.dp)
                                .size(width = 26.dp, height = 2.dp)
                                .background(c.ac.copy(alpha = barAlpha)),
                        )
                        Column(
                            modifier = Modifier.align(Alignment.Center),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    tab.icon,
                                    contentDescription = tab.label,
                                    tint = if (on) c.ac else c.dim,
                                    modifier = Modifier.size(21.dp),
                                )
                                if (tab.route == "home" && badge > 0) {
                                    Box(
                                        modifier = Modifier
                                            .offset(x = 11.dp, y = (-9).dp)
                                            .size(6.dp)
                                            .clip(CircleShape)
                                            .background(c.cor),
                                    )
                                }
                            }
                            Spacer(Modifier.height(5.dp))
                            Text(
                                tab.label,
                                style = TextStyle(
                                    fontFamily = SansFamily,
                                    fontSize = 10.sp,
                                    color = if (on) c.tx else c.dim,
                                ),
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** 小程序风底栏：四项等宽普通页签，无凸起「+」，白底 + 细线。 */
@Composable
private fun MiniBottomBar(
    current: String,
    badge: Int,
    onSelect: (String) -> Unit,
) {
    val c = JiXuTheme.colors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(c.p1)
            .navigationBarsPadding(),
    ) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.ln))
        Row(
            modifier = Modifier.fillMaxWidth().height(62.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            tabs.forEach { tab ->
                val on = current == tab.route
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clickable { onSelect(tab.route) },
                ) {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                tab.icon,
                                contentDescription = tab.label,
                                tint = if (on) c.ac else c.dim,
                                modifier = Modifier.size(22.dp),
                            )
                            if (tab.route == "home" && badge > 0) {
                                Box(
                                    modifier = Modifier
                                        .offset(x = 11.dp, y = (-9).dp)
                                        .size(6.dp)
                                        .clip(CircleShape)
                                        .background(c.cor),
                                )
                            }
                        }
                        Spacer(Modifier.height(5.dp))
                        Text(
                            tab.label,
                            style = TextStyle(
                                fontFamily = SansFamily,
                                fontSize = 10.sp,
                                fontWeight = if (on) FontWeight.Medium else FontWeight.Normal,
                                color = if (on) c.ac else c.dim,
                            ),
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RaisedAdd(selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = JiXuTheme.colors
    Box(modifier) {
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(y = (-20).dp)
                .size(56.dp)
                .clip(CircleShape)
                .background(c.acF)
                .border(4.dp, c.bg, CircleShape)
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Add,
                contentDescription = "记一笔",
                tint = c.onAc,
                modifier = Modifier.size(26.dp),
            )
        }
        Text(
            "记一笔",
            style = TextStyle(
                fontFamily = SansFamily,
                fontSize = 10.sp,
                color = if (selected) c.tx else c.dim,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            ),
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 9.dp),
        )
    }
}
