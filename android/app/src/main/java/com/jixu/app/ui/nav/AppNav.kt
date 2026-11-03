package com.jixu.app.ui.nav

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
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

@Composable
fun JiXuNavHost() {
    val navController = rememberNavController()
    val colors = JiXuTheme.colors
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route

    Scaffold(
        containerColor = colors.bg,
        bottomBar = {
            NavigationBar(containerColor = colors.card) {
                tabs.forEach { tab ->
                    val selected = currentRoute == tab.route
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            if (!selected) {
                                navController.navigate(tab.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
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
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = tabs.first().route,
            modifier = Modifier.padding(innerPadding),
        ) {
            tabs.forEach { tab ->
                composable(tab.route) {
                    // P0 只放页面标题，具体界面在 P5~P6 实现
                    TabPlaceholder(tab.label)
                }
            }
        }
    }
}

@Composable
private fun TabPlaceholder(title: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 14.dp, vertical = 18.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            color = JiXuTheme.colors.text,
        )
    }
}
