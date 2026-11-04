package com.jixu.app.ui.screens.common

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.jixu.app.JiXuApp
import com.jixu.app.ui.theme.JiXuTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** 小票照片展示（§12）：缩略图 + 全屏大图，全部按需采样解码。 */

@Composable
fun rememberPhoto(path: String?, maxSide: Int): Bitmap? {
    val context = LocalContext.current
    val store = (context.applicationContext as JiXuApp).container.photos
    val state by produceState<Bitmap?>(initialValue = null, path) {
        value = if (path.isNullOrEmpty()) {
            null
        } else {
            withContext(Dispatchers.IO) { store.decodeSampled(path, maxSide) }
        }
    }
    return state
}

@Composable
fun PhotoThumb(path: String, onClick: () -> Unit, size: Int = 64) {
    val bitmap = rememberPhoto(path, 320)
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(JiXuTheme.colors.soft)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = "小票照片",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Text("照片", fontSize = 11.sp, color = JiXuTheme.colors.faint)
        }
    }
}

/** 点「凭证」后的全屏大图，点任意处关闭 */
@Composable
fun PhotoPreviewDialog(path: String, onDismiss: () -> Unit) {
    val bitmap = rememberPhoto(path, 2048)
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(520.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFF101114))
                .clickable(onClick = onDismiss),
            contentAlignment = Alignment.Center,
        ) {
            if (bitmap != null) {
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = "小票照片",
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(6.dp),
                    contentScale = ContentScale.Fit,
                )
            } else {
                Text("照片已不存在", fontSize = 13.sp, color = Color.White.copy(alpha = 0.7f))
            }
        }
    }
}
