package com.jixu.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.jixu.app.ui.nav.JiXuNavHost
import com.jixu.app.ui.theme.JiXuTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            JiXuTheme {
                JiXuNavHost()
            }
        }
    }
}
