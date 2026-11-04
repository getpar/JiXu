package com.jixu.app.ui.nav

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
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
import com.jixu.app.ui.screens.history.HistoryDrillDown
import com.jixu.app.ui.screens.history.HistoryScreen
import com.jixu.app.ui.screens.home.HomeScreen
import com.jixu.app.ui.screens.recurring.RecurringScreen
import com.jixu.app.ui.screens.stats.StatsScreen
import com.jixu.app.ui.screens.todos.TodosScreen
import com.jixu.app.ui.theme.JiXuTheme

private data class TabItem(
    val label: String,
    val route: String,
    val icon: ImageVector,
)

/** 底部 4 个页签（开发文档 §8）。二级页面从首页快捷入口进入，不带底栏。 */
private val tabs = listOf(
    TabItem("首页", "home", Icons.Filled.Home),
    TabItem("记一笔", "add", Icons.Filled.AddCircle),
    TabItem("账单", "history", Icons.AutoMirrored.Filled.ReceiptLong),
    TabItem("统计", "stats", Icons.Filled.PieChart),
)

private val tabRoutes = tabs.map { it.route }.toSet()

@Composable
fun JiXuNavHost() {
    val navController = rememberNavController()
    val colors = JiXuTheme.colors
    val context = LocalContext.current
    val container = (context.applicationContext as JiXuApp).container
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route

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
                NavigationBar(containerColor = colors.card) {
                    tabs.forEach { tab ->
                        val selected = currentRoute == tab.route
                        NavigationBarItem(
                            selected = selected,
                            onClick = { if (!selected) switchTab(tab.route) },
                            icon = {
                                if (tab.route == "home" && homeBadge > 0) {
                                    BadgedBox(
                                        badge = {
                                            Badge {
                                                Text(if (homeBadge > 99) "99+" else homeBadge.toString(), fontSize = 9.sp)
                                            }
                                        },
                                    ) { Icon(tab.icon, contentDescription = tab.label) }
                                } else {
                                    Icon(tab.icon, contentDescription = tab.label)
                                }
                            },
                            label = { Text(tab.label) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = colors.accent,
                                selectedTextColor = colors.accent,
                                indicatorColor = colors.accentSoft,
                                unselectedIconColor = colors.muted,
                                unselectedTextColor = colors.sub,
                            ),
                        )
                    }
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = tabs.first().route,
            modifier = Modifier.padding(innerPadding),
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
        }
    }
}
